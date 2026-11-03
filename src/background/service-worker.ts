chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    console.log('Swift Jot extension successfully installed.');
    await chrome.action.setPopup({ popup: 'src/popup/popup.html' });
    await chrome.storage.local.set({
      swiftJotWindowState: 'snapped',
      swiftJotDetachedWindowId: null,
    });
  } else if (details.reason === 'update') {
    console.log('Swift Jot extension updated to version', chrome.runtime.getManifest().version);
    const data = (await chrome.storage.local.get('swiftJotWindowState')) as {
      swiftJotWindowState?: string;
    };
    if (data?.swiftJotWindowState === 'freely-positioned') {
      await chrome.action.setPopup({ popup: '' });
    } else {
      await chrome.action.setPopup({ popup: 'src/popup/popup.html' });
    }
  }
});

chrome.runtime.onStartup.addListener(async () => {
  const data = (await chrome.storage.local.get('swiftJotWindowState')) as {
    swiftJotWindowState?: string;
  };
  await chrome.storage.local.set({
    swiftJotDetachedWindowId: null,
  });
  if (data?.swiftJotWindowState === 'freely-positioned') {
    await chrome.action.setPopup({ popup: '' });
  } else {
    await chrome.action.setPopup({ popup: 'src/popup/popup.html' });
  }
});

chrome.windows.onRemoved.addListener(async (windowId) => {
  const data = (await chrome.storage.local.get('swiftJotDetachedWindowId')) as {
    swiftJotDetachedWindowId?: number | null;
  };
  if (data?.swiftJotDetachedWindowId === windowId) {
    await chrome.storage.local.set({
      swiftJotDetachedWindowId: null,
    });
    await chrome.action.setPopup({ popup: '' });
  }
});

async function openFreelyPositionedWindow(): Promise<chrome.windows.Window | null> {
  const data = (await chrome.storage.local.get([
    'swiftJotDetachedWindowId',
    'swiftJotDetachedPosition',
    'swiftJotDetachedSize',
    'swiftJotSnappedSize',
    'swiftJotPopupSize',
  ])) as {
    swiftJotDetachedWindowId?: number | null;
    swiftJotDetachedPosition?: { left: number; top: number };
    swiftJotDetachedSize?: { width: number; height: number };
    swiftJotSnappedSize?: { width: number; height: number };
    swiftJotPopupSize?: { width: number; height: number };
  };

  // 1. If detached window is already open, focus it (restore if minimized)
  if (typeof data.swiftJotDetachedWindowId === 'number') {
    try {
      const existingWin = await chrome.windows.get(data.swiftJotDetachedWindowId);
      if (existingWin?.id) {
        await chrome.windows.update(existingWin.id, {
          focused: true,
          state: existingWin.state === 'minimized' ? 'normal' : undefined,
        });
        return existingWin;
      }
    } catch {
      // Window is not currently open
    }
  }

  // 2. Re-create and open the freely positioned popup window
  const detachedPos = data.swiftJotDetachedPosition;
  const detachedSize = data.swiftJotDetachedSize;
  const snappedSize = data.swiftJotSnappedSize || data.swiftJotPopupSize;

  const width =
    detachedSize && typeof detachedSize.width === 'number'
      ? detachedSize.width
      : snappedSize?.width || 380;
  const height =
    detachedSize && typeof detachedSize.height === 'number'
      ? detachedSize.height
      : snappedSize?.height || 420;

  let left = detachedPos?.left;
  let top = detachedPos?.top;

  if (typeof left !== 'number' || typeof top !== 'number' || isNaN(left) || isNaN(top)) {
    try {
      const normalWindows = await chrome.windows.getAll({ windowTypes: ['normal'] });
      const currentWin = normalWindows.find((w) => w.focused) || normalWindows[0];
      if (currentWin) {
        left = (currentWin.left ?? 100) + Math.max(0, (currentWin.width ?? 1200) - width - 40);
        top = (currentWin.top ?? 100) + 80;
      } else {
        left = 100;
        top = 100;
      }
    } catch {
      left = 100;
      top = 100;
    }
  }

  try {
    const newWin = await chrome.windows.create({
      url: chrome.runtime.getURL('src/popup/popup.html?mode=detached'),
      type: 'popup',
      left: Math.round(left),
      top: Math.round(top),
      width: Math.round(width),
      height: Math.round(height),
      focused: true,
    });

    if (newWin?.id) {
      await chrome.storage.local.set({
        swiftJotWindowState: 'freely-positioned',
        swiftJotDetachedWindowId: newWin.id,
      });
      await chrome.action.setPopup({ popup: '' });
      return newWin;
    }
  } catch (err) {
    console.error('Failed to create freely positioned window:', err);
  }

  return null;
}

chrome.action.onClicked.addListener(async (tab) => {
  const data = (await chrome.storage.local.get([
    'swiftJotWindowState',
    'swiftJotDetachedWindowId',
  ])) as {
    swiftJotWindowState?: string;
    swiftJotDetachedWindowId?: number | null;
  };

  if (data?.swiftJotWindowState === 'freely-positioned' || data?.swiftJotDetachedWindowId) {
    const win = await openFreelyPositionedWindow();
    if (win) {
      return;
    }
  }

  // Fallback: switch to snapped mode
  await chrome.action.setPopup({ popup: 'src/popup/popup.html' });
  await chrome.storage.local.set({
    swiftJotWindowState: 'snapped',
    swiftJotDetachedWindowId: null,
  });

  if (tab.windowId) {
    try {
      await chrome.action.openPopup({ windowId: tab.windowId });
    } catch {
      // Next click opens the popup natively
    }
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'SNAP_TO_BUTTON') {
    (async () => {
      try {
        await chrome.action.setPopup({ popup: 'src/popup/popup.html' });
        await chrome.storage.local.set({
          swiftJotWindowState: 'snapped',
          swiftJotDetachedWindowId: null,
        });

        const normalWindows = await chrome.windows.getAll({ windowTypes: ['normal'] });
        const targetWin = normalWindows.find((w) => w.focused) || normalWindows[0];

        if (targetWin?.id) {
          await chrome.windows.update(targetWin.id, { focused: true });
          await new Promise((resolve) => setTimeout(resolve, 80));
          try {
            await chrome.action.openPopup({ windowId: targetWin.id });
          } catch (err) {
            console.log('Action openPopup notice:', err);
          }
        }
      } catch (err) {
        console.error('Failed to snap to button:', err);
      }
    })();
    sendResponse({ received: true });
    return true;
  }
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

