const APP_BASE_URL = 'https://sideby.me';

chrome.runtime.onInstalled.addListener(() => {
  try {
    chrome.contextMenus.create({
      id: 'sideby-pass',
      title: 'Play with Sideby Pass',
      contexts: ['video', 'link'],
    });
  } catch (e) {
    // Context menus may already exist on reinstall; ignore.
    console.error('Failed to create context menu', e);
  }
});

chrome.contextMenus.onClicked.addListener(info => {
  if (info.menuItemId !== 'sideby-watch-video') return;

  const videoUrl = info.srcUrl || info.linkUrl;
  if (!videoUrl) return;

  const params = new URLSearchParams();
  params.set('videoUrl', videoUrl);
  params.set('autoplay', '1');

  const url = `${APP_BASE_URL}/create?${params.toString()}`;
  chrome.tabs.create({ url });
});
