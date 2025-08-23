chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    await chrome.storage.sync.set({
      blockedItems: [],
      isEnabled: true
    });
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync') {
    chrome.tabs.query({ url: '*://chzzk.naver.com/*' }, (tabs) => {
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, {
          action: 'settingsChanged',
          changes: changes
        }).catch(() => {
          // Ignore errors for inactive tabs
        });
      });
    });
  }
});

chrome.action.onClicked.addListener((tab) => {
  if (tab.url && tab.url.includes('chzzk.naver.com')) {
    chrome.action.openPopup();
  }
});