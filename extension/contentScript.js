(function () {
  if (window.__sidebyContentInjected) {
    return;
  }

  window.__sidebyContentInjected = true;

  const DETECT_THROTTLE_MS = 300;
  const FALLBACK_RETRY_MS = 250;
  const observedVideoRequests = new Map();
  const blobUrlToSourceUrl = new Map();
  const mediaSourceToUrl = new WeakMap();
  const sourceBufferToMediaSource = new WeakMap();
  const sourceBufferToUrl = new WeakMap();
  const SNIFFER_EVENT = 'sideby:sniffer';
  let lastRecordedVideoRequest = { url: '', time: 0 };
  let latestVideos = [];
  let lastNonEmptyVideos = [];
  let lastNonEmptyPageUrl = '';
  let detectTimeoutId = null;

  function qualityValue(label) {
    if (!label) return 0;
    const m = /([0-9]{3,4})/.exec(label);
    const n = m ? Number(m[1]) : 0;
    return Number.isFinite(n) ? n : 0;
  }

  function inferQuality(url) {
    if (typeof url !== 'string') return undefined;
    const lower = url.toLowerCase();

    // UHD marker
    if (/(^|[^a-z0-9])(uhd|4k)([^a-z0-9]|$)/i.test(lower)) return '2160p';

    const candidates = [];

    // 1920x1080, 2560x1440, etc.
    for (const match of lower.matchAll(/(\d{3,4})x(\d{3,4})/g)) {
      const h = Number(match[2]);
      if (h >= 240 && h <= 4320) candidates.push(h);
    }

    // 1080p, 720p
    for (const match of lower.matchAll(/(\d{3,4})p(?![a-z])/g)) {
      const v = Number(match[1]);
      if (v >= 240 && v <= 4320) candidates.push(v);
    }

    // bare numbers that look like resolutions
    for (const match of lower.matchAll(/(^|[^\d])(4320|2880|2160|1440|1080|720|540|480|360|240)(?=[^\d]|$)/g)) {
      const v = Number(match[2]);
      candidates.push(v);
    }

    if (!candidates.length) return undefined;
    const best = Math.max(...candidates);
    return `${best}p`;
  }

  function isLikelyVideoRequest(url, contentType) {
    if (typeof url !== 'string') return false;
    const lower = url.toLowerCase();

    const hasVideoExtension = /\.(m3u8|mp4|webm|m4v|ts)(\?|$)/i.test(lower);
    const isVideoContentType =
      typeof contentType === 'string' &&
      (/^video\//i.test(contentType) || /application\/(vnd\.apple\.mpegurl|x-mpegurl)/i.test(contentType));

    return hasVideoExtension || isVideoContentType;
  }

  function recordVideoRequest(url, observedTime) {
    if (!url || url.startsWith('data:') || url.startsWith('blob:')) return;

    const now =
      typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();
    const time = typeof observedTime === 'number' ? observedTime : now;
    const existing = observedVideoRequests.get(url);
    const startTime = existing ? Math.max(existing.startTime, time) : time;
    observedVideoRequests.set(url, { url, startTime });
    lastRecordedVideoRequest = { url, time };
  }

  function injectPageSniffer() {
    try {
      if (document.documentElement?.dataset?.sidebySnifferInjected === '1') return;

      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('page-sniffer.js');
      script.async = false;
      script.dataset.sidebyOwned = '1';
      document.documentElement.dataset.sidebySnifferInjected = '1';

      (document.documentElement || document.head || document.body).appendChild(script);
    } catch (err) {
      console.warn('Sideby.me extension: failed to inject page sniffer', err);
    }
  }

  function patchFetch() {
    const originalFetch = window.fetch;
    if (typeof originalFetch !== 'function') return;

    window.fetch = async (...args) => {
      const response = await originalFetch(...args);

      try {
        const req = args[0];
        const reqUrl = typeof req === 'string' ? req : req?.url;
        const url = response?.url || reqUrl;
        const contentType = response?.headers?.get?.('content-type');

        if (isLikelyVideoRequest(url, contentType)) {
          recordVideoRequest(url);
        }
      } catch (err) {
        console.warn('Sideby.me extension: fetch patch failed', err);
      }

      return response;
    };
  }

  function patchXHR() {
    const originalOpen = XMLHttpRequest.prototype.open;
    if (typeof originalOpen !== 'function') return;

    XMLHttpRequest.prototype.open = function (...args) {
      const method = args[0];
      const url = args[1];

      // Attach a one-time listener per request to inspect result
      this.addEventListener(
        'loadend',
        function () {
          try {
            const responseUrl = this.responseURL || url;
            const contentType = this.getResponseHeader ? this.getResponseHeader('content-type') : undefined;

            if (isLikelyVideoRequest(responseUrl, contentType)) {
              recordVideoRequest(responseUrl);
            }
          } catch (err) {
            console.warn('Sideby.me extension: XHR patch failed', err);
          }
        },
        { once: true }
      );

      return originalOpen.apply(this, args);
    };
  }

  function patchMediaSource() {
    const originalCreateObjectURL = URL.createObjectURL?.bind(URL);
    const originalAddSourceBuffer = MediaSource?.prototype?.addSourceBuffer;
    const originalAppendBuffer = SourceBuffer?.prototype?.appendBuffer;

    if (typeof originalCreateObjectURL === 'function') {
      URL.createObjectURL = function (target) {
        const url = originalCreateObjectURL(target);
        try {
          if (target instanceof MediaSource) {
            const sourceUrl = mediaSourceToUrl.get(target);
            if (sourceUrl) {
              blobUrlToSourceUrl.set(url, sourceUrl);
            }
          }
        } catch (err) {
          console.warn('Sideby.me extension: createObjectURL patch failed', err);
        }
        return url;
      };
    }

    if (typeof originalAddSourceBuffer === 'function') {
      MediaSource.prototype.addSourceBuffer = function (...args) {
        const sb = originalAddSourceBuffer.apply(this, args);
        try {
          sourceBufferToMediaSource.set(sb, this);
        } catch (err) {
          console.warn('Sideby.me extension: addSourceBuffer patch failed', err);
        }
        return sb;
      };
    }

    if (typeof originalAppendBuffer === 'function') {
      SourceBuffer.prototype.appendBuffer = function (...args) {
        try {
          const now =
            typeof performance !== 'undefined' && typeof performance.now === 'function'
              ? performance.now()
              : Date.now();
          const recencyMs = 5000;

          if (
            !sourceBufferToUrl.has(this) &&
            lastRecordedVideoRequest.url &&
            now - lastRecordedVideoRequest.time < recencyMs
          ) {
            sourceBufferToUrl.set(this, lastRecordedVideoRequest.url);
            const ms = sourceBufferToMediaSource.get(this);
            if (ms) {
              mediaSourceToUrl.set(ms, lastRecordedVideoRequest.url);
            }
          }
        } catch (err) {
          console.warn('Sideby.me extension: appendBuffer patch failed', err);
        }

        return originalAppendBuffer.apply(this, args);
      };
    }
  }

  function handleSnifferEvent(event) {
    const detail = event?.detail || {};
    const { type } = detail;

    if (type === 'network') {
      recordVideoRequest(detail.url, detail.time);
      return;
    }

    if (type === 'blobMap') {
      const { blobUrl, sourceUrl } = detail;
      if (blobUrl && sourceUrl) {
        blobUrlToSourceUrl.set(blobUrl, sourceUrl);
      }
    }
  }

  function collectDomVideos() {
    const urls = new Set();
    const startAtByUrl = new Map();
    const qualityByUrl = new Map();

    const videos = Array.from(document.querySelectorAll('video'));
    for (const video of videos) {
      const candidates = new Set();

      if (video.src) candidates.add(video.src);
      if (video.currentSrc) candidates.add(video.currentSrc);

      const sources = Array.from(video.querySelectorAll('source[src]'));
      for (const source of sources) {
        if (source.src) candidates.add(source.src);
      }

      for (const url of candidates) {
        if (url.startsWith('data:')) continue;
        if (url.startsWith('blob:')) {
          const mapped = blobUrlToSourceUrl.get(url);
          if (!mapped) continue;
          urls.add(mapped);
          if (Number.isFinite(video.currentTime) && video.currentTime > 1) {
            startAtByUrl.set(mapped, Math.floor(video.currentTime));
          }
          const q = inferQuality(mapped);
          if (q) {
            const existing = qualityByUrl.get(mapped);
            if (!existing || qualityValue(q) > qualityValue(existing)) qualityByUrl.set(mapped, q);
          }
          continue;
        }
        urls.add(url);

        if (Number.isFinite(video.currentTime) && video.currentTime > 1) {
          startAtByUrl.set(url, Math.floor(video.currentTime));
        }

        const q = inferQuality(url);
        if (q) {
          const existing = qualityByUrl.get(url);
          if (!existing || qualityValue(q) > qualityValue(existing)) qualityByUrl.set(url, q);
        }
      }
    }

    return { urls, startAtByUrl, qualityByUrl };
  }

  function getNetworkVideoEntries() {
    const entries = [];

    if (typeof performance === 'undefined' || typeof performance.getEntriesByType !== 'function') {
      return entries;
    }

    try {
      const resources = performance.getEntriesByType('resource');

      for (let i = 0; i < resources.length; i += 1) {
        const entry = resources[i];
        const url = entry && entry.name;
        if (typeof url !== 'string') continue;
        if (url.startsWith('data:') || url.startsWith('blob:')) continue;

        const hasExtension = /\.(m3u8|mp4|webm|m4v|ts)(\?|$)/i.test(url);
        const likelyCdn = /video\.twimg\.com/i.test(url);

        if (hasExtension || likelyCdn) {
          entries.push({ url, startTime: typeof entry.startTime === 'number' ? entry.startTime : 0 });
        }
      }
    } catch (e) {
      console.error('Sideby.me extension: error inspecting performance entries', e);
    }

    // Add observed fetch/XHR video-like requests
    for (const { url, startTime } of observedVideoRequests.values()) {
      entries.push({ url, startTime });
    }

    return entries;
  }

  function scoreVideoUrl(url) {
    const lower = url.toLowerCase();
    let score = 1;

    if (/\.m3u8(\?|$)/.test(lower)) score = 30;
    else if (/\.(mp4|webm|m4v)(\?|$)/.test(lower)) score = 20;
    else if (/\.ts(\?|$)/.test(lower)) score = 10; // segments if nothing better

    if (/master\.m3u8|index\.m3u8|playlist\.m3u8|manifest\.m3u8/.test(lower)) score += 8;
    if (/chunklist|segment|seg\d|frag|media-|chunk|part-/.test(lower)) score -= 6;
    if (/\.ts(\?|$)/.test(lower)) score -= 4;

    // Prefer CDN files (twitter/video.twimg.com, etc.) over data/other hosts when scored equally
    if (/video\.twimg\.com/.test(lower)) score += 5;

    // Down-rank obvious ad/cdn trackers often paired with players
    if (/doubleclick|adsystem|googlesyndication/.test(lower)) score -= 8;

    return score;
  }

  function normalizeUrl(url) {
    try {
      const u = new URL(url);
      u.hash = '';

      const volatileParams = new Set([
        'range',
        'rn',
        'rbuf',
        'sq',
        'tmp',
        'ts',
        'token',
        'signature',
        'sig',
        'auth',
        'exp',
        'expires',
        'expiry',
        'playlist',
      ]);

      for (const key of Array.from(u.searchParams.keys())) {
        if (volatileParams.has(key.toLowerCase())) {
          u.searchParams.delete(key);
        }
      }

      return u.toString();
    } catch (_err) {
      return url;
    }
  }

  function detectVideos() {
    const pageUrl = window.location.href;
    const title = document.title;
    const hostname = window.location.hostname;

    const urlMeta = new Map();

    const { urls: domUrls, startAtByUrl, qualityByUrl } = collectDomVideos();

    // DOM-based URLs: treat as very recent so they rank highly
    for (const url of domUrls) {
      const key = normalizeUrl(url);
      const score = scoreVideoUrl(url);
      const startAt = startAtByUrl.get(url);
      const quality = qualityByUrl.get(url) || inferQuality(url);
      const existing = urlMeta.get(key);
      if (!existing || score > existing.score) {
        urlMeta.set(key, { score, time: Number.MAX_SAFE_INTEGER, startAt, url, quality });
      } else if (existing) {
        const betterQuality = qualityValue(quality) > qualityValue(existing.quality) ? quality : existing.quality;
        urlMeta.set(key, { ...existing, quality: betterQuality, startAt: existing.startAt ?? startAt });
      }
    }

    // Network-based URLs (HLS playlists, mp4, etc.), keep track of most recent time
    for (const { url, startTime } of getNetworkVideoEntries()) {
      const key = normalizeUrl(url);
      const score = scoreVideoUrl(url);
      const quality = inferQuality(url);
      const existing = urlMeta.get(key);
      if (!existing) {
        urlMeta.set(key, { score, time: startTime, startAt: undefined, url, quality });
      } else {
        const betterQuality = qualityValue(quality) > qualityValue(existing.quality) ? quality : existing.quality;
        urlMeta.set(key, {
          score: Math.max(existing.score, score),
          time: Math.max(existing.time, startTime),
          startAt: existing.startAt,
          url: existing.url || url,
          quality: betterQuality,
        });
      }
    }

    // If nothing obvious was found, use the page URL for YouTube-like sites
    if (urlMeta.size === 0 && (hostname.includes('youtube.com') || hostname.includes('youtu.be'))) {
      const firstVideo = document.querySelector('video');
      const startAt =
        firstVideo && Number.isFinite(firstVideo.currentTime) ? Math.floor(firstVideo.currentTime) : undefined;
      const key = normalizeUrl(pageUrl);
      const quality = inferQuality(pageUrl);
      urlMeta.set(key, { score: 5, time: Number.MAX_SAFE_INTEGER, startAt, url: pageUrl, quality });
    }

    const sorted = Array.from(urlMeta.values()).sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.time - a.time;
    });

    // Cap to a smaller number so we only show the best candidates
    const limited = sorted.slice(0, 8);

    return limited.map(meta => ({
      videoUrl: meta.url,
      pageUrl,
      title,
      startAt: meta.startAt,
      quality: meta.quality,
    }));
  }

  function refreshDetectedVideos() {
    latestVideos = detectVideos();

    if (latestVideos.length) {
      lastNonEmptyVideos = latestVideos;
      lastNonEmptyPageUrl = latestVideos[0]?.pageUrl || window.location.href;
    }
  }

  function scheduleRefresh() {
    if (detectTimeoutId) {
      clearTimeout(detectTimeoutId);
    }

    detectTimeoutId = setTimeout(() => {
      detectTimeoutId = null;
      refreshDetectedVideos();
    }, DETECT_THROTTLE_MS);
  }

  function mutationTouchesMedia(mutation) {
    if (mutation.type === 'childList') {
      const nodes = [...mutation.addedNodes, ...mutation.removedNodes];

      for (const node of nodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        const el = node;
        if (el.matches?.('video, source') || el.querySelector?.('video, source')) {
          return true;
        }
      }
    }

    if (mutation.type === 'attributes') {
      const target = mutation.target;
      if (target instanceof Element && mutation.attributeName === 'src') {
        if (target.matches('video, source')) return true;
      }
    }

    return false;
  }

  function setupMutationObserver() {
    if (typeof MutationObserver === 'undefined') return;

    const observer = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        if (mutationTouchesMedia(mutation)) {
          scheduleRefresh();
          break;
        }
      }
    });

    const target = document.documentElement || document.body;

    if (target) {
      observer.observe(target, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['src'],
      });
    }
  }

  injectPageSniffer();
  window.addEventListener(SNIFFER_EVENT, handleSnifferEvent);
  refreshDetectedVideos();
  setupMutationObserver();
  patchFetch();
  patchXHR();
  patchMediaSource();

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message && message.type === 'GET_VIDEO_INFO') {
      refreshDetectedVideos();

      if (latestVideos.length) {
        sendResponse({ videos: latestVideos });
      } else {
        setTimeout(() => {
          refreshDetectedVideos();
          const videosToSend = latestVideos.length
            ? latestVideos
            : lastNonEmptyVideos.length && lastNonEmptyPageUrl === window.location.href
              ? lastNonEmptyVideos
              : latestVideos;
          sendResponse({ videos: videosToSend });
        }, FALLBACK_RETRY_MS);
      }
    }
    // Indicate we may respond asynchronously (harmless even when we don't).
    return true;
  });
})();
