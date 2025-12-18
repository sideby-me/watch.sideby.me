/**
 * Sideby Pass - Content Script
 *
 * Simplified to only:
 * 1. Collect video sources from DOM
 * 2. Track current playback time
 * 3. Send video URLs to background script
 */

(function () {
  if (window.__sidebyContentInjected) return;
  window.__sidebyContentInjected = true;

  /**
   * Collect all video URLs from the DOM
   */
  function collectDomVideos() {
    const results = [];
    const seen = new Set();

    const videos = document.querySelectorAll('video');

    for (const video of videos) {
      const urls = [];

      // Get video src
      if (video.src && !video.src.startsWith('blob:') && !video.src.startsWith('data:')) {
        urls.push(video.src);
      }
      if (video.currentSrc && !video.currentSrc.startsWith('blob:') && !video.currentSrc.startsWith('data:')) {
        urls.push(video.currentSrc);
      }

      // Get source elements
      const sources = video.querySelectorAll('source[src]');
      for (const source of sources) {
        if (source.src && !source.src.startsWith('blob:') && !source.src.startsWith('data:')) {
          urls.push(source.src);
        }
      }

      // Get current time
      const currentTime =
        Number.isFinite(video.currentTime) && video.currentTime > 1 ? Math.floor(video.currentTime) : 0;

      // Add unique URLs
      for (const url of urls) {
        if (!seen.has(url)) {
          seen.add(url);
          results.push({ url, currentTime });
        }
      }
    }

    return results;
  }

  /**
   * Send DOM videos to background script
   */
  async function reportDomVideos() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return;

      const videos = collectDomVideos();
      for (const { url, currentTime } of videos) {
        chrome.runtime.sendMessage({
          type: 'ADD_DOM_VIDEO',
          tabId: tab.id,
          url,
          currentTime,
        });
      }
    } catch (e) {
      // Silently ignore - tab query may fail in some contexts
    }
  }

  /**
   * Get page metadata
   */
  function getPageInfo() {
    return {
      title: document.title || '',
      pageUrl: window.location.href,
    };
  }

  /**
   * Handle messages from popup/background
   */
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'GET_PAGE_INFO') {
      sendResponse(getPageInfo());
      return true;
    }

    if (message?.type === 'SCAN_DOM') {
      const videos = collectDomVideos();
      sendResponse({ videos });

      // Also report to background
      reportDomVideos();
      return true;
    }
  });

  // Initial scan after a short delay (let page load)
  setTimeout(reportDomVideos, 500);

  // Re-scan when DOM changes (for lazy-loaded videos)
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

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
})();
