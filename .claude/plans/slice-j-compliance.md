# Slice (j) — Compliance calendar and counters

Status: GO under the owner's "just keep going … I don't need to approve anything for you"
(2026-10-16). Choices the research left open are listed under "Decisions made for the owner"; the
owner can reverse any of them.
Contract: SPEC.md §2 (roles), §4 (Obligation: type, jurisdiction, due date, subject, evidence;
HoursCounter), §5 (rules as dated data, integer minutes), §16 (compliance calendar), §21 (no SSNs or
identity documents in files), §24 item 9 (compliance pages reflect the run). Research with sources:
`docs/research/compliance-slice-j.md`.

## Goal (what the owner can do at the end)
See every compliance duty the agency has — state registrations and their renewals, the Illinois proof
of registration for each client before March 1 and September 1, the Illinois equal-pay crossings,
New Jersey certification and primary-language notices, the Massachusetts job-order notice for each
new placement, workers' comp policy renewal and audit, each worker's Form I-9 deadlines, and the ACA
measurement results — in one list (most urgent first) and on a calendar, each with what the law asks,
its citation, its due date, who owns it, its evidence files and its history. Print the Illinois proof
page and the Massachusetts job order, hand the workers' comp auditor a packet that ties to the
payroll files, see each worker's Illinois hours counters (with hours worked before Shiftbook), enter
the Illinois equal-pay rate so the run pays it, and see who is full-time under the ACA look-back.

## Done means (evidence I will paste)
1. `pnpm test` (unit + integration + goldens), `pnpm typecheck`, `pnpm lint` — real output, green.
2. Playwright, English and Spanish: the Owner opens Compliance (G then O), sees the demo's due-soon
   and overdue items first, filters by state, opens the Illinois renewal, attaches a file, marks it
   done with a note; opens a client's Illinois proof obligation and downloads the proof page; opens a
   Massachusetts job order and downloads it; marks an item not applicable with a reason; switches to
   the calendar (month, week, agenda; t, j/k, m, w, a); records a worker's I-9 dates; opens the
   counters, adds an opening balance and sees the crossing; enters an equal-pay rate and sees the run
   pay it; opens the workers' comp packet and the ACA report. Accessibility checks on every screen.
3. Screenshots of every new screen, state and document, compared with the pattern files.
4. Second-opinion reviews: the generators' dates, the equal-pay rate in the engine (a wage-rule
   change) and the workers' comp packet (an export) — fixed.
5. Golden cases with hand arithmetic for every generator date rule, the equal-pay pay lines, the
   ACA full-time test and the workers' comp premium split.

## Steps (tests first; each step usable end to end)
1. **Obligations everywhere.** Data (generalized obligations, compliance rule rows with citations,
   registrations, workers' comp policies, I-9 dates, evidence documents, notes, owners); pure
   generators; regeneration after each change and each run; `/compliance` list, `/compliance/[id]`
   detail with evidence, history and notes, `/compliance/calendar`, `/settings/compliance`; demo data.
2. **Documents.** Illinois proof of registration (PDF), Massachusetts job order (PDF), workers' comp
   audit packet (`/compliance/workers-comp`, PDF and CSV), each attached to its obligation as
   generated evidence.
3. **Counters and equal pay; ACA.** `/compliance/counters` with opening balances that the run
   counts; the Illinois equal-pay rate entered on the crossing's obligation and paid by the engine;
   `/compliance/aca` with its settings and a monthly hours import.

## Screens and documents, with references
| Screen | Pattern file | Reference |
|---|---|---|
| Compliance list (`/compliance`) | `compliance.md` (new) | Vanta Tests page (subject areas at the side; most urgent first; search by name; filter by status and framework; owner per item; deadlines per category); Linear display options (group by status) |
| Obligation (`/compliance/[id]`) | `compliance/[id].md` (new) | Drata control detail (Overview with owners; Evidence: link, unlink, create, download); Vanta test detail tabs (Evidence, History, Notes); Vanta document renewal (Due soon → Overdue; the effective date of the file) |
| Calendar (`/compliance/calendar`) | `compliance/calendar.md` (new) | Google Calendar (views day/week/month/agenda by 1–5 or d/w/m/a; t today; j/n next range; g go to a date; / search) |
| Hours counters (`/compliance/counters`) | `compliance/counters.md` (new) | TempWorks ACA Employee Cycles (one row per employee and window, hours, weeks, dates; filters; group by customer) |
| ACA look-back (`/compliance/aca`) | `compliance/aca.md` (new) | TempWorks ACA Employee Cycles (parameters: dates, branch, status, customer, average hours, Show, Group By; columns Employee, Hire Date, Cycle Status, Current Status, Measurement Hrs/Weeks/Avg/Start/End, Admin Start/End, Stability Start/End, Break In Service Start/End) |
| Workers' comp packet (`/compliance/workers-comp`) | `compliance/workers-comp.md` (new) | Patriot Software Workers' Comp Wages report (date range; sorted state → code → employee, or code first; gross and overtime wages in separate columns; missing codes listed first and left out of totals; PDF and CSV) |
| Compliance settings (`/settings/compliance`) | `settings/compliance.md` (new) | Vanta document renewal settings (recurrence from the file's effective date; remind N days before; Due soon / Overdue) |
| Illinois proof page (PDF) | `_documents/il-registration-proof.md` (new) | Layout of `_documents/statement.md`; contents from 820 ILCS 175/85 and 56 Ill. Adm. Code 260.510 |
| Massachusetts job order (PDF) | `_documents/ma-job-order.md` (new) | Contents from M.G.L. c. 149 § 159C(b) and 454 CMR 24.08 |
| Workers' comp packet (PDF) | `_documents/wc-audit-packet.md` (new) | Patriot report columns; NCRB Basic Manual Rule 2-C-2-a (overtime premium shown apart by employee and in summary by class) |
| Sidebar | `_layouts/app.md` (updated) | Linear sidebar (count badge) |

## Decisions made for the owner (2026-10-16, under "keep going"; any can be reversed)
- J1 **One obligation model.** The Illinois equal-pay rows become ordinary obligations. Each has a
  type (a dated compliance rule row with its citation and source), a jurisdiction, a subject
  (agency, branch, client, assignment, worker, or worker at a client), an occurrence key (a date, an
  expiry, a crossing) so it is created once, a due date and a "remind from" date, an owner, a status
  (open, done with a note, not applicable with a reason) and evidence files. "Due soon" and
  "Overdue" are worked out when shown, never stored (Vanta).
- J2 **Rules as data.** Lead days, reminder days, fixed dates, fees and citations are rows with
  effective dates (no literals in code): Illinois renewal 60 days before expiry; Massachusetts 30;
  New Jersey 30 (its rules state no lead, so the safe reading); proof pages on March 1 and
  September 1; I-9 Section 2 three business days after hire; reverification 90 days' warning;
  workers' comp renewal 30 days.
- J3 **Generated from the data, never typed in by hand.** Registrations and workers' comp policies
  (entered in settings) give renewals; Illinois clients with covered work in the last six months
  give a proof obligation for each March 1 and September 1 (the client must check the agency then;
  the agency's part is to give the proof); a new placement at a Massachusetts worksite gives a job
  order due by the end of its first pay period; a New Jersey placement in a designated classification
  whose worker prefers another language gives a notice in English and that language; each worker's
  hire date gives I-9 Section 1 (by the first day) and Section 2 (three business days later,
  weekends skipped, holidays counted — the earlier, safe date); a work authorization end date gives
  reverification; the run keeps giving the equal-pay crossings. Generation is pure and runs after
  every change to its inputs and after every run; a done or not-applicable item is never reopened.
- J4 **Evidence** files are kept in the document store, linked to obligations many-to-many (one
  certificate evidences the agency and branch renewals; Drata), never deleted (an unlinked file stays
  in History). Generated documents attach themselves. **No I-9 copies or identity documents**: the
  I-9 is dates only.
- J5 **Hours counters are computed when shown**, from paid work and opening balances (hours worked
  for a client before Shiftbook, entered per worker and client with the date they run to); nothing
  stored that could drift. The run uses the same balances, so a crossing found here is the run's.
- J6 **Illinois equal-pay rate** (finishes C3): entered on the crossing's obligation — the client's
  comparator rate (or the method the client chose and its rate), the hourly cash value of benefits,
  and the comparator's seniority or SOC code (§ 10(a)(7)) — from a date. From that date the run pays
  that worker at that client at least the rate plus the benefits' cash value per hour (the pay rate
  is raised, so overtime's regular rate includes it), and each pay line says why. **Pay is never held** (paying late
  is itself a violation): from the week after a crossing with no rate on file, the run is blocked
  for that worker until the rate is entered, or the Owner records that the client's data was asked
  for on a date and the week is paid at the rate card now and trued up by a correction later.
- J7 **Workers' comp packet**: pay by state → class → worker for a date range from the latest paid
  runs: straight-time pay, overtime premium and double-time premium apart (NCRB Rule 2-C-2-a), other
  pay; workers with no class listed first and left out of the totals (Patriot); totals tie to the
  payroll files' control totals; CSV and PDF; no SSNs.
- J8 **ACA look-back**: dated settings (standard measurement period months and start month,
  administrative days, stability months; initial period for new workers of the same length); hours of
  service = hours paid (worked, holiday and paid leave minutes; not premiums); full-time when minutes
  × 7 ≥ 1,800 × days in the period; a 13-week gap is a break in service; a monthly hours import for
  months before Shiftbook. An "offer coverage by" obligation for each worker measured full-time.
- J9 **Roles**: the Owner does everything; coordinators complete worker and placement items (I-9,
  Massachusetts job orders, notices); billing completes client proof pages; the accountant reads.
- J10 **Calendar**: month (default), week and agenda; the Google Calendar keys that are documented.
- J11 **Demo** (today 2026-10-16): the agency's Illinois registration expiring 2026-12-31 — due
  soon (renew by 2026-11-01); its Massachusetts registration expiring 2026-11-20 — due soon (renew by
  2026-10-21); Prairie Line's March 1 and September 1 2026
  proof pages done, March 1 2027 upcoming; a Massachusetts job order per Harborview placement, one
  overdue; hire dates and I-9 dates for every worker (one Section 2 due, one reverification within
  90 days); an opening balance that brings one Illinois worker near 720 hours; a 2026 workers' comp
  policy "(demo)"; no New Jersey client. Every name and number invented.

## Open questions (for the owner when convenient; from the research)
1. Do you place workers in New Jersey?
2. Should Shiftbook also track Illinois yearly safety training per worker and client?
3. Shiftbook keeps I-9 dates only, never copies of the forms or documents. Is that right for you?
4. When does your workers' comp policy year start, and who is your insurer?
5. Which ACA measurement period do you use (how many months, starting which month)?
6. Should the Illinois proof page be emailed to clients before March 1 and September 1, or only printed?
7. While a client's equal-pay data is late, should we pay at the rate card and true up later (our
   default), or wait?

## Step 3 in detail (2026-10-16, after steps 1–2 and their second opinion)
Three parts, each usable end to end before the next.

**3a — Hours counters with opening balances (J5).**
- Data: `hours_opening_balances` (worker, client, minutes, the date they run to, a note; who and
  when; tenant isolated; audited; never edited, a wrong one is removed by the Owner with a reason).
- The run counts them as hours worked at the client on the date they run to (the safe reading: the
  latest date they could have been worked, so they stay in the 12- and 48-month windows longest).
- `/compliance/counters` (pattern `compliance/counters.md`, TempWorks ACA Employee Cycles): one row
  per worker and Illinois client with covered work or a balance — hours in the 12 and 48 months to
  today, the crossing on file or hours to go, the equal-pay rate on file; filters client and Show
  (all, near — past the rule's heads-up — crossed); a row opens its balances with Add balance.
- Tests: a pure counter function (windows, balances, thresholds from the rule row); integration: a
  balance makes the run find the crossing; the page in English and Spanish.

**3b — The Illinois equal-pay rate (J6; a wage-rule change: second opinion).**
- Data: `equal_pay_rates` (worker, client, from a date; the comparable direct hire's hourly rate and
  the hourly cash value of benefits, how the client compared — a comparable direct hire, or the
  wage-survey method's 75th percentile — and the comparator's job or seniority; or "asked the client
  on a date", which pays the rate card now and is trued up by a correction later); entered on the
  crossing's duty page by the Owner; audited; dated rows, never edited.
- Engine (pure, `packages/rules/src/rules/il-equal-pay-rate.ts`): from the rate's date, a shift of
  that worker at that client is paid at least the rate plus the benefits' value (the shift's pay rate
  is raised, so the regular rate and overtime follow) and its pay line says why; the "rate missing"
  warning is not raised for weeks with a rate on file. Outputs for inputs without rates are unchanged,
  so the rules version and the approved answer keys stay; a proposed answer key shows the raise.
- Run: a blocker `equal_pay_rate_needed` for a worker with hours at the client in a pay period that
  starts after the one the crossing fell in, with neither a rate nor "asked on" on file.
- Tests first: engine unit tests with hand arithmetic; integration through the run; the duty page.

**3c — ACA look-back (J8).**
- Data: dated settings (standard measurement months and first month, administrative days, stability
  months) checked against dated limits in `aca_rules` (3–12 months, at most 90 days, at least 6 months
  and no shorter than the measurement period, 30 hours a week, a 13-week break); monthly hours from
  before Shiftbook imported from a CSV (`aca_monthly_hours`).
- Hours of service: paid minutes of the latest paid version of each period (worked, holiday and
  leave lines; not premiums), by the day worked, plus the imported months.
- `/compliance/aca` (pattern `compliance/aca.md`, TempWorks ACA Employee Cycles): one row per worker
  and cycle — hire date, cycle (initial or standard), measurement start, end, hours, weeks, average,
  full-time or not; administrative and stability periods; a break in service; filters and Show.
- Duty `aca_offer` (rule row, citation 26 C.F.R. § 54.4980H-3): coverage offered by the end of the
  administrative period to each worker measured full-time.
