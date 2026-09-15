chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['enabled', 'widgetPosition', 'collapsed'], (settings) => {
    chrome.storage.local.set({
      enabled: settings.enabled ?? true,
      widgetPosition: settings.widgetPosition ?? { top: 16, right: 16 },
      collapsed: settings.collapsed ?? false
    });
  });
});

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !tab.url?.startsWith('https://axeauditor.dequecloud.com/')) return;
  const activate = async () => chrome.tabs.sendMessage(tab.id, { type: 'AUDITOR_AUTOFILL_ACTIVATE' });
  try {
    await activate();
    return;
  } catch (error) {
    console.warn('[Auditor Smart Auto Fill] Content script not active, injecting extension files', error);
  }
  try {
    await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ['styles.css'] });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['lib/xlsx.full.min.js', 'content.js'] });
    await new Promise((resolve) => setTimeout(resolve, 250));
    await activate();
  } catch (error) {
    console.error('[Auditor Smart Auto Fill] Failed to inject or activate content script', error);
  }
});
