if (globalThis.__auditorAutoFillContentLoaded) {
  console.info('[Auditor Smart Auto Fill] content script already initialized');
} else {
  globalThis.__auditorAutoFillContentLoaded = true;
  console.info('[Auditor Smart Auto Fill] content script loaded (inactive until toolbar icon is clicked)');
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === 'AUDITOR_AUTOFILL_ACTIVATE') {
      globalThis.__auditorAutoFillRequested = true;
      globalThis.dispatchEvent(new Event('auditor-autofill-activate'));
    }
  });
  import(chrome.runtime.getURL('main.js')).catch((error) => console.error('[Auditor Smart Auto Fill] Unable to load modules', error));
}
