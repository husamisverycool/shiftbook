# 0040 — Connections, Paychex Flex and Paylocity files, a factor's schedule of accounts, Avionté-style placement imports

Status: accepted (owner, 2026-10-17: SPEC §27 item 4)
Date: 2026-10-17

## Context
SPEC §27 item 4 asks for an integrations page; ATS imports by file from Bullhorn, Spott, JobAdder and
Avionté; Paychex Flex and Paylocity through a mapped CSV profile configured from a sample file; and a
factor "schedule of accounts" export with the timesheet backup bundle. Research:
`docs/research/connections-exports-slice-s.md` (Zapier, Stripe apps, Avionté BOLD bulk import, ATS
columns, Paylocity, schedule forms) and `docs/research/payroll-formats-slice-f.md` §5.1 (Paychex SPI).

## Decision
1. **Settings › Connections** (`docs/patterns/settings/connections.md`): Zapier's App Connections
   (Connected | Available, status, last used, a row menu: Test, Open, Download template, Forget saved
   mapping) and Stripe's catalogue for Available. Read from what Granite already holds — the payroll
   system and its codes, saved placement mappings and imports, time-file profiles and the files read
   with them, clients' invoice uploads. No new table. No Rename: each connection is named after its
   system. Partner handoffs are a typed registry (`PARTNER_HANDOFFS`) that slice w fills. Beeline,
   Coupa and Magnit are listed as "Not available yet": Granite has no profile for their exports, and a
   page that claimed otherwise would be a dead end.
2. **Paychex Flex and Paylocity** are payroll formats like the others (`paychex_flex_csv`,
   `paylocity_time_csv`; worker ids `paychex`, `paylocity`), written by the spreadsheet engine with a
   fixed layout (`renderLayout`), so they share its row grouping, read-back and reconciliation. Both
   receivers take hours with a rate *or* an amount, never both (Paychex: "Amount must be empty if
   Hours is nonzero"): hours rows write the line's own rate and no amount, dollars rows the amount
   only (`amountOn: "dollars_rows"`); the notes state what the receiver pays when hours are rounded up
   to the hundredth. Every kind of pay needs the company's own code (blank is refused, naming the
   worker). "Configured from a sample file": Payroll settings reads a sample of the system's own import
   file in the browser (`readPayrollSample`), checks its columns against the layout Granite writes,
   fills Paychex's client id and lists the codes found. Nothing is sent or kept.
   - **Confidence.** Paychex SPI columns: high (Deltek's Paychex export spec; Paychex's own pages
     returned 404). The 16 vs 17 column count is unverified; Granite writes 16 and accepts samples
     with more. Rate semantics ("overrides the loaded rate") are documented; whether a pay component
     multiplies a given rate is not. So, as for ADP Workforce Now, overtime and double time carry a
     **declared multiple** (export review finding 2): the agency enters the multiple its component
     applies (1.5 when it multiplies, 1 when it pays the rate as given) and the file writes the rate ÷
     that multiple, refused when not exact at four decimals (a blended week: carry it as dollars).
     Paylocity: **low** — the layout comes from two third-party vendor guides
     that agree (ClickTime, Buddy Punch); Paylocity's own layout is not public. Paylocity's import
     Status Report shows anything refused before it is posted.
   - **Read back** (export review finding 3): each row's rate, hours, amount and fixed cells are read
     from the written file, dollars rows must have no hours or rate, and what the system pays is
     computed from the file as read. Line Date is written on every row: every row is an earnings pay
     component, the only kind Deltek's spec allows it on.
3. **Schedule of accounts**: from the invoices list's selection (Owner and Billing, the cash ability),
   one .zip — the schedule as CSV (debtor and address, invoice number, invoice and due dates, terms,
   PO, week ending, amount, backup file; a total row; read back to the cent), the schedule as a PDF to
   sign (`_documents/schedule-of-accounts.md`), and each invoice's PDF as issued with its timesheet
   backup. Open invoices only: credit notes, paid, void and draft invoices are refused, as a factor
   buys amounts owed. Made on request, never stored; each invoice's activity names the schedule
   (`SOA-<date>-<fingerprint of its invoices>`, the same choice names itself).
4. **Placement imports, Avionté's way** (`assignments/import.md`): an Avionté source with its
   Comprehensive Placement report's columns; a template per source; the preview lists only the rows
   with errors, each fixable in place (one cell, in a mapped column) or left out, and taken back.
   Fixes and removals live on the import (`drizzle/0053`: `row_edits`, `removed_rows`); the stored copy
   of the file never changes; a fix holding an SSN is refused. The history downloads the rows kept and
   each row's result (Avionté's View Imports).

## Alternatives considered
- A free-form "mapped CSV profile" editor for Paychex and Paylocity: their layouts are fixed and
  documented; a fixed layout plus a sample check is safer than a mapping the agency could get wrong.
- Storing schedules: the invoices and the activity log already record what was assigned and when.
- A connections table with names and credentials: Granite exchanges files, not API sessions; there
  is nothing to rename or reconnect yet.

## Consequences
- Proposed goldens: `tests/goldens/_proposed/exports/paychex-flex-spi-basic`,
  `paylocity-time-import-basic` (hand arithmetic in each case).
- Not done here: a forwarding email address for intake (SPEC §6) does not exist yet, so Connections
  does not list one; VMS time-file profiles for Beeline, Coupa and Magnit need sample exports.
