import { dispatchFieldEvents } from './utils.js';

const safeName = (name) => name.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '').trim().slice(0, 180) || 'Attachment';
const splitExtension = (filename) => { const dot = filename.lastIndexOf('.'); return dot > 0 ? [filename.slice(0, dot), filename.slice(dot)] : [filename, '']; };

// Auditor renders uploaded-file name fields with IDs such as ws-assure-generated-6.
// Exported so other field lookups (notably the Summary resolver) can recognise and
// reject these controls: mistaking a screenshot-name input for the Summary would feed
// a screenshot's own filename back in as the naming prefix.
export const ATTACHMENT_SELECTOR = [
  '[id^="ws-assure-generated-"]',
  'input[id^="ws-assure-generated-"]',
  '[data-file-name]',
  '.attachment [contenteditable="true"]',
  '.attachments input[type="text"]',
  'input[name*="attachment"]'
].join(', ');

const readValue = (element) => ('value' in element ? element.value : element.textContent) || '';

// True when the element is one of Auditor's screenshot-name controls (or lives inside an
// attachment row). Used to keep such controls out of unrelated field lookups.
export function isAttachmentNameField(element) {
  if (!element) return false;
  try {
    return element.matches(ATTACHMENT_SELECTOR) || Boolean(element.closest('[class*="attachment"], [id*="attachment"]'));
  } catch {
    return false;
  }
}

// Return the attachment name fields that currently represent a real screenshot,
// in document (visual) order. Elements that are detached, hidden, or empty are
// excluded so numbering always reflects the screenshots actually present now.
export function listAttachmentFields(dialog) {
  const candidates = [...new Set(dialog.querySelectorAll(ATTACHMENT_SELECTOR))];
  return candidates.filter((element) => {
    if (!element.isConnected || element.offsetParent === null) return false;
    const current = element.dataset.fileName || readValue(element);
    return Boolean(current && current.trim());
  });
}

// Rename every currently present screenshot to `<summary>-<n><ext>`, numbered
// sequentially from 1 in visual order. Numbering is derived only from the live
// DOM (never a cached counter), so adds, deletes, and reorders can never leave
// gaps or stale numbers. Fields already carrying the correct name are left
// untouched, which keeps the operation idempotent and prevents an observer from
// re-triggering itself. Returns { total, changed }.
export function renameAttachmentLabels(dialog, summary) {
  if (!summary || !summary.trim()) return { total: 0, changed: 0 };
  const fields = listAttachmentFields(dialog);
  let changed = 0;
  fields.forEach((element, index) => {
    const current = element.dataset.fileName || readValue(element);
    const [, extension] = splitExtension(current.trim());
    const next = `${safeName(summary)}-${index + 1}${extension}`;
    if (readValue(element) === next && element.dataset.fileName === next) return;
    if ('value' in element) element.value = next; else element.textContent = next;
    element.dataset.fileName = next;
    dispatchFieldEvents(element);
    changed += 1;
  });
  return { total: fields.length, changed };
}
