# Slice (l) screens compared with their pattern files

Captured 2026-10-17 in demo mode (1440×900; some full page), after the demo week was run through the
product as a stranger would: the sample folder in one click, its six unreadable files archived
together, Prairie Line approved by its link, the files created, the sample bank file imported. ✓ =
matches the pattern file. A first pass the evening before compared every screen with its pattern
file and listed the differences; the ones fixed since are named under "Fixed since the first pass".
The reference products' own screenshots were captured for the comparison and kept out of the
repository (they are theirs).

## Sign in and the first run

### Sign in — `sign-in.md` in `_layouts/auth.md` (Linear, Vercel, Notion, GitHub login pages; decisions 0031–0034)
Screens: `slice-l/l00-sign-in.png`, `l50-sign-in-full.png`, `l54-sign-in-es.png`, `l51-google-demo.png`,
`l52-sso.png`, `l53-email-code.png`.
- ✓ The demo banner, then the light page with no header bar; one narrow column with the Tabulado mark
  above "Sign in to Tabulado" (bare, in the text colour, as Linear and Notion show theirs).
- ✓ The demo people first, the Owner filled; "or"; email and password; "Email me a sign-in code";
  "or continue with" and four tiles — Google and Microsoft with their own marks, Passkey, SSO.
- ✓ The demo's stand-in for Google and Microsoft (`l51`): Tabulado's frame, "Choose an account".
- ✓ Company SSO (`l52`) and the emailed code (`l53`) pages: heading, one line, one field, one button.
- ✓ The language at the foot; Spanish (`l54`).
- Fixed since the first pass: the line under the heading no longer wraps narrower than the column.

### Home, fresh and after the week — `home.md` (Stripe Home; Shopify Polaris setup guide)
Screens: `l01-home-fresh.png`, `l04-upload-demo.png`, `l13-home.png`, `l40-home-es.png`.
- ✓ The setup guide first (2 of 7 done on a fresh demo; 6 of 7 after the week), its open step with
  the one action; Today's figures and the hours chart; Open receivables, Overdue and Compliance on
  the right; Needs attention; Your overview with three chart cards.
- Fixed since the first pass: the page no longer runs below the frame; the Spanish page no longer
  scrolls sideways; "1 vencida"; "número de Seguro Social"; chart money written the same way in both
  languages ("$50K"); Today's zero reads "0h".
- Since, from Stripe's own Home: the figures in Stripe's lighter weight with the previous pay period
  beside them in grey; Today's hours as a running line over the week; the overview cards' axes with
  more gridlines, the previous period dashed, "Updated" and "View more" at the foot; the setup guide's
  open step on Polaris's grey panel.

### Empty lists — `invoices.md`, `margin.md` with `_components/empty-state.md` (Linear and Stripe)
Screens: `l02-invoices-empty.png`, `l03-margin-empty.png`.
- ✓ An icon, one bold line, one muted line, the one action, centred in the page.
- Fixed since the first pass: Invoices keeps its tabs and client filter when empty (empty-state.md
  item 1); "Margin settings" and "Compliance settings" are outlined buttons like Export.

### Upload timesheets — `convert.md` with `inbox.md` (Gusto, Dext)
Screens: `l04-upload-demo.png`, `l05-upload-done.png`.
- ✓ The trail, title and Review hours; the drop zone with "Use the sample timesheets" in the demo;
  the table of files with kind, status, client, entries and rows to check.
- ✓ The six files the demo cannot read yet say so plainly, with one "Archive the 6 that could not
  be read" (one reason for all), as Dext's inbox does.
- Fixed since the first pass: the statuses are badges; the converter's column matches the other
  pages'; the reasons a file could not be read are in the reader's language.

### Bank import — `bank/import.md` (QuickBooks Online upload; Zoho Books)
Screens: `l11-bank-import-map.png`.
- ✓ Numbered steps; the sample bank file in one click; the columns matched with a preview.
- Fixed since the first pass: the column lines up with the other pages.

## The week, run through

### The client's approval page — `approve/[token].md` in `_layouts/portal.md` (Bullhorn Time & Expense)
Screens: `l06-client-portal.png`.
- ✓ The agency's week for the client: workers by day, totals, approve or dispute each shift, the
  name and the checkbox, Approve.
- Fixed since the first pass: waiting rows carry no badge (only approved and disputed are marked,
  as Bullhorn's table).

### Review hours, Exceptions, Review totals, Files — `convert.md`, `review.md`, `exports.md`
Screens: `l07-review-hours.png`, `l08-exceptions.png`, `l09-totals.png`, `l10-files.png`.
- ✓ The trail of steps; Review hours opens on the rows that need a person ("Needs review (0)" here:
  the time clock and Fieldglass files read cleanly; the acceptance test proves the flagged case with a
  test photo); Exceptions with no blockers and one warning; totals; the payroll file with its
  control totals and fingerprint, then the invoices.
- Fixed since the first pass: status badges; no box around the grid; Edit only on Review totals;
  Review totals has underline tabs; hours written "670:00" in the warning, both languages.
- Still not built: review.md's hours summary bar and view bar (regular and overtime are worked out
  only at Check exceptions; the pattern says to ask the owner before the view bar).

### Bank, for review — `bank.md` (QuickBooks Online For review)
Screens: `l12-bank-review.png`.
- ✓ For review · Posted · Excluded; each deposit with its suggested match, confidence and reason;
  Post, Find match, Exclude.
- Fixed since the first pass: "$25.00 short" is an amber badge.

## Filled screens

### Client approvals and one approval — `approvals.md`, `approvals/[id].md` (Harvest; Stripe)
Screens: `l14-approvals.png`, `l15-approval.png`.
- ✓ Status chips with counts, the client filter, rows grouped by state; the approval's workers by
  day with totals and its history.
- Fixed since the first pass: times are the agency's own (Chicago), as in the activity log, on every
  screen; "approved 51 shifts" without "and disputed 0"; "Link opened" once; per-worker badges in
  the status colours; the header row no longer tints under the pointer.

### Invoices and an invoice — `invoices.md`, `invoices/[id].md` (Stripe)
Screens: `l16-invoices.png`, `l17-invoice.png`, `l41-invoice-es.png`.
- ✓ Amount first and bold, status badge, number, client, period, short dates; the invoice page with
  its line items and the Summary column.
- Since, from Stripe's current lists: status tiles with counts above the table, filter pills ("+
  Client") that open a choice, column headers in plain case, 36px rows, amounts with their currency
  and a results count under the table; the same on Client approvals, Payments, Clients and Workers.
- Fixed since the first pass: the client filter beside the tabs; Worksite in the Summary; a paid
  invoice says "Amount paid" and "Balance due"; the client is a link; each line's detail in the
  reader's language (the PDF stays in the client's language).

### Clients, Receivables, Payments — `clients*.md`, `receivables.md`, `payments.md` (Stripe; Mercury)
Screens: `l18-clients.png`, `l19-client.png`, `l20-receivables.png`, `l21-payments.png`, `l42-client-es.png`.
- ✓ Stripe's tables without a box; the client's record page with its facts line, invoice settings
  and what it owes.
- Fixed since the first pass: the facts line under a client's name; empty amounts "—" alike in rows
  and totals; overdue and unapplied credit as rows under the headline figure (Mercury); payment
  references take the room left and show in full on hover.

### Margin — `margin.md` (Stripe Billing analytics; Mercury Insights)
Screens: `l22-margin.png`.
- ✓ Period, the figures, the weekly chart with losses below zero, the table by client with totals.

### Job orders, a job order, Assignments — `job-orders*.md`, `assignments.md` (Linear lists; Attio)
Screens: `l23-job-orders.png`, `l24-job-order.png`, `l25-assignments.png`.
- ✓ Linear's grouped list; the job order's record page with Details at the right.
- Fixed since the first pass: rates as labelled chips ("Pay $17.00", "Bill $25.00"); the client not
  repeated under its group; an equal pay range shows one figure.
- Since, from Linear's list: a status icon at each row's left; property chips with small icons
  (place, filled of wanted, pay, bill); Filter and Display at the top right; group rows with counts.

### Workers and a worker — `workers*.md` (Toast Team; Stripe detail page)
Screens: `l26-workers.png`, `l27-worker.png`.
- ✓ The roster table; the worker's page with its facts line (payroll number, hired) and the
  assignment as a link to its job order.

### Compliance, a duty, Counters — `compliance*.md` (Vanta; Drata; 820 ILCS 175/42)
Screens: `l28-compliance.png`, `l29-duty.png`, `l30-counters.png`.
- ✓ Duties most urgent first; the duty page with its status and state badges, evidence and history;
  the counters with the citation in their line.
- Fixed since the first pass: the state badge is back; "How it was worked out" gives the facts only
  (no doubled citation); long answers wrap.

### Settings — `_components/settings.md` (Linear's own settings screenshots; decision 0029 rule 11)
Screens: `l31-settings-payroll.png`, `l32-members.png`, `l33-account.png`.
- ✓ One centred column; each section a heading with one muted line, its rows in a rounded bordered
  panel — label over a muted line on the left, the control on the right — measured from Linear's
  Preferences, Members and Security screenshots (rows 60px, 16px panel padding, hairlines stopping
  at it).
- ✓ Your account: Language as a row; Password a form panel with its button in the foot;
  Authenticator; Passkeys and Connected accounts as lists with the action at the right.
- ✓ Members: search and Filter on one line with Invite; each person a row with initials, name over
  email, role, status and last seen, then the menu; the roles in a panel below.
- Still different from Linear: its title is 24px medium (ours stays the app's 28px bold); Members
  shows photos and one line per person; the SSO switch sits in its own row, not beside the heading.

### Activity — `settings/activity.md` (Stripe Workbench events; GitHub audit log)
Screens: `l34-activity.png`.
- ✓ Filters, the count, the list with the selected event's details: when to the second, who, the
  record, Changes before and after, Event data folded. Field names and raw values are shown as
  Stripe Workbench shows them.

## Not captured in this set
The ACA, calendar and workers' comp tabs, margin's other tabs and the compliance and margin
settings pages are covered by the browser tests in both languages; the passkey and connected
account sections are shown empty here (the demo's shared sessions add none).
