export const normalizeText = (value = '') => String(value).replace(/\s+/g, ' ').trim().toLocaleLowerCase();
// Mapping descriptions are prose, so spacing and letter case must never prevent a match.
export const normalizeLookupText = (value = '') => normalizeText(value).replace(/[^a-z0-9]/g, '');
// Auditor displays a full label (for example, "1.1.1.a Non-text Content"),
// while the workbook stores only its success-criterion prefix ("1.1.1a").
export const normalizeCheckpointPrefix = (value = '') => normalizeText(value).replace(/[^a-z0-9]/g, '');
export const makeKey = (checkpoint, description) => `${normalizeText(checkpoint)}\u0000${normalizeLookupText(description)}`;
export const debounce = (callback, delay = 250) => { let timer; return (...args) => { clearTimeout(timer); timer = setTimeout(() => callback(...args), delay); }; };
export const logger = {
  debug: (...args) => console.debug('[Auditor Auto Fill]', ...args),
  info: (...args) => console.info('[Auditor Auto Fill]', ...args),
  warn: (...args) => console.warn('[Auditor Auto Fill]', ...args),
  error: (...args) => console.error('[Auditor Auto Fill]', ...args)
};
export function dispatchFieldEvents(element) {
  if (!element) return;
  try {
    element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
  } catch (error) {
    element.dispatchEvent(new Event('input', { bubbles: true }));
  }
  element.dispatchEvent(new Event('change', { bubbles: true }));
  element.dispatchEvent(new Event('blur', { bubbles: true }));
}
