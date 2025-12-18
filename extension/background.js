const APP_BASE_URL = 'https://sideby.me';

// ============================================================================
// VIDEO DETECTION VIA WEBREQUEST API
// ============================================================================

// Store detected video URLs per tab: Map<tabId, Map<url, VideoInfo>>
const videosByTab = new Map();

// Configuration
const MIN_VIDEO_SIZE_BYTES = 500_000; // 500KB - filter out small segments
const MAX_RESULTS = 5;
const ENTRY_TTL_MS = 10 * 60 * 1000; // 10 minutes

// Patterns for video detection
const VIDEO_EXTENSIONS = /\.(mp4|m4v|webm|mov|m3u8)(\?|#|$)/i;
const SEGMENT_EXTENSIONS = /\.(ts|m4s|m4a)(\?|#|$)/i;
const VIDEO_CONTENT_TYPES = /^(video\/|application\/(vnd\.apple\.mpegurl|x-mpegurl))/i;

// Patterns to identify segments (should be filtered out)
const SEGMENT_PATTERNS = [
  /[_\-/](seg|segment|frag|fragment|chunk|part)[_\-]?\d+/i,
  /[_\-/]init[_\-]?\d*\.(mp4|m4s)/i,
  /[&?]range=\d+[_\-]\d+/i,
  /\/range\/\d+/i,
];

// Patterns to identify audio-only (should be filtered out)
const AUDIO_ONLY_PATTERNS = [/[_\-/]audio[_\-/]/i, /audio[_\-]only/i, /\.m4a(\?|#|$)/i, /\.aac(\?|#|$)/i];

/**
 * Check if URL looks like a playable video (not a segment)
 */
function isPlayableVideo(url, contentType, size) {
  const lower = url.toLowerCase();

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

/**
 * Score a video URL (higher = better)
 */
function scoreVideo(url, size) {
  let score = 10;

  const lower = url.toLowerCase();

  // Boost by extension
  if (/\.mp4(\?|#|$)/i.test(lower)) score += 20;
  else if (/\.webm(\?|#|$)/i.test(lower)) score += 15;
  else if (/\.m3u8(\?|#|$)/i.test(lower)) score += 25; // Master playlist

  // Boost by size (larger = more likely complete video)
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

  return score;
}

/**
 * Get filtered and sorted videos for a tab
 */
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
      score: scoreVideo(url, info.size),
      timestamp: info.timestamp,
    });
  }

  // Sort by score (desc), then by timestamp (desc)
  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.timestamp - a.timestamp;
  });

  return results.slice(0, MAX_RESULTS);
}

// ============================================================================
// WEBREQUEST LISTENER
// ============================================================================

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
    } catch (e) {
      // Silently ignore errors
    }
  },
  { urls: ['<all_urls>'], types: ['media', 'xmlhttprequest', 'other'] },
  ['responseHeaders']
);

// Clean up when tab is closed
chrome.tabs.onRemoved.addListener(tabId => {
  videosByTab.delete(tabId);
});

// ============================================================================
// MESSAGE HANDLERS
// ============================================================================

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
});

// ============================================================================
// CONTEXT MENU
// ============================================================================

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
