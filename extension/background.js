const APP_BASE_URL = 'https://sideby.me';

chrome.runtime.onInstalled.addListener(() => {
  try {
    chrome.contextMenus.create({
      id: 'sideby-watch-video',
      title: 'Watch this video with friends on sideby.me',
      contexts: ['video'],
    });
  } catch (e) {
    // Context menus may already exist on reinstall; ignore.
    console.error('Failed to create context menu', e);
  }
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'sideby-watch-video' && info.srcUrl) {
    const params = new URLSearchParams();
    params.set('videoUrl', info.srcUrl);
    params.set('autoplay', '1');

    const url = `${APP_BASE_URL}/create?${params.toString()}`;
    chrome.tabs.create({ url });
  }
});
