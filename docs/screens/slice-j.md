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

## Step 3a — hours counters with opening balances

### Counters — `docs/patterns/compliance/counters.md` (TempWorks ACA Employee Cycles; 820 ILCS 175/42)
Screens: `j30-counters.png`, `j31-counter-balances.png`, `j32-add-balance.png`, `j33-counters-no-match.png`,
`es-j30-counters.png`.
- ✓ The Counters tab; a line with the rule's thresholds (720 hours in 12 months, 4,160 in 48, near
  past 600) and that balances count in the run too.
- ✓ Search by worker; Client; Show (all, near, crossed) in the address; no match says so with Clear
  filters (`j33`).
- ✓ One row per worker and Illinois client, most hours first: hours in the 12 and 48 months with each
  window's first day, the hours before Shiftbook, and the state — crossed on a date (a link to its
  duty), near with hours to go (Fatima Haddad, from the demo's 590 hours before Shiftbook), or hours to
  go (`j30`).
- ✓ A row opens its balances: hours up to a date, the note, who added them; Remove asks for a reason
  and keeps it listed, struck through (`j31`; browser test).
- ✓ Add balance from a row (worker and client set) or from the page (chosen); hours as 620 or 620:30,
  the date not after today, a note (`j32`). Read only for everyone but the Owner.
- ✓ The run counts the balances: a balance and a week of work record the crossing at the right minute
  (integration test).

### Differences found and what was done
- The intro and limits read "720:00 hours"; thresholds are now whole hours ("720 h", "4,160 h").

## Step 3b — the Illinois equal-pay rate

### The run waits for the rate — `docs/patterns/convert.md` (Exceptions: the fix that applies)
Screen: `j34-equal-pay-blocker.png`.
- ✓ From the first pay period that begins after a crossing, covered hours at that client with no
  rate in force and no request on file stop the run: "Equal-pay rate due for hours after 720 at one
  client", with Open the equal-pay duties.

### The rate on the crossing's duty — `docs/patterns/compliance/[id].md` (Overview: the duty's form)
Screens: `j35-equal-pay-form.png`, `j36-equal-pay-true-up.png`, `j37-equal-pay-remove.png`,
`j38-equal-pay-removed.png`, `es-j35-equal-pay-form.png`.
- ✓ From a date (the crossing day for the first rate, today once one is on file); how the client
  compared (a comparable direct hire, the closest seniority, the wage survey's median or 75th
  percentile); the hourly rate; the benefits' hourly cash value; who it was compared with; a note —
  Save rate marks the duty done.
- ✓ Or "The client was asked" on a date, never in the future: the rate card is paid and a correction
  trues it up.
- ✓ Paid weeks to true up (`j36`): the client's figures came after the week of 2026-10-05 was paid at
  the rate card, so the week is listed, linking to its files where a correction starts.
- ✓ The rows on file, newest first, each with who and when, and Remove: a reason is required
  (`j37`); the row stays listed, struck through, with who removed it and why, and with no rate left
  the duty is open again — here overdue (`j38`).

### The run pays it
- ✓ Marcus Bell's week of 46 hours at $20.00: 40 h × $20.00 + 6 h × $30.00 = $980.00 (at the card's
  $18.25 it was $894.25); with Anita Patel's $438.00, gross $1,418.00 (browser test). Each pay line
  says why its rate is above the card's; billing stays on the rate card.
- ✓ A proposed answer key, `tests/goldens/_proposed/rules/il-s42-equal-pay-rate-paid.json`, checked
  against hand arithmetic, waits for the owner's approval.

### Second opinion, fixed (decision 0023)
1. A request recorded after a rate cancelled the rate: the rate in force is now the latest rate row
   on or before the day; a request never undoes one.
2. A request made today never cleared the hold: any recorded request clears it.
3. Work the Act does not cover (Indiana, clerical) at the same client was raised and held: only
   covered, otherwise valid shifts are.
4. The hold was by workweek, not by pay period: it now starts with the first pay period that begins
   after the crossing.
5. The 4,160-hour step to the survey's 75th percentile was not enforced: a median dated before it
   holds the run until a newer rate or a request.
6. A crossing a person set aside as not applicable still held the run: it no longer does.
7. Only regular and overtime lines said why: the minimum-wage top-up, holiday, reporting-pay and
   holiday-not-worked lines do too.
8. Bill lines split by pay-rate group when two pay rates meet in a week (a cent of rounding per
   group): accepted and asserted in the engine test.
9. A missing figure slipped past the database check, and one bad row emptied the whole run: the check
   requires every figure, and a bad row holds only its worker.
10. A wrong row could not be taken back: Remove with a reason, kept on file; the form's date defaults
    sensibly; a note says when a new rate replaces one.
11. The raise ran before the shift was checked, and rate plus benefits had no cap: both fixed.
12. Weeks paid before the figures arrived were not shown: they are listed on the duty.
13. Smaller items: field lengths match the database; the benefits field is checked.

### Differences found and what was done
- Removing a row left the earlier "Saved" message on screen; removal now says "Removed. It stays
  listed with your reason."
- The struck-through row also struck through who removed it and why; only the row itself is struck
  through now.
- On Spanish screens, the "How it was worked out" text and the note after each citation are in
  English (stored when the duty is made). This is true of every duty since step 1; it is listed for
  the Spanish/English slice (k).
