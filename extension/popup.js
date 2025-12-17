const APP_BASE_URL = 'https://sideby.me';

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
const pageHost = document.getElementById('page-host');

const createRoomBtn = document.getElementById('create-room');
const copyLinkBtn = document.getElementById('copy-link');

let detectedVideos = [];
let selectedIndex = 0;

async function injectContentScript(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: ['contentScript.js'],
    });
    return true;
  } catch (err) {
    console.warn('Failed to inject content script', err);
    return false;
  }
}

function getVideoKind(url) {
  if (/\.m3u8(\?|$)/i.test(url)) return 'HLS';
  if (/\.(mp4|m4v)(\?|$)/i.test(url)) return 'MP4';
  if (/\.webm(\?|$)/i.test(url)) return 'WebM';
  return 'Stream';
}

function getHost(url) {
  try {
    const host = new URL(url).hostname;
    return host.replace(/^www\./, '');
  } catch (_err) {
    return 'this page';
  }
}

function showState(state) {
  stateLoading.hidden = true;
  stateError.hidden = true;
  stateSuccess.hidden = true;

  if (state === 'loading') stateLoading.hidden = false;
  else if (state === 'error') stateError.hidden = false;
  else if (state === 'success') stateSuccess.hidden = false;
}

function updateVideoInfo(index) {
  if (!detectedVideos[index]) return;
  const video = detectedVideos[index];

  videoTitle.textContent = video.title || 'Untitled Video';
  videoTitle.title = video.title || ''; // Tooltip for truncated text
  videoUrl.textContent = video.videoUrl;
  videoUrl.title = video.videoUrl;
  pageHost.textContent = getHost(video.pageUrl || video.videoUrl);
  videoKind.textContent = getVideoKind(video.videoUrl);

  const items = Array.from(videoList.querySelectorAll('.video-item'));
  items.forEach(item => {
    item.classList.toggle('selected', Number(item.dataset.index) === index);
  });
}

function buildCreateUrl(info) {
  const params = new URLSearchParams();
  if (info.videoUrl) params.set('videoUrl', info.videoUrl);
  if (info.pageUrl) params.set('source', info.pageUrl);
  if (info.title) params.set('title', info.title);
  if (Number.isFinite(info.startAt) && info.startAt > 0) params.set('startAt', String(Math.floor(info.startAt)));
  params.set('autoplay', '1');
  return `${APP_BASE_URL}/create?${params.toString()}`;
}

async function init() {
  showState('loading');

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      throw new Error("Couldn't find active tab");
    }

    const injected = await injectContentScript(tab.id);
    if (!injected) {
      errorMessage.textContent = 'Cannot access this page. Try another tab.';
      showState('error');
      return;
    }

    chrome.tabs.sendMessage(tab.id, { type: 'GET_VIDEO_INFO' }, response => {
      // Handle connection errors (e.g., content script not loaded)
      if (chrome.runtime.lastError) {
        console.warn('Runtime error:', chrome.runtime.lastError.message);
        errorMessage.textContent = 'Refresh the page to detect videos.';
        showState('error');
        return;
      }

      try {
        const videos = Array.isArray(response?.videos) ? response.videos : [];

        if (!videos.length) {
          errorMessage.textContent = 'No video found. Try playing it first.';
          showState('error');
          return;
        }

        detectedVideos = videos;
        selectedIndex = 0;

        videoCountPill.textContent = `Detected ${videos.length} ${videos.length === 1 ? 'video' : 'videos'}`;

        videoList.innerHTML = '';
        videos.forEach((v, i) => {
          const kind = getVideoKind(v.videoUrl);
          const host = getHost(v.videoUrl);
          const item = document.createElement('button');
          item.type = 'button';
          item.className = 'video-item';
          item.dataset.index = String(i);
          item.innerHTML = `
          <div class="video-item__meta">
            <span class="pill pill-ghost">${kind}</span>
            <span class="text-xs text-muted-foreground">${host}</span>
          </div>
          <div class="video-item__title truncate">${v.title || 'Untitled video'}</div>
          <div class="video-item__url mono text-xs truncate">${v.videoUrl}</div>
        `;

          item.addEventListener('click', () => {
            selectedIndex = i;
            updateVideoInfo(i);
          });

          videoList.appendChild(item);
        });

        updateVideoInfo(0);
        showState('success');
      } catch (err) {
        console.error('Failed to render detected videos', err);
        errorMessage.textContent = 'Could not read video info from this page.';
        showState('error');
      }
    });
  } catch (err) {
    console.error('Popup init failed:', err);
    errorMessage.textContent = 'Something went wrong.';
    showState('error');
  }
}

createRoomBtn.addEventListener('click', () => {
  if (!detectedVideos[selectedIndex]) return;
  const url = buildCreateUrl(detectedVideos[selectedIndex]);
  chrome.tabs.create({ url });
});

copyLinkBtn.addEventListener('click', async () => {
  if (!detectedVideos[selectedIndex]) return;
  const url = buildCreateUrl(detectedVideos[selectedIndex]);

  try {
    await navigator.clipboard.writeText(url);
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
