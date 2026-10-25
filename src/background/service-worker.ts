chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('Swift Jot extension successfully installed.');
  } else if (details.reason === 'update') {
    console.log('Swift Jot extension updated to version', chrome.runtime.getManifest().version);
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'ENSURE_PLAY_ON_LOAD' && typeof message.tabId === 'number') {
    const tabId = message.tabId;
    const playOnComplete = (updatedTabId: number, changeInfo: chrome.tabs.OnUpdatedInfo) => {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(playOnComplete);
        chrome.scripting
          .executeScript({
            target: { tabId },
            func: () => {
              const media = (document.querySelector('video') ||
                document.querySelector('audio')) as HTMLMediaElement | null;
              if (media) {
                media.play().catch(() => {
                  // Autoplay policy fallback: unmute or user gesture
                });
              }
            },
          })
          .catch((err) => {
            console.log('Auto-play local media execution:', err);
          });
      }
    };

    chrome.tabs.onUpdated.addListener(playOnComplete);
    setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(playOnComplete);
    }, 15000);

    sendResponse({ received: true });
    return true;
  }
});

