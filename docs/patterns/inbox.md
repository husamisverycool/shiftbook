# Pattern: Timesheet inbox (`/inbox`)

Status: PROPOSED — needs owner decision (see "Open question")
Reference product and screen: Expensify — SmartScan receipt list on the Spend page (primary, documented);
Ramp — receipt matching (secondary; Ramp publishes no inbox screen, only its behaviors)
Source URL: https://help.expensify.com/articles/new-expensify/reports-and-expenses/Getting-Started-with-the-Spend-Page
Source URL: https://help.expensify.com/articles/new-expensify/expenses/Create-an-expense
Source URL: https://help.expensify.com/articles/new-expensify/reports-and-expenses/Troubleshoot-SmartScan-Issues
Source URL: https://support.ramp.com/submitting-receipts-memos-and-accounting-for-your-ramp-transactions
Source URL: https://support.ramp.com/receipt-verification
Source URL: https://support.ramp.com/troubleshooting-transaction-receipt-matching
Candidate substitute (not in the owner's mapping): https://help.dext.com/en/articles/105789-the-costs-inbox
Candidate substitute (not in the owner's mapping): https://help.dext.com/en/articles/105716-managing-table-columns-and-density-in-inbox-archive-and-approvals
Researched: 2026-10-15. Confidence: Expensify states high, Expensify list layout low, Ramp low.

## Open question
Ramp does not publicly document a receipts inbox screen, and Expensify does not document its list
columns. Dext documents a complete inbox (tabs, default columns, column settings, bulk actions).
Proposal: use Dext's Costs inbox for the list structure, Expensify for upload and reading states,
Ramp for upload channels and matching rules. **Not built until the owner approves.**

## Purpose in Shiftbook
Every incoming timesheet (photo, scan, PDF, time-clock CSV/XLSX, VMS export, email) lands here,
gets read, and is matched to assignments. Coordinators see what is still being read, what needs
review, and what is done.

## Hierarchy
1. **Page header:** search box (Expensify), Filters button (Expensify), Export menu (Expensify).
2. **Upload target:** drag-and-drop files anywhere onto the page, or choose files; several files at
   once, then one button to start reading them (Expensify bulk upload). Other channels shown as
   information: forwarding email address (Ramp/Expensify email channel).
3. **Tabs (Dext, if approved):** Inbox · Processing · Archive.
4. **Table** (column headers; Expensify): one row per source document. Columns (Dext default-column
   structure, if approved): Status · Received via · Received · Client · Kind · Entries · Needs review.
   Column settings control to add/remove columns and set density (Dext, if approved).
5. **Row selection:** checkbox per row, select all, Shift+click range (Expensify).
6. **Footer:** totals for the current view (Expensify "total" footer). Shiftbook: documents, entries,
   minutes read.

## Interactions
- Drop files → each appears immediately as a row in a reading state; reading continues in the
  background (Expensify).
- Reading state shows in the row's value cell (Expensify shows it in the amount cell); when done the
  row shows its result.
- A document that cannot be read shows a red-dot indicator and a message, and can be retried by
  replacing the file (Expensify).
- Matching (Ramp): each extracted entry is matched to an active assignment; dates match within the
  assignment's date range (Ramp uses ±1 day for receipts; Shiftbook uses the SPEC validators instead).
- Click a row → opens the single document review (`/documents/[documentId]`).
- Bulk actions on selected rows via an Actions menu (Dext, if approved): export, archive, delete.

## States
- Reading (Expensify "scanning"), Read, Needs review, Failed to read, Matched / Unmatched (Ramp).
- Shiftbook status names come from SPEC §4.

## Not known from the references (ask the owner before building)
- Empty state (use the Linear empty-state pattern, `_components/empty-state.md`).
- Whether rows show a thumbnail of the document.

## Never copy
Logos, product names, icons, illustrations, wording or colors from Expensify, Ramp or Dext.

Deviations allowed: none
