// Sideby Pass - Content Script
// Listens for video-found events from watcher.js & forwards them to the background script

(function () {
  if (window.__sidebyContentInjected) return;
  window.__sidebyContentInjected = true;

  const SIDEBY_EVENT = 'sideby:video-found';
  const CLEAR_EVENT = 'sideby:clear-videos';

  // Listen for video-found events from watcher.js
  window.addEventListener(SIDEBY_EVENT, event => {
    const video = event.detail;
    if (!video || !video.url) return;

    // Send to background script
    chrome.runtime.sendMessage({
      type: 'ADD_VIDEO',
      url: video.url,
      quality: video.quality,
      source: video.source,
      title: video.title || document.title,
      pageUrl: document.location.href,
    });
  });

  // Listen for clear-videos event (when URL changes in SPA)
  window.addEventListener(CLEAR_EVENT, () => {
    chrome.runtime.sendMessage({
      type: 'CLEAR_VIDEOS',
    });
  });

  // Check if on YouTube and report the video URL directly
  function checkYouTube() {
    const hostname = window.location.hostname;
    if (!hostname.includes('youtube.com')) return;

    const url = window.location.href;

    // Check if on a video page
    if (url.includes('/watch') || url.includes('/shorts/')) {
      chrome.runtime.sendMessage({
        type: 'ADD_VIDEO',
        url: url,
        source: 'youtube',
        title: document.title.replace(' - YouTube', ''),
        pageUrl: url,
      });
    }
  }

  // Check YouTube on load and URL changes
  if (window.location.hostname.includes('youtube.com')) {
    // Initial check after page loads
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => setTimeout(checkYouTube, 1000));
    } else {
      setTimeout(checkYouTube, 1000);
    }

    // Re-check on navigation (YouTube is SPA)
    let lastYouTubeUrl = window.location.href;
    setInterval(() => {
      if (window.location.href !== lastYouTubeUrl) {
        lastYouTubeUrl = window.location.href;
        // Clear old videos first
        chrome.runtime.sendMessage({ type: 'CLEAR_VIDEOS' });
        setTimeout(checkYouTube, 500);
      }
    }, 500);
  }

  // Collect video URLs from DOM elements
  function collectDomVideos() {
    const results = [];
    const seen = new Set();

    const videos = document.querySelectorAll('video');

    for (const video of videos) {
      const urls = [];

      if (video.src && !video.src.startsWith('blob:') && !video.src.startsWith('data:')) {
        urls.push(video.src);
      }
      if (video.currentSrc && !video.currentSrc.startsWith('blob:') && !video.currentSrc.startsWith('data:')) {
        urls.push(video.currentSrc);
      }

      const sources = video.querySelectorAll('source[src]');
      for (const source of sources) {
        if (source.src && !source.src.startsWith('blob:') && !source.src.startsWith('data:')) {
          urls.push(source.src);
        }
      }

      const currentTime =
        Number.isFinite(video.currentTime) && video.currentTime > 1 ? Math.floor(video.currentTime) : 0;

      for (const url of urls) {
        if (!seen.has(url)) {
          seen.add(url);
          results.push({ url, currentTime });
        }
      }
    }

    return results;
  }

  // Send DOM videos to background
  function reportDomVideos() {
    try {
      const videos = collectDomVideos();

      for (const { url, currentTime } of videos) {
        chrome.runtime.sendMessage({
          type: 'ADD_VIDEO',
          url,
          source: 'dom',
          title: document.title,
          currentTime,
        });
      }
    } catch (e) {}
  }

  // Get page metadata
  function getPageInfo() {
    return {
      title: document.title || '',
      pageUrl: window.location.href,
    };
  }

  // Handle messages from popup/background
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === 'GET_PAGE_INFO') {
      sendResponse(getPageInfo());
      return true;
    }

    if (message?.type === 'SCAN_DOM') {
      const videos = collectDomVideos();
      sendResponse({ videos });
      reportDomVideos();
      return true;
    }
  });

  // Initial DOM scan after page loads
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(reportDomVideos, 500);
    });
  } else {
    setTimeout(reportDomVideos, 500);
  }

  // Re-scan when DOM changes
  const observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        const hasMedia = [...mutation.addedNodes].some(
          node => node.nodeName === 'VIDEO' || node.querySelector?.('video')
        );
        if (hasMedia) {
          reportDomVideos();
          break;
        }
      }
    }
  });

  if (document.documentElement) {
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }
})();
