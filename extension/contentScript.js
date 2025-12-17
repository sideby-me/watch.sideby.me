(function () {
  if (window.__sidebyContentInjected) {
    return;
  }

  window.__sidebyContentInjected = true;

  function collectDomVideos() {
    const urls = new Set();
    const startAtByUrl = new Map();

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
        if (url.startsWith('blob:') || url.startsWith('data:')) continue;
        urls.add(url);

        if (Number.isFinite(video.currentTime) && video.currentTime > 1) {
          startAtByUrl.set(url, Math.floor(video.currentTime));
        }
      }
    }

    return { urls, startAtByUrl };
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

    const { urls: domUrls, startAtByUrl } = collectDomVideos();

    // DOM-based URLs: treat as very recent so they rank highly
    for (const url of domUrls) {
      const key = normalizeUrl(url);
      const score = scoreVideoUrl(url);
      const startAt = startAtByUrl.get(url);
      const existing = urlMeta.get(key);
      if (!existing || score > existing.score) {
        urlMeta.set(key, { score, time: Number.MAX_SAFE_INTEGER, startAt, url });
      }
    }

    // Network-based URLs (HLS playlists, mp4, etc.), keep track of most recent time
    for (const { url, startTime } of getNetworkVideoEntries()) {
      const key = normalizeUrl(url);
      const score = scoreVideoUrl(url);
      const existing = urlMeta.get(key);
      if (!existing) {
        urlMeta.set(key, { score, time: startTime, startAt: undefined, url });
      } else {
        urlMeta.set(key, {
          score: Math.max(existing.score, score),
          time: Math.max(existing.time, startTime),
          startAt: existing.startAt,
          url: existing.url || url,
        });
      }
    }

    // If nothing obvious was found, use the page URL for YouTube-like sites
    if (urlMeta.size === 0 && (hostname.includes('youtube.com') || hostname.includes('youtu.be'))) {
      const firstVideo = document.querySelector('video');
      const startAt =
        firstVideo && Number.isFinite(firstVideo.currentTime) ? Math.floor(firstVideo.currentTime) : undefined;
      const key = normalizeUrl(pageUrl);
      urlMeta.set(key, { score: 5, time: Number.MAX_SAFE_INTEGER, startAt, url: pageUrl });
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
    }));
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message && message.type === 'GET_VIDEO_INFO') {
      const videos = detectVideos();
      sendResponse({ videos });
    }
    // Indicate we may respond asynchronously (harmless even when we don't).
    return true;
  });
})();
