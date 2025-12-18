const APP_BASE_URL = 'http://localhost:3000';

// Sideby Pass - Background Script
// Video detection via webrequest API

// Store detected video URLs per tab
const videosByTab = new Map();

// Config
const MIN_VIDEO_SIZE_BYTES = 500_000; // Filter out small segments
const MAX_RESULTS = 5;
const ENTRY_TTL_MS = 10 * 60 * 1000;

// Patterns for video detection
const VIDEO_EXTENSIONS = /\.(mp4|m4v|mov|m3u8)(\?|#|$)/i;
const SEGMENT_EXTENSIONS = /\.(ts|m4s|m4a)(\?|#|$)/i;
const VIDEO_CONTENT_TYPES = /^(video\/|application\/(vnd\.apple\.mpegurl|x-mpegurl))/i;

// Patterns to identify segments (should be filtered out)
const SEGMENT_PATTERNS = [
  /[_\-/](seg|segment|frag|fragment|chunk|part)[_\-]?\d+/i,
  /[_\-/]init[_\-]?\d*\.(mp4|m4s)/i,
  /[&?]range=\d+[_\-]\d+/i,
  /\/range\/\d+/i,
  // Byte-range requests (Instagram uses these for segments)
  /[&?]bytestart=/i,
  /[&?]byteend=/i,
];

// Patterns to identify audio-only (should be filtered out)
const AUDIO_ONLY_PATTERNS = [/[_\-/]audio[_\-/]/i, /audio[_\-]only/i, /\.m4a(\?|#|$)/i, /\.aac(\?|#|$)/i];

// Check if URL looks like a playable video (not a segment)
function isPlayableVideo(url, contentType, size) {
  const lower = url.toLowerCase();

  // Allow YouTube URLs through (they're played directly by our player)
  if (lower.includes('youtube.com/watch') || lower.includes('youtube.com/shorts/') || lower.includes('youtu.be/')) {
    return true;
  }

  // Filter out webm files
  if (/\.webm(\?|#|$)/i.test(lower)) {
    return false;
  }

  // Filter out m4s segment files
  if (/\.m4s(\?|#|$)/i.test(lower)) {
    return false;
  }

  // Must have video extension or content type
  const hasVideoExt = VIDEO_EXTENSIONS.test(lower);
  const hasSegmentExt = SEGMENT_EXTENSIONS.test(lower);
  const hasVideoContentType = contentType && VIDEO_CONTENT_TYPES.test(contentType);

  if (!hasVideoExt && !hasVideoContentType) {
    // Allow segment extensions only if we have size info and it's large
    if (hasSegmentExt && size && size > MIN_VIDEO_SIZE_BYTES * 2) {
      // Large segment file might be a complete video
    } else {
      return false;
    }
  }

  // Filter out segment patterns
  for (const pattern of SEGMENT_PATTERNS) {
    if (pattern.test(lower)) return false;
  }

  // Filter out audio-only
  for (const pattern of AUDIO_ONLY_PATTERNS) {
    if (pattern.test(lower)) return false;
  }

  // Filter by size if available
  if (size && size < MIN_VIDEO_SIZE_BYTES) {
    return false;
  }

  return true;
}

// Score a video URL (higher = better)
function scoreVideo(url, size, source) {
  let score = 10;

  const lower = url.toLowerCase();

  // Boost by extension
  if (/\.mp4(\?|#|$)/i.test(lower)) score += 20;
  else if (/\.m3u8(\?|#|$)/i.test(lower)) score += 25; // Master playlist

  // Boost by size
  if (size) {
    if (size > 50_000_000)
      score += 30; // >50MB
    else if (size > 10_000_000)
      score += 20; // >10MB
    else if (size > 5_000_000) score += 10; // >5MB
  }

  // Boost quality indicators
  if (/1080|1920|hd|high/i.test(lower)) score += 5;
  if (/720|sd/i.test(lower)) score += 3;

  // Boost videos from API parsing (instagram, twitter, etc.)
  if (source === 'instagram' || source === 'twitter' || source === 'api') {
    score += 50;
  }

  return score;
}

// Get filtered and sorted videos for a tab
function getVideosForTab(tabId) {
  const tabVideos = videosByTab.get(tabId);
  if (!tabVideos) return [];

  const now = Date.now();
  const results = [];

  for (const [url, info] of tabVideos.entries()) {
    // Skip expired entries
    if (now - info.timestamp > ENTRY_TTL_MS) {
      tabVideos.delete(url);
      continue;
    }

    // Skip non-playable
    if (!isPlayableVideo(url, info.contentType, info.size)) {
      continue;
    }

    results.push({
      url,
      size: info.size,
      score: scoreVideo(url, info.size, info.source),
      timestamp: info.timestamp,
      quality: info.quality,
      source: info.source,
      title: info.title,
    });
  }

  // Sort by score (desc), then by timestamp (desc)
  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.timestamp - a.timestamp;
  });

  return results.slice(0, MAX_RESULTS);
}

// Webrequest listener
chrome.webRequest.onCompleted.addListener(
  details => {
    try {
      if (!details.tabId || details.tabId < 0) return;

      const url = details.url;
      if (!url || url.startsWith('data:') || url.startsWith('blob:')) return;

      // Check if this is a video request
      const contentTypeHeader = details.responseHeaders?.find(h => h.name.toLowerCase() === 'content-type');
      const contentType = contentTypeHeader?.value || '';

      const hasVideoExt = VIDEO_EXTENSIONS.test(url) || SEGMENT_EXTENSIONS.test(url);
      const hasVideoContentType = VIDEO_CONTENT_TYPES.test(contentType);

      if (!hasVideoExt && !hasVideoContentType) return;

      // Get content length
      const contentLengthHeader = details.responseHeaders?.find(h => h.name.toLowerCase() === 'content-length');
      const size = contentLengthHeader?.value ? parseInt(contentLengthHeader.value, 10) : null;

      // Store the video info
      if (!videosByTab.has(details.tabId)) {
        videosByTab.set(details.tabId, new Map());
      }

      const tabVideos = videosByTab.get(details.tabId);

      // Update or add entry
      const existing = tabVideos.get(url);
      if (!existing || (size && (!existing.size || size > existing.size))) {
        tabVideos.set(url, {
          size,
          contentType,
          timestamp: Date.now(),
        });
      }
    } catch (e) {}
  },
  { urls: ['<all_urls>'], types: ['media', 'xmlhttprequest', 'other'] },
  ['responseHeaders']
);

// Clean up when tab is closed
chrome.tabs.onRemoved.addListener(tabId => {
  videosByTab.delete(tabId);
});

// Message handlers
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'GET_VIDEOS') {
    const tabId = message.tabId;
    const videos = getVideosForTab(tabId);
    sendResponse({ videos });
    return true;
  }

  if (message?.type === 'ADD_DOM_VIDEO') {
    // Content script found a video URL in the DOM
    const { tabId, url, currentTime } = message;
    if (!tabId || !url) return;

    if (!videosByTab.has(tabId)) {
      videosByTab.set(tabId, new Map());
    }

    const tabVideos = videosByTab.get(tabId);
    const existing = tabVideos.get(url);

    if (!existing) {
      tabVideos.set(url, {
        size: null,
        contentType: null,
        timestamp: Date.now(),
        currentTime,
        fromDom: true,
      });
    } else {
      existing.currentTime = currentTime;
      existing.fromDom = true;
    }

    return true;
  }

  // Handle videos from XHR/fetch interception (watcher.js)
  if (message?.type === 'ADD_VIDEO') {
    const tabId = message.tabId || sender?.tab?.id;
    const url = message.url;
    if (!tabId || !url) return;

    // Skip blob/data URLs
    if (url.startsWith('blob:') || url.startsWith('data:')) return;

    if (!videosByTab.has(tabId)) {
      videosByTab.set(tabId, new Map());
    }

    const tabVideos = videosByTab.get(tabId);
    const existing = tabVideos.get(url);

    if (!existing) {
      tabVideos.set(url, {
        size: null,
        contentType: null,
        timestamp: Date.now(),
        source: message.source,
        quality: message.quality,
        title: message.title,
        fromApi: message.source === 'instagram' || message.source === 'twitter' || message.source === 'api',
      });
    } else {
      // Update with API source if available (higher priority)
      if (message.source && !existing.source) {
        existing.source = message.source;
      }
      if (message.quality && !existing.quality) {
        existing.quality = message.quality;
      }
    }

    return true;
  }

  // Handle clearing videos when URL changes
  if (message?.type === 'CLEAR_VIDEOS') {
    const tabId = sender?.tab?.id;
    if (tabId && videosByTab.has(tabId)) {
      videosByTab.get(tabId).clear();
    }
    return true;
  }
});

// Context menu
chrome.runtime.onInstalled.addListener(() => {
  try {
    chrome.contextMenus.create({
      id: 'sideby-pass',
      title: 'Play with Sideby Pass',
      contexts: ['video', 'link'],
    });
  } catch (e) {
    console.error('Failed to create context menu', e);
  }
});

chrome.contextMenus.onClicked.addListener(info => {
  if (info.menuItemId !== 'sideby-pass') return;

  const videoUrl = info.srcUrl || info.linkUrl;
  if (!videoUrl) return;

  const params = new URLSearchParams();
  params.set('videoUrl', videoUrl);
  params.set('autoplay', '1');

  const url = `${APP_BASE_URL}/create?${params.toString()}`;
  chrome.tabs.create({ url });
});
