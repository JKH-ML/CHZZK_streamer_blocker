chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    await chrome.storage.sync.set({
      blockedItems: [],
      isEnabled: true
    });
  }
  
  // 컨텍스트 메뉴 생성
  chrome.contextMenus.create({
    id: "hideStreamer",
    title: "스트리머 숨기기",
    contexts: ["all"],
    documentUrlPatterns: ["https://chzzk.naver.com/*"]
  });
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

// 컨텍스트 메뉴 업데이트
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "updateContextMenu") {
    chrome.contextMenus.update("hideStreamer", {
      title: message.title
    });
  }
});

// 컨텍스트 메뉴 클릭 처리
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "hideStreamer") {
    // content script에 메시지 전송하여 해당 위치의 스트리머 처리
    chrome.tabs.sendMessage(tab.id, {
      action: "handleContextMenu"
    });
  }
});