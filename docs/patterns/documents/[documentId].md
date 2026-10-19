# Pattern: Single document review (`/documents/[documentId]`)

Status: adopted — built 2026-10-17 (owner: "build everything")
Reference product and screen: Rossum — document validation screen (primary); Dext — item details page (secondary)
Source URL: https://knowledge-base.rossum.ai/docs/document-validation-screen-in-rossum
Source URL: https://knowledge-base.rossum.ai/docs/interactive-bounding-boxes-in-rossum
Source URL: https://knowledge-base.rossum.ai/docs/keyboard-shortcuts
Source URL: https://knowledge-base.rossum.ai/docs/guide-to-the-document-lifecycle
Source URL: https://help.dext.com/en/articles/105676-the-item-details-page
Source URL: https://help.dext.com/en/articles/416750-what-do-to-review-and-ready-mean-in-dext
Source URL: https://help.dext.com/en/articles/551293-are-there-keyboard-shortcuts-in-dext
Researched: 2026-10-15 (sources fetched by a research subagent). Confidence: high for states,
shortcuts and bounding-box behavior; medium for exact left/right placement.

## Purpose in Tabulado
One uploaded timesheet (photo, scan, PDF) with every value we read from it. The coordinator checks
the values that need review against the image and confirms the document.

## Hierarchy
Top to bottom, as documented by the references:
1. **Status messages bar** (Dext): messages about the document shown above everything (Dext shows
   publish failures/rejections here). Tabulado: extraction failures and "this document has N values
   that need review".
2. **Document toolbar** (Rossum top-left + top-centre): document name with an overflow menu (copy
   name / link); document details control; zoom in, zoom out, reset zoom; search within document.
3. **Issues panel** (Dext "Please resolve these issues"; Rossum automation-blocker list, expandable):
   list of the problems that stop this document being confirmed. Tabulado: failed validators
   (date outside period, in after out, > 24h, worker not on roster, no active assignment) and
   pass A / pass B disagreements.
4. **Body, two panes** (Dext: image on the left, data on the right):
   - **Document pane:** page image with bounding boxes over every extracted value; rotate, zoom,
     full screen, download (Dext).
   - **Data pane:** extracted fields. Header fields first (Rossum): client, worksite, period / week
     ending, document kind. Then the line-items table (Rossum "line items"): one row per worker-day
     (worker, date, in, out, break, total). Each field shows its validation indicator.
   - Data pane tabs (Dext): Details · History (audit trail).
5. **Action area** (Rossum bottom): primary **Confirm**, with **Reject** directly below it.
   Postpone exists in Rossum; its placement is not documented → not built until the owner decides.

## Interactions
- Hover a bounding box → the field holding that value is indicated (Rossum).
- Click a value on the image → focus jumps to its field (Rossum).
- Click a field → its bounding box is highlighted on the image. Required by SPEC §6 (provenance);
  Rossum documents only the image→field direction, so this direction follows the SPEC.
- Drag a box's corners to resize it (Rossum) → re-reads the value inside the new box.
- Keyboard (Rossum): Tab = next field; Enter = next field that is not yet validated; in the table,
  Tab moves along the row and arrow keys move between cells; Ctrl/⌘+Shift+F opens/closes search,
  Esc closes, Enter / Shift+Enter = next / previous match.
- Keyboard (Dext): Ctrl/⌘+J previous document, Ctrl/⌘+K next document.
- Editing a value requires a reason (SPEC §7) and is audited.
- Reject: enter a note; the document moves to a Rejected state and the note shows when reopened
  (Rossum).
- After Confirm: go to the next document that needs review (Rossum setting; Tabulado default).

## States
- Box / field colors by state (Rossum): **extracted, not reviewed** · **reviewed by a user** ·
  **blocks confirmation**. Tabulado maps these to `extracted` · `reviewed` · `needs_review`
  (SPEC §4). Colors come from the shadcn/Tailwind neutral palette tokens, not from Rossum.
- Field indicator (Rossum): a tick when confidence is at/above the threshold; no tick when it needs
  validation; field details show where the validation came from. Tabulado: field details show
  pass A value, pass B value, which validators ran, and the confidence.
- Document lifecycle (Rossum): importing → to review → reviewing → confirmed; also postponed,
  rejected; failed import. Tabulado document statuses use the same shape.
- Hover a status badge → tooltip listing the issues (Dext).

## Decided after research (2026-10-17)
- Loading: the record outline (`_components/loading.md`); a document not found: `_components/error.md`.
- A time file (CSV, XLSX) has no page image: the document pane shows the file's rows the values came
  from, the row of the chosen field highlighted (SPEC §6 provenance by row and column).
- Reject: the document's hours are rejected (not paid) after a confirmation; they can be restored
  from Review hours. Postpone and Delete are not built (placement not documented).
- Matching a written name to a worker offers to remember the nickname ("Remember 'Mike' as
  Michael?"), which adds it to the agency's nickname map (`settings/names.md`).

## Loading and errors (slice o)
- Loading: the page's outline in the record shape (`_components/loading.md`).
- A failure: the frame stays; the failed content's place says so with "Try again"
  (`_components/error.md`).

## Never copy
Logos, product names, icons, illustrations, wording or colors from Rossum or Dext.

Deviations allowed: none
