import { debounce, dispatchFieldEvents, logger, normalizeText } from './utils.js';
import { isAttachmentNameField, renameAttachmentLabels } from './attachmentManager.js';

// Controls that can never hold a value we read or fill: toggles, buttons, file pickers,
// hidden inputs. This matters most for the Description. The Add Issue dialog contains an
// "Auto-populate Summary with issue 'Description' for pre-defined options" CHECKBOX whose
// label text mentions "Description" and appears BEFORE the real Description control, so
// without this filter the label fallback resolves the Description to that checkbox — and
// its value ("on") matches no mapping row, so Details silently never fills.
const NON_VALUE_INPUT_TYPES = ['checkbox', 'radio', 'button', 'submit', 'reset', 'file', 'image', 'hidden', 'range', 'color'];
function isValueField(element) {
  if (!element) return false;
  if (element.tagName === 'SELECT' || element.tagName === 'TEXTAREA') return true;
  if (element.tagName === 'INPUT') return !NON_VALUE_INPUT_TYPES.includes(String(element.type || 'text').toLocaleLowerCase());
  return element.getAttribute('contenteditable') === 'true';
}
// A control the user can actually see. Auditor sometimes keeps a hidden library <select>
// alongside the visible text control, and the visible one is the source of truth.
function isVisibleField(element) {
  if (!element?.isConnected) return false;
  if (element.offsetParent !== null) return true;
  return typeof element.getClientRects === 'function' && element.getClientRects().length > 0;
}
const labelTextOf = (item) => normalizeText(item.textContent.replace('*', '').replace(/[:?]/g, ''));
function fieldForLabel(dialog, label) {
  if (label.htmlFor) {
    const target = dialog.querySelector(`#${CSS.escape(label.htmlFor)}`);
    if (target) return target;
  }
  const selector = 'input, select, textarea, [contenteditable="true"]';
  return label.querySelector(selector)
    || label.parentElement?.querySelector(selector)
    || label.nextElementSibling?.querySelector(selector)
    || label.parentElement?.nextElementSibling?.querySelector(selector)
    || null;
}
// Resolve a control from its label. An EXACT label match always wins over a label that
// merely mentions the word, and looser matches are tried shortest-first, so "Description*"
// beats "Auto-populate Summary with issue 'Description' for pre-defined options". Labels
// that resolve to a control `accept` rejects are skipped rather than ending the search.
function byLabel(dialog, labelText, accept = isValueField) {
  const normalizedLabel = normalizeText(labelText);
  const labels = [...dialog.querySelectorAll('label')];
  const exact = labels.filter((item) => labelTextOf(item) === normalizedLabel);
  const loose = labels
    .filter((item) => labelTextOf(item) !== normalizedLabel && (labelTextOf(item).includes(normalizedLabel) || normalizedLabel.includes(labelTextOf(item))))
    .sort((a, b) => labelTextOf(a).length - labelTextOf(b).length);
  for (const label of [...exact, ...loose]) {
    const field = fieldForLabel(dialog, label);
    if (field && accept(field)) return field;
  }
  return null;
}
// Locate the Summary control inside a SPECIFIC dialog. Every screenshot name comes from
// here, so the lookup is deliberately scoped to the passed dialog — never to `document`
// and never to Excel. Both the Add Issue and Edit Issue dialogs are served by this one
// resolver; the Edit dialog can render Summary read-only, which readSummaryText handles.
const SUMMARY_SELECTORS = [
  '#summary',
  'select[name="summary"]',
  'input[name="summary"]',
  'textarea[name="summary"]',
  '[name="summary"]',
  '[id$="summary" i]',
  '[name$="summary" i]',
  '[aria-label*="summary" i]',
  '[data-test-id*="summary" i]'
];
function findSummaryField(dialog) {
  // A screenshot-name input must never be mistaken for the Summary: byLabel walks forward
  // from the label, so a Summary rendered as static text would otherwise let it reach the
  // first attachment row and feed a screenshot's own filename back in as the prefix.
  const isField = (element) => (['INPUT', 'SELECT', 'TEXTAREA'].includes(element.tagName) || element.getAttribute('contenteditable') === 'true') && !isAttachmentNameField(element);
  for (const selector of SUMMARY_SELECTORS) {
    let matches;
    try { matches = [...dialog.querySelectorAll(selector)]; } catch { continue; }
    const field = matches.find(isField);
    if (field) return field;
  }
  const labelled = byLabel(dialog, 'Summary');
  return labelled && isField(labelled) ? labelled : null;
}
// Read the Summary currently shown in this dialog, or '' when none is selected yet.
// Placeholder options ("Select Summary…") count as "not selected" so screenshots keep
// their original filenames until the user actually picks a Summary.
function readSummaryText(dialog, field) {
  if (field?.isConnected) {
    if (field.tagName === 'SELECT' && !hasSelection(field)) return '';
    const value = valueOf(field).trim();
    if (value && !normalizeText(value).startsWith('select ')) return value;
    if (value) return '';
  }
  // Fallbacks for a Summary rendered as static text (possible in the Edit Issue dialog):
  // first the element that owns the summary id, then the node next to a "Summary" label.
  const readonly = dialog.querySelector('#summary');
  if (readonly && readonly !== field) {
    const text = (readonly.textContent || '').trim();
    if (text) return text;
  }
  const label = [...dialog.querySelectorAll('label, dt, th, [class*="label"]')].find((item) => normalizeText(item.textContent.replace('*', '').replace(/[:?]/g, '')) === 'summary');
  const labelled = label?.nextElementSibling?.textContent || label?.parentElement?.nextElementSibling?.textContent || '';
  return labelled.trim();
}
// Auditor renders the Description either as a library <select> (value is an internal
// UUID, so the option TEXT is what we look up) or as a free-text <textarea> next to a
// "Use the issue description library" link — and in some layouts both exist at once, the
// library select hidden behind the visible text control. Collect every candidate rather
// than committing to one, so the text can be read from whichever control actually holds
// it and so a typed Description is never masked by an empty library select.
const DESCRIPTION_SELECTORS = [
  '#description_id',
  '[name="description_id"]',
  '#description',
  '[name="description"]',
  'textarea[id*="description" i]',
  'textarea[name*="description" i]',
  'select[id*="description" i]',
  'select[name*="description" i]',
  'input[id*="description" i]',
  'input[name*="description" i]',
  '[aria-label*="description" i]',
  '[data-test-id*="description" i]'
];
function findDescriptionFields(dialog) {
  const found = [];
  const add = (element) => {
    if (!element || found.includes(element)) return;
    if (!isValueField(element) || isAttachmentNameField(element)) return;
    found.push(element);
  };
  for (const selector of DESCRIPTION_SELECTORS) {
    let matches;
    try { matches = [...dialog.querySelectorAll(selector)]; } catch { continue; }
    matches.forEach(add);
  }
  add(byLabel(dialog, 'Description'));
  // Visible first: a hidden library <select> must never mask the text the user can see.
  return found.sort((a, b) => (isVisibleField(b) ? 1 : 0) - (isVisibleField(a) ? 1 : 0));
}
// The Description text as the user sees it, or '' when nothing is chosen/typed yet.
// Placeholder options ("Select description…") count as "not chosen".
function readDescriptionText(fields = []) {
  for (const field of fields) {
    if (!field?.isConnected) continue;
    if (field.tagName === 'SELECT') {
      if (hasSelection(field)) return valueOf(field);
      continue;
    }
    const value = valueOf(field).trim();
    if (value && !normalizeText(value).startsWith('select ')) return value;
  }
  return '';
}
function findRecommendationField(dialog) {
  // The Auditor's "Recommendation to fix" input is <textarea id="notes" name="notes">.
  // A sibling hidden <select id="recommendation_id"> ("Recommendation Technique") appears
  // earlier in the DOM, so a comma-joined querySelector would match that select first
  // (querySelector returns the first element in DOM order matching ANY selector, not the
  // first selector that matches). Evaluate selectors in priority order instead, and reject
  // the technique <select> / hidden elements so the textarea is chosen.
  const selectors = [
    'textarea#notes',
    'textarea[name="notes"]',
    '#notes',
    '[name="notes"]',
    'textarea[id*="recommendation"]',
    'textarea[name*="recommendation"]',
    'input[id*="recommendation"]',
    'input[name*="recommendation"]',
    'textarea[id*="note"]',
    'textarea[name*="note"]',
    '[placeholder*="recommendation"]',
    '[placeholder*="notes"]',
    '[aria-label*="recommendation"]',
    '[aria-label*="notes"]'
  ];
  const isFillable = (element) => {
    if (!element) return false;
    // The recommendation technique dropdown is a <select> we must not fill.
    if (element.tagName === 'SELECT') return false;
    if (element.id === 'recommendation_id' || element.name === 'recommendation_id') return false;
    return true;
  };
  for (const sel of selectors) {
    const field = [...dialog.querySelectorAll(sel), ...(dialog !== document ? document.querySelectorAll(sel) : [])].find(isFillable);
    if (field) return field;
  }

  const hints = ['recommendation', 'recommendation to fix', 'fix', 'note', 'notes', 'suggested fix', 'how to fix'];
  const normalizedHints = hints.map(normalizeText);
  const isCandidate = (element) => element.tagName === 'TEXTAREA' || (element.tagName === 'INPUT' && ['text', 'search', 'url', 'tel', 'email'].includes(element.type)) || element.getAttribute('contenteditable') === 'true';
  const candidates = [...dialog.querySelectorAll('textarea, input, [contenteditable="true"]')];
  if (dialog !== document) candidates.push(...document.querySelectorAll('textarea, input, [contenteditable="true"]'));

  const scoreText = (element) => {
    const texts = [
      element.id,
      element.name,
      element.placeholder,
      element.title,
      element.getAttribute('aria-label'),
      element.getAttribute('data-test-id'),
      element.getAttribute('aria-describedby') && document.getElementById(element.getAttribute('aria-describedby'))?.textContent,
      ...(element.labels ? Array.from(element.labels).map((label) => label.textContent) : []),
      element.closest('label')?.textContent,
      element.previousElementSibling?.textContent,
      element.previousSibling?.textContent,
      element.parentElement?.previousElementSibling?.textContent,
      element.parentElement?.textContent,
      element.closest('div, section, fieldset, form, td, tr')?.textContent
    ].filter(Boolean).map(normalizeText).join(' ');
    return texts;
  };

  const scored = candidates
    .filter(isCandidate)
    .map((element) => ({ element, text: scoreText(element) }))
    .map(({ element, text }) => ({ element, score: normalizedHints.reduce((sum, hint) => sum + (text.includes(hint) ? 1 : 0), 0) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length) return scored[0].element;

  const textNodes = [...dialog.querySelectorAll('textarea, input, [contenteditable="true"]')].filter(isCandidate);
  for (const element of textNodes) {
    const labelText = normalizeText(element.closest('div, section, fieldset, form, td, tr')?.textContent || '');
    if (normalizedHints.some((hint) => labelText.includes(hint))) return element;
  }

  return null;
}
function valueOf(element) {
  if (!element) return '';
  // Auditor's Description select stores an internal UUID in value; use its visible option text for the Excel lookup.
  if (element.tagName === 'SELECT') return element.selectedOptions?.[0]?.textContent?.trim() || '';
  return 'value' in element ? element.value : element.innerText;
}
function hasSelection(element) {
  if (!element) return false;
  if (element.tagName !== 'SELECT') return Boolean(valueOf(element).trim());
  const label = valueOf(element).toLocaleLowerCase();
  return element.selectedIndex > 0 && label !== 'select description' && !label.startsWith('select ');
}
function setEditorValue(element, text) {
  if (!element) return false;
  if (element.tagName === 'SELECT') {
    const option = [...element.options].find((item) => item.value === text || item.textContent.trim() === text.trim());
    if (!option || element.value === option.value) return false;
    element.value = option.value;
    dispatchFieldEvents(element);
    return true;
  }
  const existing = valueOf(element).replace(/\s/g, '');
  if (existing === text.replace(/\s/g, '')) return false;
  if ('value' in element) element.value = `\n${text}`;
  else { element.innerHTML = ''; element.append(document.createElement('br'), document.createTextNode(text)); }
  dispatchFieldEvents(element);
  return true;
}
function clearEditorValue(element) {
  if (!element) return false;
  if (element.tagName === 'SELECT') return false;
  if (!valueOf(element).trim()) return false;
  if ('value' in element) element.value = '';
  else element.innerHTML = '';
  dispatchFieldEvents(element);
  return true;
}

export class DialogController {
  constructor(dialog, mapping, onStatus, onWorkflow, getRecommendationsEnabled = () => true, getScreenshotNamingEnabled = () => true, getNativeMobileDetailsEnabled = () => true, dialogKind = 'add') {
    this.dialog = dialog;
    // 'add' | 'edit'. Screenshot naming behaves identically in both. Excel-driven
    // Details/Recommendation autofill runs in both as well, but the Edit Issue dialog
    // additionally requires the user to have touched the Description control first
    // (see _descTouched / performFill), so Auditor's own post-open prefill can never
    // overwrite Details an auditor already wrote.
    this.dialogKind = dialogKind;
    this.mapping = mapping;
    this.onStatus = onStatus;
    this.onWorkflow = onWorkflow;
    this.getRecommendationsEnabled = getRecommendationsEnabled;
    this.getScreenshotNamingEnabled = getScreenshotNamingEnabled;
    // When Native Mobile Details is off, no native autofill (Details/Recommendation)
    // runs. Screenshot naming is independent of this flag.
    this.getNativeMobileDetailsEnabled = getNativeMobileDetailsEnabled;
    this.boundUpdate = debounce(() => { this.update(); this.syncScreenshotSummary(); }, 275);
    this.detailsAutoFilledFor = null;
    this._descChangeHandler = null;
    // Typed/edited Description support: the Description control is not always a <select>
    // (Auditor can render it as a free-text or type-to-search input), and a select only
    // fires `change`. Debounced so autofill runs once the typing settles rather than on
    // every keystroke; lookups are exact, so partially typed text simply finds no match
    // and leaves Details untouched.
    this._descInputHandler = null;
    this._descTypedFill = debounce(() => { this.performFill({ silent: true }); this.onDescriptionChanged(); }, 400);
    // True once a real (isTrusted) user interaction has landed on the Description
    // control in this dialog. Only the Edit Issue dialog gates on it.
    this._descTouched = false;
    this._descTouchHandler = null;
    this._cpChangeHandler = null;
    this._summaryChangeHandler = null;
    this._boundSummaryField = null;
    this._summaryPoll = null;
    this._stopped = false;
    // The naming prefix in effect right now: the Summary read live out of THIS dialog.
    // Screenshot naming depends ONLY on this (and the live screenshot list) — never on
    // Excel, Details, or Recommendation to Fix. Empty means no Summary is selected yet,
    // so screenshots keep their original filenames.
    this.currentScreenshotPrefix = '';
    // Continuous screenshot monitoring; started as soon as the dialog is observed so a
    // screenshot added before a Summary exists is already being tracked.
    this._screenshotObserver = null;
    this._renamingScreenshots = false;
    // Quick pass coalesces bursts of additions; the settle pass re-checks a little
    // later so screenshots whose name field is populated asynchronously (after the
    // row is inserted) are still caught. Both are idempotent, so running twice is safe.
    this._boundScreenshotScan = debounce(() => this.syncScreenshotSummary(), 120);
    this._boundScreenshotSettle = debounce(() => this.syncScreenshotSummary(), 500);
  }

  start() {
    this.descriptionFields = findDescriptionFields(this.dialog);
    this.fields = {
      summary: findSummaryField(this.dialog),
      checkpoint: this.dialog.querySelector('#combobox, [name="checkpoint"]') || byLabel(this.dialog, 'Checkpoint'),
      // Kept for the existing null-checks and status messages; every read goes through
      // readDescriptionText() over the full candidate list instead.
      description: this.descriptionFields[0] || null,
      details: this.dialog.querySelector('#details, [name="details"]') || byLabel(this.dialog, 'Details'),
      recommendation: findRecommendationField(this.dialog) || byLabel(this.dialog, 'Recommendation to Fix')
    };
    const describe = (field) => (field ? `${field.tagName.toLocaleLowerCase()}${field.type ? `[type=${field.type}]` : ''}#${field.id || '-'}[name=${field.name || '-'}]${isVisibleField(field) ? '' : ' (hidden)'}` : null);
    logger.debug('Dialog fields resolved', {
      dialogKind: this.dialogKind,
      summary: describe(this.fields.summary),
      checkpoint: describe(this.fields.checkpoint),
      description: this.descriptionFields.map(describe),
      details: describe(this.fields.details),
      recommendation: describe(this.fields.recommendation)
    });

    // Generic input updates for status; autofill of Details is performed only on Description change.
    Object.values(this.fields).filter(Boolean).forEach((field) => field.addEventListener('input', this.boundUpdate));
    this.dialog.addEventListener('change', this.boundUpdate);

    // Bind change/input handling at the DIALOG level (delegated) rather than to one
    // resolved field: Auditor can expose the Description as a library <select> AND a
    // free-text control at once, or swap one for the other after the dialog opens.
    // findDescriptionFields() returns every candidate; delegation means whichever one the
    // user actually edits drives autofill, with no rebinding needed if the DOM changes.
    // performFill() owns Details/Recommendation, onDescriptionChanged() owns screenshot
    // naming; naming must still run when Details is skipped (e.g. re-selecting the same
    // Description), so it is invoked separately rather than from inside performFill().
    this._descChangeHandler = (event) => {
      if (!this.descriptionFields.includes(event.target)) return;
      this.markDescriptionTouched(event); this.performFill(); this.onDescriptionChanged();
    };
    this.dialog.addEventListener('change', this._descChangeHandler);
    // A typed or pasted Description must autofill too, not only a dropdown pick. `input`
    // fires on every keystroke (and alongside `change` for a <select>), so the work is
    // debounced and runs silently — a half-typed value matches nothing and must not
    // report "No mapping found". performFill() is idempotent via detailsAutoFilledFor,
    // so the extra select-driven pass is a no-op.
    this._descInputHandler = (event) => {
      if (!this.descriptionFields.includes(event.target)) return;
      this.markDescriptionTouched(event); this._descTypedFill();
    };
    this.dialog.addEventListener('input', this._descInputHandler);
    // Custom comboboxes can apply a selection with untrusted events, so also treat a
    // real click/keypress inside a Description row as the user touching it. Capture
    // phase, because Auditor's own handlers may stop propagation.
    this._descTouchHandler = (event) => this.markDescriptionTouched(event);
    this.dialog.addEventListener('pointerdown', this._descTouchHandler, true);
    this.dialog.addEventListener('keydown', this._descTouchHandler, true);

    // Reset autofill marker when checkpoint changes (so details can be refilled for new checkpoint/description).
    if (this.fields.checkpoint) {
      this._cpChangeHandler = () => { this.detailsAutoFilledFor = null; };
      this.fields.checkpoint.addEventListener('change', this._cpChangeHandler);
    }

    // Watch the Summary control itself so a typed or picked Summary renames screenshots
    // immediately, in the Add Issue and Edit Issue dialogs alike.
    this.bindSummaryField();

    this.mutations = new MutationObserver(this.boundUpdate);
    this.mutations.observe(this.dialog, { subtree: true, childList: true, characterData: true });
    this.update();
    // Start watching for screenshots straight away — before any Summary exists — so a
    // screenshot added first is already tracked and gets named the moment a Summary
    // appears. Independent of native autofill; gated only by the Screenshot Naming toggle.
    this.startScreenshotWatch();
    // A Summary is usually already present when the dialog opens (always so for Edit
    // Issue). No event fires in that case, so read it now and name what is attached.
    this.syncScreenshotSummary();
    // Auditor sets #summary programmatically (e.g. from the Description) without firing
    // input/change, and re-renders parts of the Edit dialog after it opens. A light poll
    // is the only reliable way to notice those; every pass is idempotent.
    this._summaryPoll = setInterval(() => this.syncScreenshotSummary(), 600);
  }

  // The form row(s) that own the Description control(s). A custom combobox renders its
  // toggle button and option list as siblings of the field inside its row, so scoping
  // touch detection to the row catches those clicks while still ignoring interaction with
  // unrelated parts of the dialog. Every candidate field contributes its own row, since
  // Auditor can expose more than one Description control at once.
  descriptionRegions() {
    return (this.descriptionFields || [])
      .filter((field) => field?.isConnected)
      .map((field) => field.closest('div, section, fieldset, td, tr, li') || field);
  }

  // Record that the user — not Auditor's own prefill — is driving the Description.
  // Untrusted (script-dispatched) events never count, which is what keeps the Edit
  // Issue dialog's existing Details safe while Auditor populates the modal.
  markDescriptionTouched(event) {
    if (this._descTouched || !event?.isTrusted) return;
    const regions = this.descriptionRegions();
    if (regions.length && event.target instanceof Node && !regions.some((region) => region.contains(event.target))) return;
    this._descTouched = true;
    logger.debug('Description touched by user', { dialogKind: this.dialogKind, type: event.type });
  }

  // (Re)attach the Summary listeners, re-resolving the control when Auditor has replaced
  // it. Called on start and from readDialogSummary whenever the field goes stale.
  bindSummaryField() {
    const field = this.fields.summary;
    if (!field || field === this._boundSummaryField) return;
    if (this._boundSummaryField && this._summaryChangeHandler) {
      this._boundSummaryField.removeEventListener('input', this._summaryChangeHandler);
      this._boundSummaryField.removeEventListener('change', this._summaryChangeHandler);
    }
    this._summaryChangeHandler = this._summaryChangeHandler || (() => this.syncScreenshotSummary());
    field.addEventListener('input', this._summaryChangeHandler);
    field.addEventListener('change', this._summaryChangeHandler);
    this._boundSummaryField = field;
  }

  // The single source of truth for screenshot names: the Summary currently displayed in
  // THIS dialog. Excel is never consulted here, and neither Details nor Recommendation
  // to Fix is read or waited for.
  readDialogSummary() {
    if (!this.dialog?.isConnected || !this.fields) return '';
    if (!this.fields.summary?.isConnected) {
      // Auditor re-rendered the control (common in Edit Issue, which fills its fields
      // after the modal is inserted) — resolve it again from this dialog and re-bind.
      this.fields.summary = findSummaryField(this.dialog);
      this.bindSummaryField();
    }
    return readSummaryText(this.dialog, this.fields?.summary);
  }

  // Read the current Summary from the active dialog and keep the screenshot names in
  // step with it. Safe to call as often as we like: renaming is idempotent.
  syncScreenshotSummary() {
    if (this._stopped || !this.dialog?.isConnected) return;
    const summary = this.readDialogSummary();
    const changed = summary !== this.currentScreenshotPrefix;
    this.currentScreenshotPrefix = summary;
    if (!this.getScreenshotNamingEnabled()) return;
    // No Summary selected yet → leave every filename exactly as the user uploaded it.
    if (!summary) return;
    this.startScreenshotWatch();
    if (changed) logger.debug('Screenshot naming prefix updated', { dialogKind: this.dialogKind, summary });
    // Numbering restarts from 1 on every pass, so a Summary change renames the existing
    // screenshots in place and newly added ones simply continue the sequence.
    this.renameAllScreenshots();
  }
  refresh() { this.update(); }
  update() {
    // The Edit Issue dialog does not walk the Checkpoint → Description → Details workflow
    // states; it reports screenshot naming, plus the autofill hint when native Details is
    // on, so the user knows changing the Description will refill Details there too.
    if (this.dialogKind === 'edit') {
      const naming = this.getScreenshotNamingEnabled();
      const hint = this.getNativeMobileDetailsEnabled() ? ' — change Description to autofill Details' : '';
      this.onStatus(`${naming ? 'Edit Issue — screenshot naming active' : 'Edit Issue — screenshot naming off'}${hint}`, naming ? 'success' : 'warning');
      return;
    }
    const { checkpoint, details } = this.fields;
    if (!checkpoint || !this.descriptionFields?.length || !details) { this.onStatus('Waiting for Auditor fields…', 'warning'); return; }
    if (!hasSelection(checkpoint)) { this.onWorkflow('checkpoint'); this.onStatus('Select Checkpoint', 'warning'); return; }
    const descriptionText = readDescriptionText(this.descriptionFields);
    if (!descriptionText) { this.onWorkflow('description'); this.onStatus('Select Description', 'warning'); return; }
    const match = this.mapping.find(valueOf(checkpoint), descriptionText);
    if (!match) { this.onWorkflow('details'); this.onStatus('No mapping found', 'error'); return; }

    // We do not overwrite the Details field on every update to allow user edits.
    // Instruct user to change the Description to trigger autofill.
    this.onWorkflow('details');
    this.onStatus('Mapping available — change Description to autofill Details', 'success');
  }

  // Perform autofill of Details when Description selection changes. This will only run
  // if we haven't already autofilled for the same Description value, preserving user edits.
  // `silent` suppresses the "no mapping" warning: a typed Description passes through
  // many non-matching intermediate values, and each one must not raise a warning.
  performFill({ silent = false } = {}) {
    // Native autofill master switch: when Native Mobile Details is off, never fill
    // Details or Recommendation. Screenshot naming is handled separately and unaffected.
    if (!this.getNativeMobileDetailsEnabled()) return;
    // The Add Issue dialog fills unconditionally, exactly as before. The Edit Issue
    // dialog fills too, but only after the user has actually touched the Description
    // control: Auditor populates the Edit dialog's fields asynchronously after the modal
    // is inserted, and that prefill must never overwrite Details the auditor wrote.
    if (this.dialogKind !== 'add' && this.dialogKind !== 'edit') return;
    if (this.dialogKind === 'edit' && !this._descTouched) return;
    const { checkpoint, details, recommendation } = this.fields;
    if (!checkpoint || !this.descriptionFields?.length || !details) return;
    const descText = readDescriptionText(this.descriptionFields);
    if (!hasSelection(checkpoint) || !descText) return;
    // Avoid refilling if we already autofilled for this exact description
    if (this.detailsAutoFilledFor === descText) return;
    const match = this.mapping.find(valueOf(checkpoint), descText);
    logger.debug('performFill lookup', {
      checkpoint: valueOf(checkpoint),
      description: descText,
      match: match ? {
        details: match.details?.slice(0, 60),
        recommendation: match.recommendation?.slice(0, 60)
      } : null,
      recommendationField: !!recommendation,
      recommendationFieldTag: recommendation?.tagName,
      recommendationFieldId: recommendation?.id,
      recommendationFieldName: recommendation?.name
    });
    if (!match) { if (!silent) this.onStatus('No mapping found for selected Description', 'error'); return; }

    const detailsChanged = setEditorValue(details, match.details);
    // Fill Recommendation to Fix only when the widget's Recommendations toggle is on;
    // otherwise leave the field empty.
    if (recommendation) {
      if (this.getRecommendationsEnabled() && match.recommendation) setEditorValue(recommendation, match.recommendation);
      else clearEditorValue(recommendation);
    }
    const detailsPresent = normalizeText(valueOf(details)).includes(normalizeText(match.details).slice(0, 30));
    if (detailsChanged || detailsPresent) {
      this.detailsAutoFilledFor = descText;
      this.onWorkflow('details'); this.onStatus('Details updated', 'success');
    } else {
      this.onWorkflow('details'); this.onStatus('Could not update Details field', 'error');
    }
  }

  // A Description change is no longer what drives screenshot naming — the Summary is.
  // Selecting a Description can, however, make Auditor populate Summary asynchronously,
  // so re-read the Summary now and again once it has settled. Both passes are idempotent
  // and neither consults Details or Recommendation to Fix.
  onDescriptionChanged() {
    this.syncScreenshotSummary();
    setTimeout(() => this.syncScreenshotSummary(), 350);
  }

  // Begin continuously monitoring for newly added screenshots. Safe to call
  // repeatedly; only the first call attaches an observer (no duplicate observers).
  //
  // The observer watches the whole dialog rather than a narrower "attachments"
  // element on purpose: Auditor inserts each screenshot as a new row that is a
  // SIBLING of the previous rows, so any container derived from an existing row
  // (via closest('[class*="attachment"]')) would exclude later siblings and only
  // the first screenshot would be seen. The dialog reliably contains every row,
  // which is the same scope renameAttachmentLabels already queries.
  startScreenshotWatch() {
    if (!this.getScreenshotNamingEnabled()) return;
    if (this._screenshotObserver || !this.dialog?.isConnected) return;
    this._screenshotObserver = new MutationObserver(() => { this._boundScreenshotScan(); this._boundScreenshotSettle(); });
    this._screenshotObserver.observe(this.dialog, { childList: true, subtree: true });
    // Rename anything already present right away.
    this.renameAllScreenshots();
  }

  // Single, reusable rename entry point — the "renameAllScreenshotsFromAuditorSummary"
  // of this design — used identically by the Add Issue and Edit Issue dialogs. It is
  // called from the Summary watcher, the screenshot-added/removed observer, and the
  // toggle handlers. It re-derives every screenshot name from the live DOM of THIS
  // dialog using the Summary read from THIS dialog, so screenshots belonging to another
  // dialog can never be touched. Detaches the observer around the mutation so our own
  // edits cannot re-trigger it (prevents an infinite loop). Numbering always comes from
  // the current screenshots (never a cached counter), so adds, deletes, and reorders
  // stay sequential and gap-free, and screenshots already carrying the correct name are
  // left untouched.
  renameAllScreenshots(summaryPrefix = this.currentScreenshotPrefix) {
    // Toggle off → screenshot naming is completely disabled; leave every name untouched.
    if (!this.getScreenshotNamingEnabled()) return;
    if (this._renamingScreenshots || !this.dialog?.isConnected) return;
    // No Summary selected in this dialog → keep the original filenames.
    if (!summaryPrefix || !summaryPrefix.trim()) return;
    this._renamingScreenshots = true;
    try {
      this._screenshotObserver?.disconnect();
      renameAttachmentLabels(this.dialog, summaryPrefix);
    } finally {
      if (this._screenshotObserver && this.dialog?.isConnected) {
        this._screenshotObserver.observe(this.dialog, { childList: true, subtree: true });
      }
      this._renamingScreenshots = false;
    }
  }
  // React to the widget's Recommendations toggle without waiting for the next Description change:
  // fill the current match when enabled, clear the field when disabled.
  setRecommendationsEnabled(enabled) {
    const { checkpoint, recommendation } = this.fields || {};
    if (!recommendation) return;
    if (!enabled) { clearEditorValue(recommendation); return; }
    // Respect the native master switch: do not fill while Native Mobile Details is off.
    if (!this.getNativeMobileDetailsEnabled()) return;
    const descText = readDescriptionText(this.descriptionFields);
    if (!checkpoint || !descText || !hasSelection(checkpoint)) return;
    const match = this.mapping.find(valueOf(checkpoint), descText);
    if (match?.recommendation) setEditorValue(recommendation, match.recommendation);
  }
  // React to the Native Mobile Details master toggle. Turning it off simply stops
  // future native autofill (existing field values are left as the user has them, per
  // spec — no clearing). Turning it back on lets autofill resume on the next Description
  // change. Screenshot naming is never touched here.
  setNativeMobileDetailsEnabled() { /* gating is read live via getNativeMobileDetailsEnabled(); no immediate action required */ }
  // React to the widget's Screenshot Naming toggle immediately. Disabling stops the
  // watcher and leaves every existing screenshot name untouched. Enabling resumes the
  // watcher and renames whatever screenshots are currently attached, re-reading the
  // Summary in case it changed while naming was off. This never touches Details or
  // Recommendation, and applies to the Add and Edit dialogs alike.
  setScreenshotNamingEnabled(enabled) {
    if (!enabled) {
      this._screenshotObserver?.disconnect();
      this._screenshotObserver = null;
      return;
    }
    this.syncScreenshotSummary();
  }
  stop() {
    this._stopped = true;
    clearInterval(this._summaryPoll);
    this._summaryPoll = null;
    this.mutations?.disconnect();
    this._screenshotObserver?.disconnect();
    this._screenshotObserver = null;
    Object.values(this.fields || {}).filter(Boolean).forEach((field) => field.removeEventListener('input', this.boundUpdate));
    if (this._descChangeHandler) this.dialog.removeEventListener('change', this._descChangeHandler);
    if (this._descInputHandler) this.dialog.removeEventListener('input', this._descInputHandler);
    if (this._descTouchHandler) {
      this.dialog.removeEventListener('pointerdown', this._descTouchHandler, true);
      this.dialog.removeEventListener('keydown', this._descTouchHandler, true);
    }
    // A fresh controller is built per dialog, but clear the marker so a stopped
    // controller can never be revived with someone else's "user touched it" state.
    this._descTouched = false;
    if (this.fields?.checkpoint && this._cpChangeHandler) this.fields.checkpoint.removeEventListener('change', this._cpChangeHandler);
    if (this._boundSummaryField && this._summaryChangeHandler) {
      this._boundSummaryField.removeEventListener('input', this._summaryChangeHandler);
      this._boundSummaryField.removeEventListener('change', this._summaryChangeHandler);
    }
    this._boundSummaryField = null;
    // Drop the naming prefix so nothing can leak into the next dialog. main.js builds a
    // fresh controller per dialog, but clearing keeps a stopped controller inert.
    this.currentScreenshotPrefix = '';
    logger.debug('Stopped monitoring issue dialog', { dialogKind: this.dialogKind });
  }
}
