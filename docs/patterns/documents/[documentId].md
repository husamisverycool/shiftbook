# Pattern: Single document review (`/documents/[documentId]`)

Status: researched — ready for owner review
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

## Purpose in Granite
One uploaded timesheet (photo, scan, PDF) with every value we read from it. The coordinator checks
the values that need review against the image and confirms the document.

## Hierarchy
Top to bottom, as documented by the references:
1. **Status messages bar** (Dext): messages about the document shown above everything (Dext shows
   publish failures/rejections here). Granite: extraction failures and "this document has N values
   that need review".
2. **Document toolbar** (Rossum top-left + top-centre): document name with an overflow menu (copy
   name / link); document details control; zoom in, zoom out, reset zoom; search within document.
3. **Issues panel** (Dext "Please resolve these issues"; Rossum automation-blocker list, expandable):
   list of the problems that stop this document being confirmed. Granite: failed validators
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
- After Confirm: go to the next document that needs review (Rossum setting; Granite default).

## States
- Box / field colors by state (Rossum): **extracted, not reviewed** · **reviewed by a user** ·
  **blocks confirmation**. Granite maps these to `extracted` · `reviewed` · `needs_review`
  (SPEC §4). Colors come from the shadcn/Tailwind neutral palette tokens, not from Rossum.
- Field indicator (Rossum): a tick when confidence is at/above the threshold; no tick when it needs
  validation; field details show where the validation came from. Granite: field details show
  pass A value, pass B value, which validators ran, and the confidence.
- Document lifecycle (Rossum): importing → to review → reviewing → confirmed; also postponed,
  rejected; failed import. Granite document statuses use the same shape.
- Hover a status badge → tooltip listing the issues (Dext).

## Not known from the references (ask the owner before building)
- Empty and loading states of the screen.
- Exact placement of Postpone and Delete.

## Never copy
Logos, product names, icons, illustrations, wording or colors from Rossum or Dext.

Deviations allowed: none
