(function () {
  if (window.__sidebyContentInjected) {
    return;
  }

  window.__sidebyContentInjected = true;

  function getDomVideoUrls() {
    const urls = new Set();

    const videos = Array.from(document.querySelectorAll('video'));
    for (const video of videos) {
      if (video.src && !video.src.startsWith('blob:') && !video.src.startsWith('data:')) {
        urls.add(video.src);
      }

      const sources = Array.from(video.querySelectorAll('source[src]'));
      for (const source of sources) {
        const src = source.src;
        if (src && !src.startsWith('blob:') && !src.startsWith('data:')) {
          urls.add(src);
        }
      }
    }

    return urls;
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

        if (/\.(m3u8|mp4|webm|m4v)(\?|$)/i.test(url)) {
          entries.push({ url, startTime: typeof entry.startTime === 'number' ? entry.startTime : 0 });
        }
      }
    } catch (e) {
      console.error('Sideby.me extension: error inspecting performance entries', e);
    }

    return entries;
  }

  function scoreVideoUrl(url) {
    if (/\.m3u8(\?|$)/i.test(url)) return 3; // HLS playlists first
    if (/\.(mp4|webm|m4v)(\?|$)/i.test(url)) return 2; // direct files
    return 1;
  }

  function detectVideos() {
    const pageUrl = window.location.href;
    const title = document.title;
    const hostname = window.location.hostname;

    const urlMeta = new Map();

    // DOM-based URLs: treat as very recent so they rank highly
    for (const url of getDomVideoUrls()) {
      const score = scoreVideoUrl(url);
      urlMeta.set(url, { score, time: Number.MAX_SAFE_INTEGER });
    }

    // Network-based URLs (HLS playlists, mp4, etc.), keep track of most recent time
    for (const { url, startTime } of getNetworkVideoEntries()) {
      const score = scoreVideoUrl(url);
      const existing = urlMeta.get(url);
      if (!existing) {
        urlMeta.set(url, { score, time: startTime });
      } else {
        urlMeta.set(url, {
          score: Math.max(existing.score, score),
          time: Math.max(existing.time, startTime),
        });
      }
    }

    // If nothing obvious was found, use the page URL for YouTube-like sites
    if (
      urlMeta.size === 0 &&
      (hostname.includes('youtube.com') || hostname.includes('youtu.be') || hostname.includes('youtu.be'))
    ) {
      urlMeta.set(pageUrl, { score: 1, time: Number.MAX_SAFE_INTEGER });
    }

    const sorted = Array.from(urlMeta.entries()).sort((a, b) => {
      const aMeta = a[1];
      const bMeta = b[1];
      if (bMeta.score !== aMeta.score) return bMeta.score - aMeta.score;
      return bMeta.time - aMeta.time;
    });

    // Cap to a smaller number so we only show the best candidates
    const limited = sorted.slice(0, 5);

    return limited.map(([url]) => ({
      videoUrl: url,
      pageUrl,
      title,
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
