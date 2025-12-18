const APP_BASE_URL = 'http://localhost:3000';

// DOM Elements
const stateLoading = document.getElementById('state-loading');
const stateError = document.getElementById('state-error');
const stateSuccess = document.getElementById('state-success');
const errorMessage = document.getElementById('error-message');

const videoTitle = document.getElementById('video-title');
const videoUrl = document.getElementById('video-url');
const videoList = document.getElementById('video-list');
const videoCountPill = document.getElementById('video-count-pill');
const videoKind = document.getElementById('video-kind');
const videoQuality = document.getElementById('video-quality');
const pageHost = document.getElementById('page-host');

const createRoomBtn = document.getElementById('create-room');
const copyLinkBtn = document.getElementById('copy-link');

let detectedVideos = [];
let selectedIndex = 0;
let pageInfo = { title: '', pageUrl: '' };

// Helpers
function getVideoKind(url) {
  if (/\.m3u8(\?|$)/i.test(url)) return 'HLS';
  if (/\.(mp4|m4v)(\?|$)/i.test(url)) return 'MP4';
  return 'Video';
}

function getHost(url) {
  try {
    const host = new URL(url).hostname;
    return host.replace(/^www\./, '');
  } catch (_err) {
    return 'unknown';
  }
}

function formatSize(bytes) {
  if (!bytes) return '';
  if (bytes > 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
  if (bytes > 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  if (bytes > 1_000) return `${(bytes / 1_000).toFixed(0)} KB`;
  return `${bytes} B`;
}

function showState(state) {
  stateLoading.hidden = true;
  stateError.hidden = true;
  stateSuccess.hidden = true;

  if (state === 'loading') stateLoading.hidden = false;
  else if (state === 'error') stateError.hidden = false;
  else if (state === 'success') stateSuccess.hidden = false;
}

// UI Updates
function updateVideoInfo(index) {
  if (!detectedVideos[index]) return;
  const video = detectedVideos[index];

  // Use video title if available (from API parsing), otherwise page title
  const title = video.title || pageInfo.title || 'Untitled Video';
  videoTitle.textContent = title;
  videoTitle.title = title;

  // Show file size as quality indicator
  if (video.size) {
    videoQuality.hidden = false;
    videoQuality.textContent = formatSize(video.size);
    videoQuality.title = `File size: ${formatSize(video.size)}`;
  } else {
    videoQuality.hidden = true;
  }

  videoUrl.textContent = video.url;
  videoUrl.title = video.url;
  pageHost.textContent = getHost(pageInfo.pageUrl || video.url);
  videoKind.textContent = getVideoKind(video.url);

  const items = Array.from(videoList.querySelectorAll('.video-item'));
  items.forEach(item => {
    item.classList.toggle('selected', Number(item.dataset.index) === index);
  });
}

function renderVideoList(videos) {
  videoList.innerHTML = '';

  videos.forEach((v, i) => {
    const kind = getVideoKind(v.url);
    const host = getHost(v.url);
    const size = v.size ? formatSize(v.size) : '';
    const quality = v.quality || '';
    const source = v.source || '';

    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'video-item';
    item.dataset.index = String(i);
    item.innerHTML = `
      <div class="video-item__meta">
        <span class="pill pill-ghost">${kind}</span>
        ${quality ? `<span class="pill pill-ghost">${quality}</span>` : ''}
        ${size ? `<span class="pill pill-ghost">${size}</span>` : ''}
        ${source ? `<span class="pill pill-ghost">${source}</span>` : ''}
        <span class="text-xs text-muted-foreground">${host}</span>
      </div>
      <div class="video-item__url mono text-xs truncate">${v.url}</div>
    `;

    item.addEventListener('click', () => {
      selectedIndex = i;
      updateVideoInfo(i);
    });

    videoList.appendChild(item);
  });
}

function buildCreateUrl(videoUrl) {
  const params = new URLSearchParams();
  params.set('videoUrl', videoUrl);
  if (pageInfo.pageUrl) params.set('source', pageInfo.pageUrl);
  if (pageInfo.title) params.set('title', pageInfo.title);
  params.set('autoplay', '1');
  return `${APP_BASE_URL}/create?${params.toString()}`;
}

// Initialization
async function init() {
  showState('loading');

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      throw new Error("Couldn't find active tab");
    }

    // Inject content script (for DOM scanning)
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        files: ['contentScript.js'],
      });
    } catch (err) {
      console.warn('Failed to inject content script', err);
    }

    // Get page info from content script
    try {
      const info = await chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_INFO' });
      if (info) {
        pageInfo = info;
      }
    } catch (err) {
      // Use tab info as fallback
      pageInfo = { title: tab.title || '', pageUrl: tab.url || '' };
    }

    // Trigger DOM scan
    try {
      await chrome.tabs.sendMessage(tab.id, { type: 'SCAN_DOM' });
    } catch (err) {
      console.warn('DOM scan failed', err);
    }

    // Small delay to let DOM videos register
    await new Promise(resolve => setTimeout(resolve, 300));

    // Get videos from background script
    chrome.runtime.sendMessage({ type: 'GET_VIDEOS', tabId: tab.id }, response => {
      if (chrome.runtime.lastError) {
        console.warn('Runtime error:', chrome.runtime.lastError.message);
        errorMessage.textContent = 'Could not detect videos.';
        showState('error');
        return;
      }

      const videos = Array.isArray(response?.videos) ? response.videos : [];

      if (!videos.length) {
        errorMessage.textContent = 'No video found. Try playing it first.';
        showState('error');
        return;
      }

      detectedVideos = videos;
      selectedIndex = 0;

      videoCountPill.textContent = `${videos.length} ${videos.length === 1 ? 'video' : 'videos'}`;
      renderVideoList(videos);
      updateVideoInfo(0);
      showState('success');
    });
  } catch (err) {
    console.error('Popup init failed:', err);
    errorMessage.textContent = 'Something went wrong.';
    showState('error');
  }
}

// Event Handlers
createRoomBtn.addEventListener('click', () => {
  if (!detectedVideos[selectedIndex]) return;
  const url = buildCreateUrl(detectedVideos[selectedIndex].url);
  chrome.tabs.create({ url });
});

copyLinkBtn.addEventListener('click', async () => {
  if (!detectedVideos[selectedIndex]) return;
  const rawVideoUrl = detectedVideos[selectedIndex].url;

  try {
    await navigator.clipboard.writeText(rawVideoUrl);
    const originalText = copyLinkBtn.textContent;
    copyLinkBtn.textContent = 'Copied!';
    setTimeout(() => {
      copyLinkBtn.textContent = originalText;
    }, 2000);
  } catch (err) {
    console.error('Failed to copy', err);
  }
});

document.addEventListener('DOMContentLoaded', init);
