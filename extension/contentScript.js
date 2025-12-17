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
      if (video.src && !video.src.startsWith('blob:') && !video.src.startsWith('data:')) {
        urls.add(video.src);

        if (Number.isFinite(video.currentTime) && video.currentTime > 1) {
          startAtByUrl.set(video.src, Math.floor(video.currentTime));
        }
      }

      const sources = Array.from(video.querySelectorAll('source[src]'));
      for (const source of sources) {
        const src = source.src;
        if (src && !src.startsWith('blob:') && !src.startsWith('data:')) {
          urls.add(src);

          if (Number.isFinite(video.currentTime) && video.currentTime > 1) {
            startAtByUrl.set(src, Math.floor(video.currentTime));
          }
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

        if (/\.(m3u8|mp4|webm|m4v|ts)(\?|$)/i.test(url)) {
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

    return score;
  }

  function detectVideos() {
    const pageUrl = window.location.href;
    const title = document.title;
    const hostname = window.location.hostname;

    const urlMeta = new Map();

    const { urls: domUrls, startAtByUrl } = collectDomVideos();

    // DOM-based URLs: treat as very recent so they rank highly
    for (const url of domUrls) {
      const score = scoreVideoUrl(url);
      const startAt = startAtByUrl.get(url);
      urlMeta.set(url, { score, time: Number.MAX_SAFE_INTEGER, startAt });
    }

    // Network-based URLs (HLS playlists, mp4, etc.), keep track of most recent time
    for (const { url, startTime } of getNetworkVideoEntries()) {
      const score = scoreVideoUrl(url);
      const existing = urlMeta.get(url);
      if (!existing) {
        urlMeta.set(url, { score, time: startTime, startAt: undefined });
      } else {
        urlMeta.set(url, {
          score: Math.max(existing.score, score),
          time: Math.max(existing.time, startTime),
          startAt: existing.startAt,
        });
      }
    }

    // If nothing obvious was found, use the page URL for YouTube-like sites
    if (urlMeta.size === 0 && (hostname.includes('youtube.com') || hostname.includes('youtu.be'))) {
      const firstVideo = document.querySelector('video');
      const startAt =
        firstVideo && Number.isFinite(firstVideo.currentTime) ? Math.floor(firstVideo.currentTime) : undefined;
      urlMeta.set(pageUrl, { score: 5, time: Number.MAX_SAFE_INTEGER, startAt });
    }

    const sorted = Array.from(urlMeta.entries()).sort((a, b) => {
      const aMeta = a[1];
      const bMeta = b[1];
      if (bMeta.score !== aMeta.score) return bMeta.score - aMeta.score;
      return bMeta.time - aMeta.time;
    });

    // Cap to a smaller number so we only show the best candidates
    const limited = sorted.slice(0, 5);

    return limited.map(([url, meta]) => ({
      videoUrl: url,
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
