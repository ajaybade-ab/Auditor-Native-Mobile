const STORAGE_KEY = 'auditor-autofill-settings';
const chromeStorageAvailable = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;
const get = async (keys) => {
  if (chromeStorageAvailable) {
    return chrome.storage.local.get(keys);
  }
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    const parsed = stored ? JSON.parse(stored) : {};
    if (!keys) return parsed;
    return Array.isArray(keys)
      ? keys.reduce((result, key) => ({ ...result, [key]: parsed[key] }), {})
      : { [keys]: parsed[keys] };
  } catch {
    return {};
  }
};
const set = async (values) => {
  if (chromeStorageAvailable) {
    return chrome.storage.local.set(values);
  }
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    const parsed = stored ? JSON.parse(stored) : {};
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...parsed, ...values }));
  } catch {
    // ignore storage failures
  }
};
export const settingsStore = {
  async load() { return get(['enabled', 'collapsed', 'widgetPosition', 'recommendations', 'screenshotNaming', 'nativeMobileDetails', 'mappingCache', 'mappingFileName', 'mappingReport', 'mappingVersion']); },
  async saveMapping(cache, mappingFileName, mappingReport, mappingVersion) { return set({ mappingCache: cache, mappingFileName, mappingReport, mappingVersion }); },
  async saveUi(values) { return set(values); }
};
