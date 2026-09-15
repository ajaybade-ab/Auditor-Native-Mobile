import { debounce, normalizeText } from './utils.js';

// Auditor uses the same modal shell for creating and for editing an issue; only the
// heading distinguishes them ("Add New Issue" vs "Edit Issue" / "Edit Issue #1234").
// Screenshot naming and Excel-driven autofill both run in BOTH, so the observer
// classifies whichever dialog is open instead of matching one exact title. The kind is
// still reported to onOpen because the controller treats the two differently: the Add
// dialog autofills on any Description change, while the Edit dialog waits until the user
// has actually touched the Description control.
export function classifyDialog(candidate) {
  const heading = candidate.querySelector('#issue-heading h2, h1, h2, [role="heading"]');
  if (!heading) return null;
  const title = normalizeText(heading.textContent);
  if (!/\bissue\b/.test(title)) return null;
  if (/\badd\b|\bnew\b|\bcreate\b/.test(title)) return 'add';
  if (/\bedit\b|\bupdate\b/.test(title)) return 'edit';
  return null;
}

export class DialogObserver {
  constructor(onOpen, onClose) { this.onOpen = onOpen; this.onClose = onClose; this.active = null; this.activeKind = null; }
  start() {
    this.observe = new MutationObserver(debounce(() => this.scan(), 100));
    this.observe.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-hidden', 'style', 'class'] });
    this.scan();
  }
  scan() {
    const visible = [...document.querySelectorAll('#issue, [role="dialog"], .modal')]
      .map((element) => ({ element, kind: classifyDialog(element) }))
      .filter((item) => item.kind && item.element.offsetParent !== null);
    // If Auditor keeps more than one issue modal in the DOM, the last visible one is the
    // most recently opened (topmost) — that is the dialog the user is working in.
    const match = visible[visible.length - 1] || null;
    const dialog = match?.element || null;
    const kind = match?.kind || null;
    // The kind is part of the identity: Auditor can reuse the SAME element for Add and
    // Edit. Treating a kind flip as a close+open tears down the old controller so no
    // Summary/screenshot state leaks from one dialog into the other.
    if (dialog === this.active && kind === this.activeKind) return;
    if (this.active) this.onClose(this.active);
    this.active = dialog;
    this.activeKind = kind;
    if (this.active) this.onOpen(this.active, kind);
  }
  stop() { this.observe?.disconnect(); if (this.active) this.onClose(this.active); this.active = null; this.activeKind = null; }
}
