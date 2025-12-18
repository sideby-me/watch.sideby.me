// Sideby Pass - XHR Watcher
// Injected into page context (MAIN world) at document_start to intercept XHR/fetch responses and extract video URLs from JSON APIs

(function () {
  if (window.__sidebyWatcherInjected) return;
  window.__sidebyWatcherInjected = true;

  const SIDEBY_EVENT = 'sideby:video-found';
  const CLEAR_EVENT = 'sideby:clear-videos';

  let lastUrl = document.location.href;
  let foundVideos = new Set(); // Track URLs to avoid duplicates

  // Dispatch video found event to content script
  function dispatchVideo(video) {
    if (foundVideos.has(video.url)) return;
    foundVideos.add(video.url);

    try {
      window.dispatchEvent(
        new CustomEvent(SIDEBY_EVENT, {
          detail: video,
        })
      );
    } catch (e) {
      console.warn('Sideby: dispatch failed', e);
    }
  }

  // Clear videos when URL changes (for SPAs)
  function checkUrlChange() {
    if (document.location.href !== lastUrl) {
      lastUrl = document.location.href;
      foundVideos.clear();
      window.dispatchEvent(new CustomEvent(CLEAR_EVENT));
    }
  }

  // Check URL change periodically (for SPA navigation)
  setInterval(checkUrlChange, 500);

  // Recursively search for a key in an object
  function searchKey(obj, key, results = []) {
    if (!obj || typeof obj !== 'object') return results;

    for (const k in obj) {
      if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;

      if (k === key && obj[k]) {
        results.push(obj[k]);
      }

      if (typeof obj[k] === 'object') {
        searchKey(obj[k], key, results);
      }
    }

    return results;
  }

  // Parse Instagram API response
  function parseInstagram(responseText, url) {
    if (!responseText.includes('video_versions')) return;

    try {
      // Instagram sometimes prefixes with "for (;;);"
      const cleaned = responseText.replace(/^for\s*\(;;\);?/, '');
      const data = JSON.parse(cleaned);

      const videoVersions = searchKey(data, 'video_versions');

      for (const versions of videoVersions) {
        if (!Array.isArray(versions) || !versions.length) continue;

        // Get the highest quality version
        const sorted = [...versions].sort((a, b) => (b.width || 0) - (a.width || 0));
        const best = sorted[0];

        if (best && best.url) {
          // Filter out byte-range URLs
          if (best.url.includes('bytestart=') || best.url.includes('byteend=')) {
            continue;
          }

          dispatchVideo({
            url: best.url,
            quality: best.width ? `${best.width}p` : null,
            source: 'instagram',
            title: document.title,
          });
        }
      }
    } catch (e) {}
  }

  // Parse Twitter/X API response
  function parseTwitter(responseText, url) {
    if (!responseText.includes('video_info')) return;

    try {
      const data = JSON.parse(responseText);
      const videoInfos = searchKey(data, 'video_info');

      // Only get the first (most relevant) video_info to avoid duplicates
      const info = videoInfos[0];
      if (!info || !info.variants || !Array.isArray(info.variants)) return;

      // Filter out HLS playlists, keep MP4s
      const mp4Variants = info.variants.filter(
        v => v.url && v.content_type !== 'application/x-mpegURL' && !v.url.includes('.m3u8')
      );

      if (!mp4Variants.length) return;

      // Sort by bitrate (highest first) and get the best one
      mp4Variants.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
      const best = mp4Variants[0];

      // Extract quality from URL (e.g., /avc1/720x1280/)
      let quality = null;
      const match = best.url.match(/\/(\d+)x(\d+)\//);
      if (match) {
        quality = `${Math.min(parseInt(match[1]), parseInt(match[2]))}p`;
      }

      dispatchVideo({
        url: best.url,
        quality: quality,
        source: 'twitter',
        title: document.title,
      });
    } catch (e) {}
  }

  // Parse generic video responses
  function parseGeneric(responseText, url) {
    try {
      const data = JSON.parse(responseText);

      const videoKeys = ['file', 'video_url', 'video', 'source', 'src', 'stream_url', 'download_url'];

      for (const key of videoKeys) {
        const values = searchKey(data, key);
        for (const value of values) {
          // Only MP4 and M3U8, no webm
          if (typeof value === 'string' && value.match(/\.(mp4|m3u8)(\?|$)/i)) {
            dispatchVideo({
              url: value,
              source: 'api',
              title: document.title,
            });
          }
        }
      }
    } catch (e) {
      // Not JSON, check HLS
      if (responseText.includes('#EXTM3U') && responseText.includes('#EXT-X-') && url.includes('.m3u8')) {
        dispatchVideo({
          url: url,
          source: 'hls',
          title: document.title,
        });
      }
    }
  }

  // Process XHR response
  function processResponse(responseText, url) {
    const hostname = document.location.hostname;

    if (!responseText || responseText.length < 10) return;

    // Instagram
    if (hostname.includes('instagram.com')) {
      parseInstagram(responseText, url);
    }
    // Twitter/X
    else if (hostname.includes('twitter.com') || hostname.includes('x.com')) {
      parseTwitter(responseText, url);
    }
    // Generic
    else if (responseText.includes('"url"') || responseText.includes('#EXTM3U')) {
      parseGeneric(responseText, url);
    }
  }

  // XHR interception
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url) {
    this._sidebyUrl = url;
    return originalOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function () {
    this.addEventListener('load', function () {
      try {
        let fullUrl = this._sidebyUrl;
        if (fullUrl && !fullUrl.startsWith('http')) {
          fullUrl = document.location.origin + fullUrl;
        }

        let responseText = '';
        try {
          responseText = this.responseText;
        } catch (e) {
          return;
        }

        if (responseText) {
          processResponse(responseText, fullUrl);
        }
      } catch (e) {
        // Ignore
      }
    });

    return originalSend.apply(this, arguments);
  };

  // Fetch interception
  const originalFetch = window.fetch;

  window.fetch = async function (...args) {
    const response = await originalFetch.apply(this, args);

    try {
      const clone = response.clone();
      const url = response.url || (typeof args[0] === 'string' ? args[0] : args[0]?.url);

      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('json') || contentType.includes('text')) {
        clone
          .text()
          .then(text => {
            if (text) {
              processResponse(text, url);
            }
          })
          .catch(() => {});
      }
    } catch (e) {}

    return response;
  };

  console.log('Sideby Pass: Watcher initialized');
})();
