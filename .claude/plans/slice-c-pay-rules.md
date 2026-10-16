# Slice (c) — Full pay rules engine with golden tests

Status: GO under the owner's "do everything" (2026-10-15), building after slice (b)'s last review
closes. Every legal choice the research left open uses the safe reading (never pays less than the
law might require); each is listed under "Decisions made for the owner" and the owner can reverse
any of them.
Contract: SPEC.md §9 (pay rules engine), §25 slice (c). Research with primary sources, quotes,
effective dates and nine worked examples: `docs/research/pay-rules-slice-c.md`.

## Goal (what the owner can do at the end)
Run the converter on weeks that are blocked today and get correct, explained pay:
- a worker with two pay rates who works overtime (paid on the weighted average, as federal law says);
- California workers (daily overtime over 8 h, double time over 12 h, the seventh day, no double
  counting), at the same Ontario warehouse the demo already has;
- a rate card below a new minimum wage (a top-up line and a warning instead of a blocked week),
  including Chicago's and Cook County's own minimums;
- a California meal or rest premium, a holiday under the agency's holiday policy, an Illinois
  "sent and not used" 4-hour minimum, and a reporting-time minimum, once a person confirms them;
- the Illinois equal-pay counter (more than 720 hours at one client): an obligation and a warning
  the week it is crossed.
Every line says its inputs, the rule with its citation, and the arithmetic, rounded once.

## Done means (evidence I will paste)
1. `pnpm test` (unit + integration + goldens), `pnpm typecheck`, `pnpm lint` — real output, green.
2. The research's worked examples as proposed goldens (`tests/goldens/_proposed/rules/`), each
   checked against its hand arithmetic, plus the existing ones unchanged except the rules version.
3. A random-week property test: CA pay ≥ federal pay; pay never depends on input order; the
   regular rate is never rounded; totals equal the sum of lines.
4. A second-opinion review of every rule file and of the export changes, fixed.
5. Playwright: the converter on a California week and a two-rate overtime week, English and Spanish.

## Build order (tests first for each; one file per rule with its citation)
1. **Weighted-average regular rate** (29 C.F.R. § 778.115; § 778.111): straight time for every
   minute at its own rate, plus half the week's regular rate per overtime minute; the regular rate
   is an exact fraction, never rounded; overflow-safe arithmetic (BigInt where a product can pass
   2^53). Shift differentials enter the regular rate (§ 778.207(b)). Removes the
   `multiple_pay_rates_with_overtime` blocker. Golden G2 and its night-differential variant.
2. **Minimum wage floor per shift** (§ 778.107; Cal. Armenta v. Osmose): a separate top-up line and a
   warning when a rate card is below the floor that day; the overtime premium base is never below
   that day's floor. Chicago ($17.05 from 2026-07-01) and Cook County ($15.40 from 2026-07-01, with
   opt-out rows) as dated data rows. Golden G7 and variants; the Chicago golden stops being blocked.
3. **California hours** (Lab. Code § 510(a); wage order § 3; DLSE Opinion 2000.01.19; DLSE Manual
   48.1.3.2; Mendoza v. Nordstrom): daily 1.5× over 8 h and 2× over 12 h, seventh day only when all
   seven days of the same workweek are worked, weekly overtime only on hours not already paid at a
   premium, all clients counted together; the federal result as a floor. Still held (with a plain
   reason): alternative workweek schedules, weeks mixing California with another state, workdays
   not starting at midnight. Goldens G1, its two-workweek variant, and G4 billing variants.
4. **Confirmed premiums and guarantees** (each needs a person's confirmation as input):
   - California meal and rest premiums: one hour at the week's regular rate, at most one of each
     per workday, not hours worked (Lab. Code § 226.7(c), two dated versions; Ferra; UPS). G8.
   - Reporting-time pay: California wage order § 5 and Massachusetts 454 CMR 27.04(1).
   - Illinois "sent and not used": 4 hours at the agreed rate, 2 if placed elsewhere that shift
     (820 ILCS 175/30(g); 56 Ill. Adm. Code 260.450(b), eff. 2026-04-28). G5.
   - Holiday policy (agency data, not law): worked-holiday multiplier, paid holiday not worked,
     billing; premiums of 1.5× or more stay out of the regular rate, smaller ones go in
     (§ 207(e)(6), § 778.203, § 778.218). G6.
   - Nondiscretionary bonuses; California flat-sum bonuses per Alvarado v. Dart Container. G9.
   - Prevailing wage stays a hold with the research's plain message (Davis-Bacon, state public works).
5. **Illinois equal pay counter** (820 ILCS 175/42 as amended by P.A. 103-1030; 56 Ill. Adm. Code
   260.445/505): minutes worked per worker × client on dated covered assignments from 2024-04-01,
   rolling 12 months; warning past 600 h; past 720 h an obligation (due before the next pay period)
   and a warning naming the hours after the crossing; 4,160 h in 48 months likewise. G3.
6. **Billing per client**: a double-time bill multiplier, holiday billing, whether guarantees and
   premiums are billed, and "overtime billed only for hours over 40 at this client's sites" (G4d).
7. **Lines**: new pay types (minimum-wage top-up, holiday not worked, bonus, bonus overtime,
   reporting pay) and worked minutes kept apart from paid minutes, so premiums never count as hours
   worked; the Gusto export and invoice map the new types (export change → second opinion).

## Data (every number a dated row with its citation, never a literal)
New rule rows: CA meal/rest premium (two versions), CA reporting time, MA reporting pay, IL 4-hour,
IL § 42 thresholds, Chicago and Cook County minimum wages, CA flat-sum bonus divisor. New agency and
client data: holiday policy, guarantees, the Cook County facility setting, Cook opt-out places, an
"Illinois day and temporary labor" flag per assignment (default on for light industrial), an
"alternative workweek" flag. Confirmations (meal/rest, reporting, sent-and-not-used, bonuses) are
stored rows with who confirmed and when; until a screen exists for them (slice e), the converter
lists possible missed meals and breaks as warnings.

## Screens
No new screen in this slice: results show in the converter's existing totals and lines (pattern
files unchanged). Screens to confirm premiums, enter bonuses and holiday policy come with slices
(e) and (j), each with its own pattern file.

## Decisions made for the owner (safe readings; any can be reversed)
- C1 No "rate of the job" overtime option (§ 778.419): it needs a written agreement before the
  work and no state here adopts it; the weighted average is always lawful.
- C2 Cook County outside Chicago: the county minimum applies unless a place's opt-out is on file
  with its source (paying 40¢ more is lawful; paying less is not).
- C3 Illinois equal pay crossed with no equal-pay rate on file: a warning that week, then that
  worker's weeks at that client are held from the next week until a rate is entered.
  Revised 2026-10-16 while building: there is no screen to enter an equal-pay rate until slice (j),
  so a hold now would stop payroll with no way forward (a dead end). Until then: an obligation due
  before the next pay period, and a warning every week with hours after the crossing; the hold
  arrives with that screen.
- C4 Holiday premium and overtime in the same hours: both paid in full (no credit of one against
  the other).
- C5 Illinois 4-hour and Massachusetts reporting pay: the shortfall is paid in full, without
  counting overtime already earned against it.
- C6 Illinois § 42 is treated as in force (state FAQ, May 22, 2025 court ruling); the research
  could not check court filings after that date.

## Out of this slice
Screens to confirm premiums and enter bonuses or holiday policy (e, j); retro corrections to paid
weeks (e); other states; alternative workweek schedules; split-shift premiums (flag only).

## Progress
- Steps 1–3 (regular rate, minimum-wage floor and top-ups, California hours with the federal
  floor, local minimums held unless on file): built, reviewed, fixed.
- Step 4 (confirmed premiums and guarantees): California meal and rest premiums; California
  reporting time, Massachusetts reporting pay, Illinois day-labor minimum; holiday policy (worked
  premium, holiday not worked, billing) and bonuses (nondiscretionary in the regular rate;
  California flat-sum per Alvarado, the federal result as a floor; California's own premiums use
  its regular rate with the flat-sum share). Proposed goldens G5, G6, G8, G9 checked by hand.
- Notes from building step 4 (safe readings, reversible):
  - A bonus or a confirmation for a week with no hours on file holds that week with a plain
    message; it is never dropped.
  - A holiday not worked is paid once a day, at the day's rate card (raised to the minimum wage if
    the card is below it); a day with any hours worked cannot also be a holiday not worked.
  - Bonuses are not billed in this slice (billing per client profile is step 6).
  - The flat-sum divisor is a method (hours not paid at a premium), not a number, so it has no
    data row; the multiples come from the overtime rows.
  - Integration tests can run per checkout: `SHIFTBOOK_TEST_DB=shiftbook_test_<x>`.
- Step 5 (Illinois § 42 counter): minutes worked per worker and client on covered Illinois work
  from April 1, 2024, over rolling 12 and 48 months (earlier periods' hours read from the stored
  timesheets, set-aside ones excluded); a heads-up past 600 hours; past 720 hours (and 4,160) an
  obligation with its crossing minute, window and the hours after it, due before the next pay
  period, audited, kept in step when the run's hours change and never recorded twice. Golden G3.
  Known limit: the counter knows only hours kept in Shiftbook; hours an agency worked at a client
  before it started using Shiftbook need an opening balance (with the obligations screen, slice j).
- Step 6 (billing per client): "overtime only at the client's own sites" (overtime and double time
  the client's own hours alone would make, by the same rules, at its multipliers; the rest at
  straight time, the agency bearing the premium), and profile settings to bill confirmed meal and
  rest premiums and minimum pay for a short day at the bill rate (default: not billed, as before).
  Golden G4d. The double-time bill multiplier and holiday billing came earlier (steps 3 and 4).
- Next: the step 4 review's findings, step 7 (lines and exports), the random-week property test,
  the second-opinion reviews, Playwright.
