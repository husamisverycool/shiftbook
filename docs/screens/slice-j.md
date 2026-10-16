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
