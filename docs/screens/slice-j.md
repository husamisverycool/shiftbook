# Slice (j) screens compared with their pattern files

Captured 2026-10-16 in demo mode (English, 1440×900; Spanish copies start with `es-`). ✓ = matches
the pattern file.

The data behind them, on 2026-10-16: the agency's Illinois registration expires 2026-12-31 (renew
60 days before: 2026-11-01, reminded from 2026-10-02 — due soon); its Massachusetts registration
expires 2026-11-20 (renew 30 days before: 2026-10-21 — due soon); every placement started 2026-08-03,
so the Massachusetts job orders were due by 2026-08-09, all sent but Kwame Boateng's (overdue);
Kateryna Bondarenko's work authorization ends 2026-12-20 (reverify; reminded 90 days before — due
soon); the workers' comp policy ends 2026-12-31 and its audit is 2027-02-15 (upcoming); Prairie Line's
proof page was given before the contract and on 2026-09-01 (done), and 2027-03-01 is upcoming.

## Step 1 — the list, a duty, the calendar, the settings

### Compliance — `docs/patterns/compliance.md` (Vanta Tests page; Linear display options)
Screens: `slice-j/j01-compliance-list.png`, `j02-compliance-filtered.png`, `j03-compliance-no-match.png`,
`j04-compliance-done.png`, `j20-shortcuts.png`, `es-j01`.
- ✓ H1 "Compliance", Compliance settings at the right; tabs List · Calendar keeping the filters.
- ✓ Areas at the left with their open counts (All, Registrations, Clients, Placements, Workers, Equal
  pay, Workers' comp); search by name (`/` puts the cursor there); Status, State and Owner filters
  (`j02`: Massachusetts).
- ✓ Grouped by status, most urgent first: Overdue, Due soon, Upcoming (Done and Not applicable when
  the filter asks, `j04`); a row: the duty and its subject, the state, the due date with "in 5 days"
  or "68 days late", the owner picker, the status in words.
- ✓ No match: says so, with Clear filters (`j03`). Nothing open: says so with the next due date
  (integration test).
- ✓ G then O opens it; the sidebar's badge counts what is overdue or due soon (`j20`).
- Steps 2 and 3 add the Counters, Workers' comp and ACA tabs and the ACA area.

### A duty — `docs/patterns/compliance/[id].md` (Drata control detail; Vanta test detail and documents)
Screens: `j05-obligation-overview.png`, `j06-obligation-evidence.png`, `j07-obligation-notes.png`,
`j08-mark-done.png`, `j09-obligation-history.png`, `j10-i9-dates.png`, `j11-reverify.png`,
`j12-not-applicable.png`, `es-j05`–`es-j09`.
- ✓ Back to Compliance; H1 the duty, its subject, status and state badges; Mark done and Not
  applicable while open (`j08`, `j12`: a reason is required); Reopen for the Owner once closed by a
  person (`j10`: what the data closed has no Reopen — it would not last).
- ✓ Tabs Overview · Evidence · History · Notes in the address.
- ✓ Overview: Due, Owner, Evidence and Status cards; what the law asks, its citation and the official
  source; who it is for and how it was worked out; the I-9 dates form (`j10`) or the reverification
  form (`j11`); a link to Compliance settings for registrations and policies.
- ✓ Evidence: add a file with its effective date; download; unlink (the file moves to Past files).
- ✓ History and Notes, newest first.

### Calendar — `docs/patterns/compliance/calendar.md` (Google Calendar; Outlook on the web)
Screens: `j13-calendar-month.png`, `j14-calendar-week.png`, `j15-calendar-agenda.png`,
`j16-calendar-nothing.png`, `es-j13`.
- ✓ Today, previous, next, the range, a date to go to, Month · Week · Agenda; the filters apply.
- ✓ Month grid from the agency's workweek start; chips with the status in words for screen readers;
  "+N more" opens the day. Week: seven full days. Agenda: four weeks by day.
- ✓ Keys M, W, A (and 3, 2, 5), T, J or N, Shift+←, G (the browser test uses them).
- ✓ Nothing in range: says so and when the next duty is (`j16`).

### Compliance settings — `docs/patterns/settings/compliance.md` (Vanta document renewal and documents)
Screens: `j17-compliance-settings.png`, `j18-add-registration.png`, `j19-registration-renewed.png`,
`es-j17`, `es-j18`.
- ✓ Registrations (state, for, number, issued, expires, certificate, the renewal duty's status and
  date); Add registration; the one before stays, marked Replaced (`j19`).
- ✓ Workers' comp policy with its renewal and audit duties; Add policy.
- ✓ Massachusetts job orders: the Department's multilingual statement, uploaded once.
- ✓ Last changed and by whom; read only for everyone but the Owner.

### Differences found and what was done
- The overdue badge and calendar chip were red text on a red tint, which failed the contrast check;
  they are now red text and border on the page's background.
- At 1440 px the policy table's last column was cut off; the duty cells now stack the status over the
  date and the insurer wraps.
- Evidence rows squeezed the file name; the details now sit on a second line.
- Shiftbook's own closing notes showed in English on Spanish screens; they are now worded in the
  reader's language (the English note stays in the record).

## Step 2 — the documents

### Making a duty's document — `docs/patterns/compliance/[id].md` (Drata: create evidence)
Screens: `slice-j/j21-make-proof-page.png`, `j22-proof-page-made.png`, `j24-job-order-made.png`.
- ✓ The Evidence tab of a proof-page, job-order or audit duty has the button that makes its document;
  the file is kept as generated evidence with its date (`j22`, `j24`).
- ✓ The Massachusetts job order needs its details and the Department's contact first; the button says
  so and links to the settings; without the Department's statement on file the job order says it must
  be given.

### Job order details — `docs/patterns/compliance/[id].md` (Overview: the duty's form)
Screen: `j23-job-order-details.png`.
- ✓ Daily start and anticipated end, overtime, clothing/equipment/training and cost, meals,
  transportation, strike or lockout; kept on the job order for every placement.

### Workers' comp packet — `docs/patterns/compliance/workers-comp.md` (Patriot Workers' Comp Wages; NCRB Rule 2-C-2-a)
Screens: `j26-workers-comp-none.png`, `j27-workers-comp-packet.png`, `j28-workers-comp-class-first.png`.
- ✓ From and To (the policy's period by default), State first · Class first, Export (PDF, CSV).
- ✓ Missing classes listed first and out of the totals (unit and integration tests; none in the demo).
- ✓ Grouped by state then class (or class first): worker, hours, straight time, OT premium, DT
  premium, other pay, total; a subtotal per class with its description; a total.
- ✓ The tie-out line: the payroll files with these pay dates and their gross; they agree.
- ✓ Nothing paid in the range says so (`j26`).

### Compliance settings — the Department's contact — `docs/patterns/settings/compliance.md`
Screen: `j25-settings-contact.png`.
- ✓ The contact details printed on each Massachusetts job order, above the statement upload.

### The documents
- `doc-il-proof-1.png` — `docs/patterns/_documents/il-registration-proof.md`: ✓ the agency and the
  title, the law, the date; For (the client); the registration table; the workers' comp insurer,
  policy and period; how the client checks (the Department's list and the dates the law names); page
  numbers.
- `doc-ma-job-order-1.png` — `_documents/ma-job-order.md`: ✓ the worker, start, date made; the four
  contacts; the job; pay (rate, pay day, overtime and its rate); hours; meals, transportation, strike;
  the statement line; page numbers.
- `doc-wc-packet-1.png` — `_documents/wc-audit-packet.md`: ✓ title, insurer and policy, pay dates,
  date made; summary by state and class with descriptions; by worker; missing classes apart; the
  tie-out; no Social Security numbers.

### Differences found and what was done
- The proof page's last paragraph had loose line spacing; it now uses the page's normal spacing.
- The packet's summary squeezed the class description under the code; it now has its own column.
- "1 files" read wrong; the tie-out now names the files' count in parentheses.

## Second opinion, fixed (decision 0022)
Screens: `j21-make-proof-page.png` (again), `j22-proof-page-made.png` (again), `j23-job-order-details.png`
(again), `j25-settings-contact.png` (again), `j29-i9-no-files.png`, `j17-compliance-settings.png` (again),
`doc-il-proof-1.png` and `doc-ma-job-order-1.png` (again).
- ✓ A duty past its look-back stays open; the data reopens or closes again only what Shiftbook
  closed, and a duty the data closed has no Reopen (refused if asked).
- ✓ The next proof page (March 1, 2027) says why it cannot be made yet — no Illinois registration in
  force that day — with a link to Compliance settings (`j21`); the contract's proof page, made today,
  shows the registration and policy in force today (`j22`, `doc-il-proof-1`); a page made early with
  no policy then says "No policy on file for …".
- ✓ The job order's details start with the worksite employer's phone (`j23`); the job order gives a
  name, address and phone for every contact, the overtime rate from Massachusetts' overtime rule and
  the pay day as the settings stood (`doc-ma-job-order-1`); without the agency's phone it cannot be
  made.
- ✓ Compliance settings: the insurer's address and phone under its name, and the business days for
  Form I-9 — Monday to Friday fixed, Saturday and Sunday for the Owner (`j25`, `j17`; Jira's standard
  working days).
- ✓ An I-9 duty's Evidence tab says copies are not kept and has no upload (`j29`).
- ✓ The packet's tie-out counts what corrections settled outside the files (integration test; the demo
  has no correction).

### Differences found and what was done
- The I-9 Evidence tab said "No files yet. Add the file…" under the note that no files are kept; the
  empty-files line is gone there.
- The employer's phone label read "Harborview Events & Hospitality (demo)'s phone"; it is now
  "Worksite employer's phone (Harborview Events & Hospitality (demo))".
