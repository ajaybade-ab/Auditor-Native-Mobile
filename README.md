# Auditor Smart Auto Fill

Chrome Manifest V3 extension for `https://axeauditor.dequecloud.com/`. It provides two independent features:

- **Excel issue autofill** — in the **Add New Issue** *and* **Edit Issue** dialogs, looks up the current Checkpoint + Description in the bundled mapping and fills Details (and Recommendation to Fix when supplied). The Description can be picked from a dropdown *or* typed/pasted into an editable Description control; a typed value fills once the typing settles, and text that matches no mapping row leaves Details untouched.
- **Screenshot naming** — in the **Add New Issue** *and* **Edit Issue** dialogs, names attached screenshots `<Summary>-1`, `<Summary>-2`, … The Summary is read live from the dialog that is currently open; Excel is never consulted, and naming never waits on Details or Recommendation to Fix.

## Install

1. In Chrome, open `chrome://extensions`, enable **Developer mode**, select **Load unpacked**, then choose this folder.
2. Open Auditor. The included checkpoint mapping loads automatically; select a Checkpoint and Description and Details is filled immediately.

## SheetJS dependency

The official SheetJS browser build and the supplied checkpoint workbook are bundled locally, because Manifest V3 does not permit executable remote dependencies.

## Notes

- Matching is case-, whitespace-, and line-break-insensitive.
- Checkpoints use prefix matching: a workbook value such as `1.1.1a` matches Auditor's full `1.1.1.a …` checkpoint label.
- The widget persists enabled state, position, collapse state, and parsed mappings in Chrome local storage.
- Auditor controls are resolved with IDs and labels, with graceful status messages when a control cannot be found. The Description resolver in particular collects every candidate control and prefers an exact label match ("Description*") over one that merely mentions the word — Auditor's "Auto-populate Summary with issue 'Description' for pre-defined options" checkbox is one such decoy, so it is never mistaken for the Description field.
- Each dialog gets its own controller: screenshots are only ever renamed inside the dialog that is currently open, and no Summary carries over from one dialog to the next.
- In the **Edit Issue** dialog, autofill waits until the user has actually interacted with the Description control (a real click, keypress, or edit inside that row). Auditor populates an Edit dialog's fields itself after the modal opens, and those script-driven changes must never overwrite Details an auditor already wrote. The **Add New Issue** dialog is unchanged — it autofills on any Description change.
- The **Native Mobile Details** toggle still gates all of this; with it off, neither dialog fills Details or Recommendation.
- Screenshot numbering is recalculated from the screenshots present right now, so adds, removals, and Summary changes never leave gaps or duplicate numbers.
- Browsers cannot rename an already-uploaded file on disk. The extension updates editable attachment-name controls exposed by Auditor; whether the server accepts the rename depends on the application UI.
