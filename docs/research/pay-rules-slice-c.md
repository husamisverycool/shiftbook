# Slice (c) research: full pay rules engine. Primary sources, computation rules, golden examples

Researched 2026-10-15 for Shiftbook slice (c). All numbers in examples are invented. Amounts are in integer
cents, time in integer minutes, and rates are exact fractions of cents per hour (`Fraction`). Each line is
rounded half-up exactly once, as the engine already does in `lineAmount`.

Access notes. These affect how verifiable each item is.
- leginfo.legislature.ca.gov (CA statutes) is behind a Cloudflare challenge. I took the text of Lab. Code
  §§ 510 and 226.7 from the gov-search index of that page and cross-checked it against DIR pages and the
  IWC wage order (dir.ca.gov/t8/11070.html), which loaded directly.
- eCFR blocked this IP partway through. 778.115, 778.419, 778.200, 778.208/.209/.216/.218/.219/.220 came
  from the eCFR API dated 2026-10-01. 778.105/.107/.110/.111/.203/.207/.211/.417 came from the govinfo
  CFR annual edition (revised 2024-07-01). gov-search shows 2026 eCFR versions of 778.115 with the same text.
- ilga.gov fails TLS through the proxy and WebFetch returned 503. Illinois statute and rule text is quoted
  from gov-search extracts of ilga.gov pages, plus the court opinions and IDOL documents I downloaded.
- Firecrawl scrape is out of credits; gov-search still works.

---------------------------------------------------------------------------------------------------

## 0. What this means for slice (c), in brief

1. **Regular rate.** Use the weighted average (29 C.F.R. § 778.115): all straight-time earnings plus
   includable extras, divided by all hours worked. Keep it as an exact `Fraction`. Never round it.
   Then pay the overtime premium = (multiplier − 1) × RR per OT minute, on top of straight time for
   every minute at that minute's own rate. On a line, an OT line's rate is
   `ownRate + (m − 1) × RR`. With a single rate this reduces to `1.5 × rate`, so the existing proposed
   goldens stay valid.
2. **Do not implement the § 778.419 "rate of the job" method in slice (c).** It needs a prior agreement and
   per-hour ordering, it is a federal option only, and no CA, IL or MA source I found adopts it. The
   weighted average is always compliant. Keep the `multiple_pay_rates_with_overtime` blocker until the
   weighted average is in place, then remove it.
3. **California.** Daily OT over 8 h, DT over 12 h. The seventh-day rule applies only when the worker
   worked all 7 days of the same workweek. Weekly OT counts only minutes not already paid at a premium
   (DLSE OL 2000.01.19). Count days and hours across ALL clients, because the agency is the employer.
4. **Meal/rest premiums (CA).** Pay 1 hour × the workweek's regular rate (Ferra). At most one meal and one
   rest premium per workday. Not hours worked. Excluded from the regular rate. A human must confirm the
   violation.
5. **Minimum-wage true-up.** Apply per shift, per hour (CA does not allow weekly averaging, per Armenta).
   Add a separate line, include it in the regular rate, and warn.
6. **IL DTLSA.** § 30(g) and the rule: a laborer sent and not used for at least 4 h gets 4 h at the agreed
   rate (2 h if placed elsewhere the same shift). § 42 is in force in its 2024-amended form: more than
   720 h with the same client in a 12-month period (hours on or after 2024-04-01); separate thresholds
   for the 4,160 h / 48-month BLS method. The engine outputs an obligation plus a warning, not a pay
   change, until a human enters the comparator rate.
7. **Holiday pay** is never required by law in federal, CA, IL or MA law. It is policy data. The engine
   must still apply the regular-rate rules to it: a worked-holiday premium of ≥ 1.5× is excluded from RR
   and may be credited against OT; a premium < 1.5× must be included in RR. Pay for a holiday not worked
   is not hours worked and is excluded from RR.
8. **Statutory "reporting/show-up" guarantees exist**, so these are not just policy: CA Wage Order § 5,
   MA 454 CMR 27.04(1), IL DTLSA § 30(g). Contract minimum-hours guarantees are policy data.
9. **Prevailing wage is flag-only.** Warn and hold when an assignment is marked public works / Davis-Bacon.

---------------------------------------------------------------------------------------------------

## 1. Federal FLSA: regular rate and overtime

### Sources (quoted)
- **29 U.S.C. § 207(a)(1)**: no employer shall employ an employee "for a workweek longer than forty hours
  unless such employee receives compensation for his employment in excess of the hours above specified at a
  rate not less than one and one-half times the regular rate at which he is employed."
  https://www.govinfo.gov/link/uscode/29/207?link-type=html (U.S. Code 2024 ed.)
- **§ 207(e)**: the regular rate "shall be deemed to include all remuneration for employment paid to, or on
  behalf of, the employee, but shall not be deemed to include— (1) … gifts … (2) payments made for
  occasional periods when no work is performed due to vacation, holiday, illness, failure of the employer
  to provide sufficient work … reasonable payments for traveling expenses … (3) [discretionary bonuses,
  profit-sharing…] (4) [benefit plan contributions] (5) [premium for hours over 8/day or over the max
  week or normal hours] (6) [premium for Saturdays, Sundays, holidays, days of rest, 6th/7th day] where
  such premium rate is not less than one and one-half times the rate established in good faith for like
  work performed in nonovertime hours on other days; (7) [contract premium for work outside the
  basic workday/workweek, ≥1.5×] (8) [stock options]." Text via 29 C.F.R. § 778.200(a).
- **§ 207(h)**: "(1) … sums excluded from the regular rate pursuant to subsection (e) shall not be creditable
  toward wages required under section 206 … or overtime compensation … (2) Extra compensation paid as
  described in paragraphs (5), (6), and (7) of subsection (e) shall be creditable toward overtime
  compensation."
- **§ 207(g)(2)**: OT may be computed "at rates not less than one and one-half times such bona fide rates
  applicable to the same work when performed during nonovertime hours", "pursuant to an agreement or
  understanding arrived at between the employer and the employee before performance of the work", and
  only if "(i) the employee's average hourly earnings for the workweek exclusive of payments described in
  paragraphs (1) through (7) of subsection (e) are not less than the minimum hourly rate … and (ii) extra
  overtime compensation is properly computed and paid on other forms of additional pay required to be
  included in computing the regular rate."
- **29 C.F.R. § 778.115** (eCFR, current as fetched for 2026-10-01): "Where an employee in a single
  workweek works at two or more different types of work for which different nonovertime rates of pay (of
  not less than the applicable minimum wage) have been established, his regular rate for that week is the
  weighted average of such rates. That is, his total earnings (except statutory exclusions) are computed
  to include his compensation during the workweek from all such rates, and are then divided by the total
  number of hours worked at all jobs." https://www.ecfr.gov/current/title-29/section-778.115
- **§ 778.111(a)** (half-time method): "… in addition to the total weekly earnings at this regular rate for
  all hours worked, a sum equivalent to one-half this regular rate of pay multiplied by the number of hours
  worked in excess of 40 … Only additional half-time pay is required in such cases where the employee has
  already received straight-time compensation … for all hours worked." § 778.110(a) gives the same rule for
  a single hourly rate ($12 × 46 + $6 × 6 = $588).
- **§ 778.107**: "The regular rate of pay at which the employee is employed may in no event be less than the
  statutory minimum."
- **§ 778.104**: "Each workweek stands alone … does not permit averaging of hours over 2 or more weeks."
  **§ 778.105**: the workweek is "a fixed and regularly recurring period of 168 hours".
- **§ 778.207(b)**: "The Act requires the inclusion in the regular rate of such extra premiums as nightshift
  differentials (whether they take the form of a percent of the base rate or an addition of so many cents
  per hour) and premiums paid for hazardous, arduous or dirty work."
- **§ 778.208/.209/.211**: nondiscretionary bonuses are included. A bonus covering one week is added to the
  week's earnings and divided by total hours. A bonus for a longer period "must be apportioned back over the
  workweeks", and the extra due per OT week = one-half of the hourly bonus increment × statutory OT hours.
  A bonus is discretionary only if both the fact and the amount are decided at the employer's "sole
  discretion … at or near the end of the period"; any promised or announced bonus is included.
- **§ 778.203**: a special-day premium below 1.5× "must be included in determining the employee's regular
  rate of pay and cannot be credited toward statutory overtime due".
- **§ 778.218(a)**: pay for idle holiday, vacation, illness or failure to provide work is "not made as
  compensation for his hours of employment … may be excluded from the regular rate … no part of such
  payments may be credited toward overtime compensation".
- **§ 778.219(b)(1)** (holiday premium credit): with 9 holiday hours at $18 (1.5×) in a 50-hour week, "it
  does not increase the regular rate because it qualifies as an overtime premium under section 7(e)(6),
  and the employer may credit it toward statutory overtime compensation due". The same section says: "Under
  the statute (which does not require premium pay for a holiday) …"
- **§ 778.220(a)–(c)** (show-up/reporting pay): the part of a guarantee above pay for hours actually worked
  "is considered as a payment that is not made for hours worked. As such, it may be excluded from the
  computation of the employee's regular rate and cannot be credited toward statutory overtime". (c): pay
  for show-up or reporting time required by state and local law is excludable "if such penalties are paid
  or payments made on an infrequent or sporadic basis." Example in (b): $12/h, 2 h worked of a 4-hour
  guarantee, 42 h in the week: $504 straight + $24 show-up + $12 OT premium.
- **§ 778.419(a)–(b)** (job-rate OT option): the employee "may agree with his employer in advance of the
  performance of the work that he will be paid during overtime hours at a rate not less than one and
  one-half times the hourly nonovertime rate established for the type of work he is performing during such
  overtime hours", if § 778.417 is met and "(1) The hourly rate upon which the overtime rate is based [is]
  a bona fide rate; … (3) The number of overtime hours for which the overtime rate is paid equals or
  exceeds the number of hours worked in excess of the applicable maximum". (b): bona fide means "equal to
  or greater than the applicable minimum rate" and "the rate actually paid for such work when performed
  during nonovertime hours."
- **§ 778.417**: (a) average hourly earnings, excluding OT pay and excluded pay, must be ≥ minimum wage;
  (b) "extra overtime compensation must be properly computed and paid on other forms of additional pay
  required to be included in computing the regular rate" (bonuses, differentials).

Effective dates: § 7(a)(1) has used a 40-hour week since 1940. Most of Part 778 dates from 1968
(33 FR 986). § 778.220(c) and the 2019 regular-rate amendments were published Dec. 16, 2019; I recall they
took effect Jan. 15, 2020 but did not re-verify that here. The eCFR versions dated 2026-02-23 and
2026-06-10 show § 778.115 unchanged. I found no 2025–2026 amendment, but did not exhaustively check every
section because eCFR blocked me.

### Computation rule (FLSA, per worker per fixed workweek; all clients combined because the agency is the employer)
```
For each shift i: minutes m_i, effective straight rate e_i = max(payRate_i, wageFloor_i(date, site))
StraightCents(exact)   = Σ m_i·e_i/60
Includable extras X    = Σ shift differentials + nondiscretionary bonuses allocated to this week
                         + worked-holiday/weekend premiums with multiplier < 3/2
                         + minimum-wage true-ups (already inside e_i)
Excluded               = OT premiums; special-day premiums ≥ 3/2; idle holiday/vacation/sick pay;
                         show-up shortfall pay (if sporadic); expense reimbursements; discretionary bonuses
RR (¢/h, Fraction)     = (60·Σ m_i·e_i/60 + 60·X) / Σ m_i  =  (Σ m_i·e_i + 60·X) / Σ m_i
RR_base(date)          = max(RR, MW_floor(date))           -- § 778.107; matters when MW changes mid-week
OT minutes             = max(0, Σ m_i − 2400), assigned chronologically (minutes after the 2400th)
Premium per OT minute  = (3/2 − 1)·RR_base / 60 cents
OT line rate (bucket)  = e_i + (1/2)·RR_base             -- = 1.5·rate when the week has one rate
```
- Ties and ordering. The premium total does not depend on which hours are labelled OT; only client
  allocation does. Keep the existing chronological allocation and `allocation_order_assumed` warning.
- Overflow. `otMinutes × RR.num` can exceed 2^53 (minutes up to 10,080 × rates up to 10^7 × 60). Use
  BigInt or reduce fractions before multiplying.
- § 778.419 is not offered in slice (c). If it is offered later: require an agreement record dated before
  the work, bona fide rates (each ≥ MW and actually used in non-OT hours), start times for every shift in
  OT weeks, OT paid on bonuses/differentials as well, and use only where no state OT rule also applies
  (CA, IL, MA all have their own weekly OT on the regular rate).

### Common mistakes / flags
- Paying 1.5 × the rate of the job worked in the OT hours without a prior agreement. This is the
  § 778.419 conditions failing. It underpays when the OT hours fall on the lower-paid job (see golden 2).
- Rounding the regular rate to cents before multiplying. This breaks "round once".
- Leaving shift differentials, attendance/safety/referral-for-hours bonuses, or retention bonuses out of
  RR. A retention or completion bonus must be apportioned back over prior weeks (§ 778.209), so it is a
  retro OT adjustment for locked periods. **Human confirms** each bonus classification (discretionary vs
  nondiscretionary; flat-sum vs production).
- Counting hours per client instead of per employer. OT and CA daily/7th-day rules aggregate across clients.
- Cash paid in lieu of benefits (for example IL § 42(b) cash equivalent) is generally remuneration and
  likely includable in RR. Not verified here; **human/counsel confirms**.

---------------------------------------------------------------------------------------------------

## 2. California

### Overtime: Lab. Code § 510(a) (current text; core rule since AB 60, operative Jan. 1, 2000)
> "Eight hours of labor constitutes a day's work. Any work in excess of eight hours in one workday and any
> work in excess of 40 hours in any one workweek and the first eight hours worked on the seventh day of work
> in any one workweek shall be compensated at the rate of no less than one and one-half times the regular
> rate of pay … Any work in excess of 12 hours in one day shall be compensated at the rate of no less than
> twice the regular rate of pay … any work in excess of eight hours on any seventh day of a workweek shall
> be compensated at the rate of no less than twice the regular rate of pay … Nothing in this section
> requires an employer to combine more than one rate of overtime compensation …"
— https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=LAB&sectionNum=510 (gov-search
extract). The IWC wage orders say "seventh (7th) consecutive day of work in a workweek", e.g. 8 CCR § 11070
§ 3(A)(1)(a)–(b): https://www.dir.ca.gov/t8/11070.html

- **Workday / workweek** (Lab. Code § 500; DLSE Manual 48.1.2–48.1.3): a workday is "a consecutive 24-hour
  period beginning at the same time each calendar day". A workweek is fixed and recurring. If the
  employer has not designated one, "DLSE will use the calendar week, from 12:01 a.m. Sunday to midnight
  Saturday, with each workday ending at midnight." https://www.dir.ca.gov/dlse/dlsemanual/dlse_enfcmanual.pdf
- **Seventh day.** It applies only when the employee works all seven days of the workweek. DLSE Manual
  48.1.3.2: a worker who starts Wednesday of a Monday workweek and works seven consecutive 8-hour days "is
  not due any overtime … thus having worked 10 consecutive days without overtime." The 30 h/6 h day-of-rest
  exception (Lab. Code § 556) does not remove the premium: DLSE Manual 48.3.1, "could be employed for seven
  days in a week if they were paid the applicable premium pay including for all of their hours worked on
  the seventh consecutive day." Mendoza v. Nordstrom (2017) 2 Cal.5th 1074
  (https://courts.ca.gov/opinions/archive/S224611.PDF) holds the day of rest is counted per workweek.
- **No double counting** (DLSE Opinion Letter 2000.01.19, https://www.dir.ca.gov/dlse/opinions/2000-01-19.pdf):
  "these daily overtime hours would not be counted for the purpose of any other overtime payment, such as
  weekly overtime hours." Its examples: 10 h × 5 days → 10 OT hours, not 20. 9,9,9,9,4 → 4 OT. 7 h × 6 days
  → 2 weekly OT. The wage-order AWS text says the same in general form: "No hours paid at either one and
  one-half … or double the regular rate of pay shall be included in determining when 40 hours have been
  worked."
- **Alternative workweek schedules** (Lab. Code § 511; wage order § 3(B)–(C)): flag only. Block CA weeks
  for assignments marked AWS (`rule_not_supported_yet`).

**Computation rule (CA days and weeks).** "Workday" is the calendar date. Slice (c) supports a midnight
workday only; block other workday starts. Minutes are summed across all shifts and clients that day.
```
allSeven = every one of the 7 dates of the workweek has minutes > 0 (CA worksite)
for each date d (minutes M_d):
  if allSeven and d is the 7th (last) day of the workweek:
       OT_d = min(M_d, 480);  DT_d = max(0, M_d − 480);  straightEligible_d = 0
  else:
       DT_d = max(0, M_d − 720);  OT_d = min(max(0, M_d − 480), 240);  straightEligible_d = min(M_d, 480)
weeklyOT = max(0, Σ straightEligible_d − 2400), taken chronologically from the straight-eligible minutes after the 2400th
Premium = Σ OT minutes·(1/2)·RR_base/60 + Σ DT minutes·(1)·RR_base/60   (plus straight time for every minute)
Safety net: also compute the FLSA premium = (1/2)·RR_fed·max(0, Σ M_d − 2400)/60; pay the larger total
            (CA ≥ FLSA whenever both apply to the same hours; an assertion should hold).
```
- Mixed-state weeks: CA daily rules apply to CA days. It is ambiguous whether the CA weekly 40 counts
  out-of-state hours. Block weeks mixing CA with other states (`rule_not_supported_yet`).
- Which minute in a shift is OT: within a day, minutes after the 480th are OT, after the 720th DT, in
  start-time order across that day's shifts.

### Regular rate in CA
- Multi-rate: DLSE FAQ (https://www.dir.ca.gov/dlse/faq_overtime.htm): "If you are paid two or more rates …
  the regular rate is the 'weighted average' … dividing your total earnings for the workweek, including
  earnings during overtime hours, by the total hours worked during the workweek, including the overtime
  hours." Its own example: 32 h × $11 + 10 h × $9 = $442 / 42 h = $10.52. DLSE rounds; Shiftbook must not.
  DLSE Manual 49.2.5: "the California method … mirrors the federal method … (See 29 CFR § 778.115)".
  Shift differentials are included ("including … shift differentials and the per hour value of any
  non-hourly compensation", same FAQ).
- Premium hours: "an additional one-half the regular rate for hours requiring time and one-half, and … the
  full rate for hours requiring double time."
- **Flat-sum bonuses (CA-specific). Correction: the case is Alvarado v. Dart Container Corp. of California
  (2018) 4 Cal.5th 542, not "Dave & Buster's"** (https://courts.ca.gov/opinions/documents/S232607.PDF).
  The divisor is "the number of nonovertime hours the employee worked during the pay period". DLSE FAQ: the
  flat sum "must be divided by the maximum legal regular hours worked in the bonus-earning period, not by
  the total hours worked … Overtime on a flat sum bonus must then be paid at 1.5 times or 2 times this
  regular rate". Production bonuses: divide by all hours and pay 0.5× or 1× (DLSE Manual 49.2.4–49.2.4.2).
  Rule:
  ```
  flat-sum bonus B (CA): bonusRate = B / straightHours;  bonusOT = OT_h·(3/2)·bonusRate + DT_h·2·bonusRate
  production bonus B:    bonusRate = B / allHours;       bonusOT = OT_h·(1/2)·bonusRate + DT_h·1·bonusRate
  ```
- Excluded from RR in CA (DLSE Manual 49.1.2.4(9), citing Murphy v. Kenneth Cole (2007) 40 Cal.4th 1094):
  "Reporting time pay, extra hour for failure to provide meal period, extra hour for failure to provide
  break and split shift pay need not be included." Also the § 207(e) list, including special-day premiums
  ≥ 1.5× (49.1.2.4(6)).
- CA is "regular rate, not less than MW": DLSE FAQ: "In no case may the regular rate of pay be less than the
  applicable minimum wage." This is why `RR_base(date) = max(RR, floor(date))`.

### Meal and rest premiums: Lab. Code § 226.7(c)
> "the employer shall pay the employee one additional hour of pay at the employee's regular rate of
> compensation for each workday that the meal or rest or recovery period is not provided."
The current version is repealed Jan. 1, 2027. A successor version (Stats. 2020, ch. 343, § 3) is operative
Jan. 1, 2027 with the same premium sentence; it drops the security-officer subdivision (f). Add an
effective-dated row for each version.
- **Ferra v. Loews Hollywood Hotel, LLC (2021) 11 Cal.5th 858**, decided July 15, 2021
  (https://supreme.courts.ca.gov/sites/default/files/supremecourt/default/2022-08/S259172.pdf):
  "regular rate of compensation" in § 226.7(c) means the same as "regular rate of pay" in § 510(a), so it
  includes nondiscretionary incentive pay. I recall the court applied this retroactively but did not
  re-verify the text.
- At most one meal premium and one rest premium per workday: UPS v. Superior Court (2011) 196 Cal.App.4th 57,
  "section 226.7 permits up to two premium payments per workday."
- Not hours worked: DLSE meal FAQ, "This additional hour is not counted as hours worked for purposes of
  overtime calculations." https://www.dir.ca.gov/dlse/FAQ_MealPeriods.htm
- Triggers, for detection only (wage order § 11, § 12; Lab. Code § 512):
  - Meal: a work period over 5 h without a 30-minute off-duty meal; waivable if the day's work is ≤ 6 h.
  - Second meal: over 10 h; waivable if ≤ 12 h and the first meal was not waived.
  - Meal timing: the meal must start no later than the end of the 5th hour (Brinker (2012) 53 Cal.4th
    1004; not re-read here).
  - Rest: 10 minutes per 4 h "or major fraction thereof"; none if the day is < 3.5 h.
  - Records showing noncompliant meals raise a rebuttable presumption (Donohue v. AMN (2021) 11 Cal.5th 58).
  - **Human confirms** every premium (SPEC: engine computes, human confirms). "Recovery period" (heat)
    premiums share the statute: flag only.
- **Rule:** `premiumCents = round(60 × RR_week / 60) = round(RR_week)`, per confirmed (workday, type),
  capped at 1 meal + 1 rest per workday. Type MEAL_PREMIUM / REST_PREMIUM, worked minutes 0, excluded from RR.

### Other CA pay rules the engine must at least flag
- **Reporting time pay** (wage order § 5(A), 8 CCR § 11070): if the employee reports but "is not put to work
  or is furnished less than half said employee's usual or scheduled day's work, the employee shall be paid
  for half the usual or scheduled day's work, but in no event for less than two (2) hours nor more than four
  (4) hours, at the employee's regular rate of pay". (B): a second report the same day with < 2 h of work →
  2 h. (C): exceptions (threats, utility failure, Act of God). Needs scheduled minutes as input. Excluded
  from RR. **Human confirms.** Rule:
  `due = clamp(scheduled/2, 120, 240)`; if `worked < scheduled/2`, pay `max(0, due − worked)` minutes at RR_base.
- **Split shift** (wage order § 4(C)): "one (1) hour's pay at the minimum wage shall be paid in addition to
  the minimum wage for that workday". This hits agencies that send a worker to two clients with an unpaid
  gap. I did not verify the DLSE offset method (premium reduced by pay above MW); flag only for now.
- **Industry minimum wages**: fast food $20.00 from 2024-04-01 (wage order § 4(E)), and covered health-care
  facilities (SB 525) are higher. Flag-only by client industry.

### CA minimum wage 2026 and local ordinances
- Statewide **$16.90/h from 2026-01-01, all employers regardless of size**
  (https://www.dir.ca.gov/dlse/minimum_wage.htm; DIR release 2025-118). The size tiers (≤25 vs 26+) ended
  in 2023 (DIR FAQ table). $17.40 from 2027-01-01 is already in `reference-data.ts` from the earlier
  research; not re-verified here.
- Local: DIR points to the UC Berkeley Labor Center inventory
  (https://laborcenter.berkeley.edu/inventory-of-us-city-and-county-minimum-wage-ordinances/, page modified
  2026-09-30). It is secondary but is the list DIR links. **Ontario and San Bernardino County are not
  listed**, so the demo Ontario DC (06071 / 0653896) uses the state rate. CA localities listed for 2026:
  Alameda, Belmont, Berkeley, Burlingame, Cupertino, Daly City, East Palo Alto, El Cerrito, Emeryville,
  Foster City, Fremont, Half Moon Bay, Hayward (small-employer tier $16.90), Los Altos, Los Angeles, LA
  County unincorporated, Malibu, Menlo Park, Milpitas, Mountain View, Novato (small tier), Oakland, Palo
  Alto, Pasadena, Petaluma, Redwood City, Richmond, San Carlos, San Diego, San Francisco, San Jose, San
  Mateo, San Mateo County unincorporated, Santa Clara, Santa Monica, Santa Rosa, South San Francisco,
  Sonoma (small tier $17.38), Sunnyvale, West Hollywood.
- Local rates usually change Jan 1 or Jul 1. Several have employer-size tiers. Hotel, airport and similar
  sector ordinances (e.g., LA) are separate: keep them as their own rule codes that block until modeled.
- **Minimum wage is per hour in CA**: Armenta v. Osmose (2005) 135 Cal.App.4th 314, "the FLSA model of
  averaging all hours worked 'in any work week' … is inappropriate. The minimum wage standard applies to
  each hour worked." Federal law is per workweek: Douglas v. Xerox Business Services (9th Cir. 2017)
  875 F.3d 884, citing the DOL Field Operations Handbook. A per-shift true-up satisfies both.

---------------------------------------------------------------------------------------------------

## 3. Massachusetts

- **Weekly OT**: M.G.L. c. 151 § 1A: "no employer … shall employ any of his employees … for a work week
  longer than forty hours, unless such employee receives compensation for his employment in excess of forty
  hours at a rate not less than one and one half times the regular rate at which he is employed" (quoted in
  DLS opinion letter, https://www.mass.gov/doc/agricultural-overtime-redraft-opinion-letter-04-02-20/download).
- **454 CMR 27.03(3)**: OT = "One and one half times an employee's regular hourly rate, such regular hourly
  rate not to be less than the basic minimum wage, for work in excess of 40 hours in a work week".
  **454 CMR 27.02** defines "Regular Hourly Rate" to include all remuneration but not "(a) sums paid as
  commissions, drawing accounts, bonuses, or other incentive pay based on sales or production; or (b) sums
  excluded under 29 U.S.C. § 207(e)." https://www.mass.gov/doc/minimum-wage-regulation-454-cmr-2700-0/download
  - Engine consequence: the MA regular rate can be lower than the FLSA one (production bonuses). Same
    threshold and multiplier, so the FLSA result governs. Compute FLSA, and MA only as a check.
- **Reporting pay, 454 CMR 27.04(1)**: "When an employee who is scheduled to work three or more hours
  reports for duty at the time set by the employer, and that employee is not provided with the expected
  hours of work, the employee shall be paid for at least three hours on such day at no less than the basic
  minimum wage." Ambiguous whether this means a 3 h × MW total for the day or worked pay plus the shortfall
  at MW. Conservative rule: pay `max(0, 180 − worked)` minutes at max(own rate, MW). **Human confirms.**
- **Minimum wage**: $15.00 since 2023-01-01. mass.gov "Minimum wage and overtime information" still states
  $15.00, and I found no later rate (https://www.mass.gov/info-details/minimum-wage-and-overtime-information).
  No local minimum wages exist in MA (earlier research, docs/research/minimum-wage-2026.md).
- **Sunday/holiday premium: gone since 2023-01-01.** mass.gov Blue Laws guide
  (https://www.mass.gov/guides/massachusetts-blue-laws-and-working-on-sundays-and-holidays): "premium pay
  requirements were eliminated effective January 1, 2023. Previously, certain retailers were required to pay
  certain hourly employees a higher hourly wage rate on Sundays and certain holidays. That requirement
  expired as a result of a change in state law." The current c. 136 § 6(50) text has no rate. c. 136 § 13
  still refers to "a rate specified under clause (50)", which now specifies none. Voluntariness
  (retail cannot require Sunday or holiday work) remains; that is a scheduling rule, not pay.
  Also on that page: "Under the minimum fair wage law, an employer does not have to pay extra for weekend,
  holiday, or night work."

---------------------------------------------------------------------------------------------------

## 4. Illinois, Chicago, Cook County, DTLSA

### Weekly OT and regular rate
- 820 ILCS 105/4a(1): "no employer shall employ any of his employees for a workweek of more than 40 hours
  unless such employee receives compensation for his employment in excess of the hours above specified at a
  rate not less than 1 1/2 times the regular rate at which he is employed." Quoted in Mercado v. S&C
  Electric, 2023 IL App (1st) 220020, https://illinoiscourts.gov/resources/15fad9e7-1823-4a5d-966c-ce1ed364aa8c/file
- 56 Ill. Adm. Code 210.410 (exclusions mirror § 207(e)) and 210.420(a): "The regular rate of pay … shall in
  no event be less than the statutory minimum." 210.430(a) uses half-time on top of straight time.
  https://ilga.gov/ftp/JCAR/AdminCode/056/056002100D04300R.html. No explicit multi-rate rule was found in
  the IL regs, so use the FLSA weighted average. IL has no daily OT.
- **IL minimum wage $15.00** (since 2025-01-01; IDOL page https://labor.illinois.gov/laws-rules/fls/minimum-wage-law.html).

### Chicago (Municipal Code ch. 6-105)
- **$17.05/h from 2026-07-01** (was $16.60 from 2025-07-01). It applies to employers with 4 or more
  employees; there is no small-employer tier since July 1, 2024. Youth and subsidized rates are now the full
  $17.05. Tipped $12.96. OT minimum $25.58.
  https://www.chicago.gov/city/en/depts/bacp/supp_info/office-of-labor-standards.html ;
  https://www.chicago.gov/content/dam/city/depts/bacp/OSL/2026_OLS_MINIMUM-WAGE_English.pdf
- **Coverage, per worker**: MCC 6-105-010: "'Covered Employee' means an Employee who, in any particular
  two-week period, performs at least two hours of work for an Employer while physically present within the
  geographic boundaries of the City." MCC 6-105-040: wages "are subject to the overtime compensation
  provisions in the Minimum Wage Law". Rules (2026 OLS Minimum Wage Rules, gov-search extract):
  - MW 2.01: "$17.05 per hour for Employers who have 4 or more Employees".
  - MW 2.03(a): "at least 1.5 times the City minimum Wage for each hour in excess of 40 hours".
  - MW 2.03(c): if wages "do not equal at least the number of hours worked times the applicable City
    minimum Wage, the Employer must make up the difference … no later than the next regularly-scheduled pay
    period."
- **Temp workers**: the agency is the employer and counts all its employees toward the 4. Chicago's 2026
  paid-leave rules add a joint-employer rule naming "temporary staffing agency" (Rule PTO 1.03); I did not
  find the same text in the MW rules.
- Engine: apply the Chicago rate to shifts at Chicago places (1714000), effective-dated each July 1. The
  2-hours-in-2-weeks coverage threshold only ever lowers the obligation, so apply it always (conservative)
  and note it in the explain.

### Cook County (Cook County Code § 42-13)
- **$15.40/h from 2026-07-01** (tipped $9.25). https://www.cookcountyil.gov/service/minimum-wage-ordinance-and-regulations
  The annual increase is capped at 2.5%, and the calculation is not used when county unemployment is ≥ 8.5%.
- Coverage (county notice, https://www.cookcountyil.gov/news/cook-county-issues-notice-minimum-wage-ordinance-5):
  "The employee has worked for an employer in Cook County for at least 2 hours in any two-week period, The
  employer has four or more employees …, and The employer maintains a business facility in Cook County or is
  issued a business license by Cook County." Municipalities may opt out. The county publishes no current
  opt-out list (earlier research); an IDHS rate study says 110 have opted out (secondary).
- Engine data needed: an agency setting "has a Cook County facility or license" (yes/no), and an
  effective-dated opt-out table by place code. Recommendation for the owner to decide: in Cook County
  outside Chicago, apply $15.40 unless an opt-out row with a citation exists for that place. Overpaying
  40¢/h is lawful; underpaying is not.

### Day and Temporary Labor Services Act (820 ILCS 175)
Scope (§ 5): "'Day and temporary labor' does not include labor or employment of a professional or clerical
nature." Each assignment needs a `dtlsaCovered` flag: default true for light industrial in IL, false for
clerical/professional. https://ilga.gov/ftp/ILCS/Ch%200820/Act%200175/082001750K5.html

**4-hour minimum, § 30(g):** "A day or temporary laborer who is contracted by a day and temporary labor
service agency to work at a third party client's worksite but is not utilized by the third party client
shall be paid by the day and temporary labor service agency for a minimum of 4 hours of pay at the agreed
upon rate of pay. However, in the event the day and temporary labor service agency contracts the day or
temporary laborer to work at another location during the same shift, the day or temporary laborer shall be
paid … for a minimum of 2 hours of pay at the agreed upon rate of pay."
(https://ilga.gov/Documents/legislation/ilcs/documents/082001750K30.htm)
**Rule 56 Ill. Adm. Code 260.450(b)** (amended 50 Ill. Reg. 7177, eff. 2026-04-28) is broader: "is not
utilized by the third party client for a minimum of 4 hours, shall be paid … for a minimum of 4 hours of
pay at the agreed upon rate of pay". If placed elsewhere the same shift: "paid … for all hours worked on the
shift but no less than 2 hours."
- Rule, with a flag input `sentToClient` plus the human-confirmed outcome:
  ```
  worked < 240 at that client that shift, not reassigned → shortfall = 240 − worked minutes at the agreed rate
  reassigned same shift → total shift minutes paid ≥ 120 (shortfall = max(0, 120 − all minutes worked that shift))
  ```
  Line type MIN_GUARANTEE, worked minutes 0, excluded from RR if infrequent (§ 778.220(c)), not counted
  toward 40.
- Ambiguity: whether OT premium already earned on the worked part counts toward the 4-hour amount.
  Conservative: no (pay shortfall minutes × rate). **Human/counsel confirms.**

**Equal pay, § 42 (current text, P.A. 103-1030, eff. 2024-08-09)**
(https://ilga.gov/ftp/ILCS/Ch%200820/Act%200175/082001750K42.html; P.A. text
https://ilga.gov/legislation/publicacts/fulltext.asp?Name=103-1030):
- (a) "A day and temporary labor service agency shall pay a day or temporary laborer who is assigned to work
  and performs work at the same third party client for more than 720 hours within a 12-month period,
  beginning on or after April 1, 2024, in accordance with one of the following methods:"
  - (1)(A) comparator: "not less than the straight-time hourly rate of pay or hourly equivalent of the
    lowest paid directly hired comparator employee of the third party client who is entitled to overtime
    under the [FLSA] … with the same or substantially similar level of seniority …".
  - (1)(B) no comparator: "the lowest paid directly hired employee … with the closest level of seniority".
    Rule 260.445(a)(1): method (1) "shall be the default method unless the third party client directs" (2).
  - (2) BLS method "at the sole discretion of the third party client": (A) "more than 720 hours within a
    12-month period, not less than the median base hourly rate … [OEWS, same SOC, same metro or nonmetro
    area]"; (B) "more than 4,160 hours within a 48-month period, not less than the 75th percentile base
    hourly rate …".
- (b) benefits: "substantially similar benefits … may pay the hourly average cash equivalent of the actual
  cost of the benefits the third party client provides the applicable directly hired employees in lieu of
  benefits".
- (c) the client must, on request, provide pay, seniority and benefits data for workers over "720 hours
  within a 12-month period or 4,160 hours within a 48-month period". Rule 260.505(b): "'timely' means
  before the beginning of the day or temporary laborer's next pay period."
- § 43 exception: client direct-hire comparators under a CBA in effect on 2024-04-01, for that CBA's term.
  After that, a CBA removes only the § 42(b) cash payment.
- **History and effective dates.**
  - Original § 42 came from P.A. 103-437 (eff. 2023-08-04) and used "more than 90 calendar days". A 2023
    act delayed § 42 to 2024-04-01 (per the May 2025 opinion, n.1).
  - P.A. 103-1030 (eff. 2024-08-09) replaced 90 days with the 720 h / 12-month test, added the BLS
    method and the 4,160 h / 48-month tier.
  - Implementing rules 56 Ill. Adm. Code 260 (260.445, 260.450, 260.505, 260.550) amended or added at
    50 Ill. Reg. 7177, eff. 2026-04-28. The source line was seen on 260.450 and 260.550; the 260.445 date
    is assumed to be the same rulemaking.
  - IDOL bulletin 2025-06-05: the § 42 "requirements are now applicable after '720 hours within a 12-month
    period' worked by the laborer for work performed on or after April 1, 2024."
    https://labor.illinois.gov/content/dam/soi/en/web/idol/laws-rules/fls/dtlsa/DTLSA_06052025_final%20.pdf
- **Litigation status, precisely.** Staffing Services Ass'n of Illinois v. Flanagan, N.D. Ill. No. 1:23-cv-16208.
  - **March 11, 2024**: the court granted a preliminary injunction against original § 42 as ERISA-preempted.
    The plaintiffs challenged the benefits part, not the wage part (Doc. 45, via
    https://www.jacksonlewis.com/sites/default/files/2024-03/IL-nd-StaffingSvc-v-Flanagan.pdf).
  - IDOL appealed, then told the agencies it treated § 42(b) as still enjoined after the amendment.
    IDOL then voluntarily dismissed the appeal.
  - **May 22, 2025 (Doc. 110)**: the court denied a preliminary injunction against the amended §§ 42(b)
    and (c): "the Court denies Plaintiffs' motion for a preliminary injunction."
    https://www.uschamber.com/assets/documents/Opinion-Staffing-Services-Association-of-Illinois-v.-Flanagan-N.D.-Ill.pdf
  - The IDOL DTLSA FAQ (retrieved 2026-10-15, https://labor.illinois.gov/faqs/day-temp-labor-faq.html)
    describes § 42(a) and (b) as operative, with no mention of an injunction.
  - **Not verified:** any appeal or ruling after May 22, 2025 (CourtListener was rate-limited and no news
    source covers it). Owner/counsel should confirm before relying on this.
- **What "trigger" means, for the engine.** Count minutes **worked** (not guarantee, holiday or PTO
  minutes), per worker × third-party client entity (all its worksites), only on dates ≥ 2024-04-01, only
  for `dtlsaCovered` assignments, only through this agency. Other agencies' hours are unknowable. The
  statute is silent on them; flag that.
  ```
  window12(d) = minutes worked on dates in (d − 12 months, d]    -- rolling, re-evaluated at each shift, in time order
  warn        when window12 first exceeds 36,000  (600 h; SPEC choice, not law)
  TRIGGER     at the first minute where window12 > 43,200        (720 h; "more than 720 hours")
  window48(d) = minutes on dates in (d − 48 months, d]; > 249,600 (4,160 h) → second obligation (BLS 75th pct; client data duty)
  ```
  Ambiguity: "a 12-month period" (rolling vs fixed) and whether the duty ends if the trailing window later
  drops below 720 h. Rolling with no reset is the conservative reading. **Owner/counsel confirms.**
- **Output on trigger** (SPEC: "create an obligation"):
  - An `Obligation{type: il_dtlsa_s42_equal_pay, jurisdiction: IL, subject: worker×client, evidence:
    crossing date/time, minute counts, entry ids, due: before the next pay period begins}`.
  - A non-blocking warning naming the minutes worked after the crossing.
  - No pay change until a human enters the comparator rate (or BLS rate) and the benefits cash equivalent,
    effective from the crossing.
  - Recommendation for the owner: from the next workweek on, **block** weeks for that worker × client
    while the obligation is open and no equal-pay rate is on file, to avoid continuing underpayment.

---------------------------------------------------------------------------------------------------

## 5. Holiday pay and minimum-hours guarantees

**No law in CA, IL, MA or federal law requires private-employer holiday pay or holiday premiums** (outside
government-contract wage determinations):
- Federal: "The Fair Labor Standards Act (FLSA) does not require payment for time not worked, such as
  vacations or holidays" (https://www.dol.gov/general/topic/wages/holiday). § 778.219(b)(1): "the statute
  (which does not require premium pay for a holiday)".
- CA: "California law does not require that an employer provide its employees with paid holidays … there is
  nothing in the law that mandates an employer pay an employee a special premium for work performed on a
  holiday, Saturday, or Sunday, other than the overtime premium" (https://www.dir.ca.gov/dlse/FAQ_Holidays.htm).
- IL: "An employee is not entitled to vacation, severance pay, sick pay or holiday pay by law"
  (https://labor.illinois.gov/faqs/vacation-faq.html). Once promised by policy, it is earned wages.
- MA: "an employer does not have to pay extra for weekend, holiday, or night work"; the retail premium ended
  2023-01-01 (section 3).

So holiday rules are **policy data** (agency default, client override, effective-dated). The engine still
owes these legal treatments:
```
HolidayPolicy {dates[], workedMultiplier: Fraction, notWorkedMinutes, notWorkedRateBasis,
               eligibility (e.g. worked last scheduled day before and first after; min tenure),
               stacking: "additive" | "credit_toward_overtime", billWorkedMultiplier, billNotWorked: bool}
Worked holiday minute: straight at e_i + premium (workedMultiplier − 1)·e_i
   if workedMultiplier ≥ 3/2 → excluded from RR (§ 207(e)(6)); creditable toward statutory OT only when
                               stacking = credit (§ 207(h)(2)); CA crediting NOT verified → additive for CA
   if workedMultiplier < 3/2  → premium INCLUDED in RR; never creditable (§ 778.203, § 778.207(a))
Holiday not worked → HOL_NOT_WORKED line, worked minutes 0, excluded from RR, not counted toward 40/8,
                     not creditable (§ 778.218(a); DLSE OT FAQ Q7)
```
- **How good products model it (brief):**
  - Bullhorn (Time & Labor / BTE): holiday schedules are attached at the placement level. There are two
    rules: "Worked Holiday Threshold" runs before daily/period OT and removes holiday hours from the weekly
    total; "Worked Holiday" runs after OT. Other rules include "Guaranteed Hours" (credits guaranteed hours
    when reported hours fall short), "Low Census" (paid but not or reduced billed), "7th Day Threshold",
    "Daily Threshold" and "FLSA Adjustment". Docs say "Time can only be evaluated once", so the rule
    priority order matters (https://kb.bullhorn.com/bhone/Content/BH1/Topics/timeProcessingRules.htm ;
    .../timeProcessingRulesPriorityHolidays.htm).
  - **Lesson:** removing holiday hours from the 40-hour count is only safe when the holiday multiplier is
    ≥ 1.5 (it equals § 207(h)(2) crediting). Below 1.5 it underpays (golden 6, worker C variant).
  - Gusto: a company-level holiday pay policy (one per company) pays selected federal holidays as a
    "Holiday Hours" item. No multiplier is documented in its API docs
    (https://docs.gusto.com/embedded-payroll/docs/time-off-policies). Dayforce has a holiday rule with a
    multiplier and a separate OT rate. Rippling: no public doc found.
- **Minimum-hours guarantees.**
  - Contract (policy data): `Guarantee{scope: shift|day|week, minutes, rate: own|fixed, billable: bool,
    appliesWhen: sent_home|cancelled_late}`. Shortfall = guarantee − worked, paid at the rate, worked
    minutes 0, excluded from RR only if "infrequent or sporadic" (§ 778.220(a)). Warn when the same worker
    receives it often; the threshold is an owner setting. **Human confirms.**
  - Statutory: CA reporting time (§ 2), MA reporting pay (§ 3), IL DTLSA 4 h/2 h (§ 4).
    Statutory amounts are rule data with citations, not policy.

---------------------------------------------------------------------------------------------------

## 6. Prevailing wage: what a flag-only treatment should say

- **Davis-Bacon and Related Acts** apply to "federal and federally assisted contracts in excess of $2,000
  for construction, alteration, or repair". Laborers and mechanics on the site get the wage determination
  rate (https://webapps.dol.gov/elaws/elg/dbra.htm).
  - OT on these jobs is 1.5× the basic (cash) rate over 40 under the Contract Work Hours and Safety
    Standards Act. Fringe payments are excluded from the OT base but the base can never be below the
    determination's cash rate (29 C.F.R. § 5.32(a)).
  - Weekly certified payroll WH-347. Hours over 40 count "including hours worked on and off the site of
    the work" (https://www.dol.gov/agencies/whd/forms/wh347).
  - A covered worker's other work that week cannot be paid less to offset (FOH 15f09).
- **State public works**:
  - CA Lab. Code § 1771 et seq. (DIR determinations, registration and certified payroll). DLSE Manual
    49.2.6: on a public-works project the OT base is the greater of the weighted average and the prevailing
    rate.
  - IL Prevailing Wage Act, 820 ILCS 130 ("all laborers, workers and mechanics employed by or on behalf
    of any and all public bodies engaged in public works").
  - MA M.G.L. c. 149 §§ 26–27H (schedule per project; deductions limited to health, pension and SUB plans).
- Also: the Service Contract Act (federal service contracts) carries wage and fringe determinations with
  holiday/vacation requirements (DOL holiday page above).
- **Flag text.** When an assignment or job order is marked public works, Davis-Bacon or SCA:
  - Hold the week (`rule_not_supported_yet: prevailing_wage`).
  - Message: "This placement is on a public-works or government contract. The pay rate, fringe benefits,
    overtime basis and certified-payroll reports are set by the project's wage determination, which
    Shiftbook does not compute. Pay and report it outside Shiftbook or confirm with the contractor."
  - Also warn when a job order's client or site is a public body, or the order mentions DIR, DBA, CWHSSA
    or "certified payroll".

---------------------------------------------------------------------------------------------------

## 7. Engine design consequences (inputs to the slice plan)

**Order per worker-week, refining SPEC § 9:**
1. Classify: workweek; sites; block CA weeks mixed with other states; block CA AWS assignments, non-midnight
   CA workdays, prevailing-wage assignments, and local ordinances not yet modeled.
2. Wage floor: per shift `e_i = max(rate_i, floor_i)`. Shortfall → MW_TRUEUP line + warning.
3. Straight pay for every minute at `e_i`.
4. Regular rate: exact `Fraction`. Inputs are straight pay, differentials, includable bonuses, and holiday
   premiums below 1.5×.
5. Overtime:
   - FLSA/IL/MA weekly, and CA daily/DT/7th/weekly-on-straight-eligible.
   - Premium base is `max(RR, floor(date))`; take the larger of the CA and FLSA totals.
   - CA flat-sum bonus OT per Alvarado.
6. Confirmed premiums: meal/rest (CA), holiday per policy, statutory and contract guarantees, IL 4 h.
7. Allocate to clients. Bill per client rules:
   - multiplier, straight time or not billable for OT.
   - **new:** a separate DT bill multiplier; holiday bill multiplier; whether guarantees and
     meal/rest premiums are billable.
   - **new variant:** "client pays OT only for hours over 40 at its own sites".
8. Counters and obligations: IL § 42 12-month and 48-month counters, 600 h warning.

**Line and type changes:**
- Add earning types `MW_TRUEUP`, `HOL_NOT_WORKED` (keep `HOL` for worked-holiday hours), `BONUS`,
  `BONUS_OT`, `REPORTING_PAY` (statutory) next to `MIN_GUARANTEE` (contract or IL).
- Lines need `workedMinutes` separate from `paidMinutes`, so premiums and guarantees never feed hours
  totals, OT counts or § 42 counters, and exports report hours correctly.

**New effective-dated rule data. Every number below is a data row with a citation, not a literal:**

| ruleCode | numbers | citation |
|---|---|---|
| ca_meal_premium / ca_rest_premium | 60 min × RR; max 1 each per workday | Lab. Code § 226.7(c) (two versions: to 2026-12-31, from 2027-01-01); Ferra; UPS |
| ca_reporting_time | ½ scheduled, min 120, max 240; second report 120 | 8 CCR 11010–11160 § 5 |
| ma_reporting_pay | scheduled ≥ 180 → ≥ 180 min at ≥ MW | 454 CMR 27.04(1) |
| il_dtlsa_not_utilized | 240 min; reassigned 120 min | 820 ILCS 175/30(g); 56 IAC 260.450(b) (eff. 2026-04-28) |
| il_dtlsa_s42 | warn 36,000; trigger > 43,200 in 12 mo; > 249,600 in 48 mo; count from 2024-04-01 | 820 ILCS 175/42 (P.A. 103-1030, eff. 2024-08-09); 56 IAC 260.445/505 |
| local MW Chicago | 1705 from 2026-07-01 (1660 from 2025-07-01) | MCC 6-105; OLS Rule MW 2.01/2.03 |
| local MW Cook County | 1540 from 2026-07-01 + opt-out rows | Cook Co. Code § 42-13 |
| ca_flat_sum_bonus_divisor | non-OT hours; OT factor 3/2, DT 2 | Alvarado (2018) 4 Cal.5th 542; DLSE Manual 49.2.4.2 |

**Human-confirms list (engine computes, human confirms):**
- meal, rest and recovery violations;
- CA reporting time (needs scheduled hours);
- IL "sent and not utilized";
- every bonus's classification and period;
- whether a guarantee is sporadic;
- § 42 comparator or BLS rate, benefits cash equivalent, and the client's direction to use the BLS method;
- holiday stacking policy;
- Cook County opt-outs and the agency's Cook facility/license;
- AWS existence;
- prevailing-wage status.

**Exports flag:** if a payroll export sends hours (not amounts), the provider may recompute OT with its own
regular-rate logic and disagree with Shiftbook. Send amounts per earning code where formats allow (slice f).

---------------------------------------------------------------------------------------------------

## 8. Golden examples (invented data; exact arithmetic)

Notation: ¢ = cents; RR is exact. `round` = half-up once at line level.

### G1. California daily + seventh-day OT (`ca-daily-and-seventh-day`)
Ontario CA (06071/0653896). Workweek starts **Sunday** (`workweekStartsOn: 0`), Sun 2026-10-04 to Sat
2026-10-10. Single rate $18.00 (1800¢), bill $26.00, bill OT 3/2, bill DT 2/1. Shifts start 07:00.

| Day | Date | Minutes | Classification |
|---|---|---|---|
| Sun | 10-04 | 480 | 480 straight-eligible |
| Mon | 10-05 | 600 | 480 SE + 120 daily OT |
| Tue | 10-06 | 780 | 480 SE + 240 daily OT + 60 DT |
| Wed | 10-07 | 480 | 480 SE |
| Thu | 10-08 | 480 | 480 SE (cumulative SE = 2400) |
| Fri | 10-09 | 360 | 360 SE → all weekly OT (SE over 2400) |
| Sat | 10-10 | 600 | 7th consecutive day: 480 OT + 120 DT |

Total 3780 min (63 h). REG 2400; OT 120+240+360+480 = 1200; DT 60+120 = 180. Check: 3780 ✔.

Pay:
- REG 2400×1800/60 = **72,000¢ $720.00**.
- OT 1200×2700/60 = **54,000¢ $540.00**. Split by rule: daily 360 min $162.00, weekly 360 min $162.00,
  seventh-day 480 min $216.00.
- DT 180×3600/60 = **10,800¢ $108.00**. Split by rule: daily 60 min $36.00, seventh-day 120 min $72.00.
- **Total $1,368.00.** Half-time view: 63 h × $18 = $1,134 + 20 h × $9 + 3 h × $18 = $1,368 ✔.

Bill: REG 40 h × $26 = $1,040.00; OT 20 h × $39 = $780.00; DT 3 h × $52 = $156.00; total $1,976.00.

Cross-checks:
- FLSA alone would be 40×18 + 23×27 = $1,341.00. CA governs (+$27).
- Common error, Saturday treated as an ordinary day: Sat = 480 SE + 120 daily OT, so weekly OT = 840 min.
  That gives OT 22 h, DT 1 h, and $720 + $594 + $36 = $1,350.00, **underpaying $18.00**.
- Variant `ca-seven-days-across-two-workweeks`: the same 7 consecutive days but straddling a workweek
  boundary → **no** seventh-day premium (DLSE Manual 48.1.3.2).

### G2. Multi-rate regular rate (`multi-rate-regular-rate`)
Joliet IL. Week Mon 2026-10-12 to Sun 10-18. Forklift $20.00 at client A (bill $28.00); general labor
$17.00 at client B (bill $24.00).

| Day | Minutes | Job |
|---|---|---|
| Mon, Tue, Wed | 600 each | forklift, client A |
| Thu, Fri | 480 each | general labor, client B |

- Total 2760 min (46 h). Straight earnings = 1800×2000/60 + 960×1700/60 = 60,000 + 27,200 = **87,200¢**.
- RR = 87,200¢ / 46 h = **43,600/23 ¢/h** (≈ $18.9565…).
- OT = 360 min (IL/FLSA weekly), chronologically the last 6 h of Friday at general labor.
- Lines:
  - REG forklift: 1800 min × $20.00 = **$600.00** (client A).
  - REG general labor: 600 min × $17.00 = **$170.00** (client B).
  - OT general labor: 360 min × (1700 + ½·43,600/23 = 60,900/23 ¢/h) = 365,400/23 = 15,886.9565…¢ →
    **$158.87** (client B).
  - **Total $928.87.** Check: $872.00 + ½ × RR × 6 h = 87,200 + 130,800/23 (5,686.96) = 92,886.96 → 92,887 ✔.
- Wrong methods:
  - 1.5 × $17 for the OT hours without a § 778.419 agreement = $153.00, total $923.00, **underpays $5.87**.
  - RR rounded to $18.96 first: 6 × ($17 + $9.48) = $158.88, off by 1¢. Shows why RR is never rounded.
- Bill: A 30 h × $28 = $840.00; B REG 10 h × $24 = $240.00; B OT 6 h:
  multiplier 3/2 → $216.00 | straight → $144.00 | not billable → $0.00 |
  site-only (B's own hours 16 < 40) → billed as 6 h straight $144.00.
- Variant `multi-rate-with-night-differential`: Thu/Fri +$1.00/h differential (DIFF line 960 min = $16.00).
  - Straight earnings 88,800¢; RR = 44,400/23 ¢/h.
  - OT line = 6 h × (1700 + 22,200/23) = 367,800/23 = 15,991.30 → $159.91.
  - Total = 600 + 170 + 16 + 159.91 = **$945.91**. Check: 888.00 + 57.91 ✔.

### G3. Illinois § 42: 720-hour crossing mid-week (`il-s42-720h-crossing-midweek`)
Joliet IL, `dtlsaCovered: true`, worker W at client X, $17.00 pay, $24.00 bill.
- Prior worked minutes at client X in the rolling 12 months (all on or after 2024-04-01): **42,000** (700 h).
  The 600 h warning was raised in an earlier week.
- Week Mon 2026-10-12: Mon–Fri 480 min each, 07:00–15:00.
- Counter at end of each day: Mon 42,480 → Tue 42,960 → **Wed 2026-10-14: reaches 43,200 at 11:00** (240
  minutes into the shift). The 241st minute (11:00–11:01) is the first minute over 720 h.
  → Wed 15:00 43,440 → Thu 43,920 → Fri 44,400.
- Minutes worked after the trigger this week: 240 + 480 + 480 = **1,200** (20 h).
- Expected output (no comparator rate on file):
  - pay REG 2400 min × $17.00 = **$680.00**; bill REG 40 h × $24 = **$960.00**;
  - **Obligation** `il_dtlsa_s42_equal_pay` {worker W × client X, crossed 2026-10-14 11:00, 12-month window
    2025-10-15..2026-10-14, minutes 43,200 → 44,400, entry ids for Wed/Thu/Fri, due: comparator data from
    client and equal-pay rate before the next pay period begins (56 IAC 260.505(b))};
  - **warning** "20 h worked after crossing 720 h at client X are paid at the placement rate. The equal-pay
    rate and benefits (or cash equivalent) are not on file. A retro adjustment may be due";
  - **no blocker** this week.
  - 48-month counter far below 249,600, so no second obligation.
- Illustration once a human enters a comparator rate of $18.50 effective at the crossing (not part of this
  golden): 20 h × $17.00 + 20 h × $18.50 = **$710.00** (+$30.00 retro). The week becomes multi-rate for OT
  purposes. Any § 42(b) cash equivalent is a separate line; RR treatment needs counsel.

### G4. Client OT billing variants (`client-ot-billing-ca-dt-and-site-only`)
Extends the existing proposed golden (multiplier / straight / not billable) with:
- (a) the G1 week billed with a DT multiplier: $1,976.00;
- (b) the same week, straight-time billing: 63 h × $26 = $1,638.00;
- (c) not billable: REG $1,040.00, and OT/DT lines listed at $0.00;
- (d) G2 client B "site-only OT": $384.00 (16 h × $24). The agency absorbs the $56.87 premium.

Pay lines are identical in every variant.

### G5. Minimum-hours guarantee: IL sent and not utilized (`il-dtlsa-4h-not-utilized`)
Joliet IL, $17.00 pay. Mon–Thu 600 min each at client C (2400). Fri 2026-10-16: sent to client D, used
90 min (07:00–08:30), sent home. Flag confirmed by a human; not reassigned.
- Worked 2490 min; OT 90 min (Fri); RR = $17.00 (the guarantee shortfall is excluded, § 778.220).
- Lines:
  - REG 2400 × $17 = **$680.00** (C).
  - OT 90 min × $25.50 = **$38.25** (D).
  - MIN_GUARANTEE (240 − 90) = 150 min × $17.00 = **$42.50** (D; worked minutes 0).
  - **Total $760.75.**
- Alternative reading (credit the OT premium against the 4-hour amount: 4 × 17 = $68.00 − $38.25 = $29.75)
  → $748.00. Flagged; golden uses the conservative $760.75.
- Bill: per client policy, e.g. guarantee billable at $24 → 2.5 h × $24 = $60.00.
- Simple variant: Friday only, 90 min worked → REG $25.50 + MIN_GUARANTEE $42.50 = $68.00.
- CA variant `ca-reporting-time-pay`: scheduled 480, furnished 120 → due = clamp(240, 120, 240) = 240 min
  → reporting pay 120 min at RR.

### G6. Holiday (`ma-thanksgiving-holiday-policy`)
Worcester MA, $19.00 pay, $27.00 bill. Week Mon 2026-11-23 to Sun 11-29; Thanksgiving Thu **2026-11-26**.
Policy (data): worked multiplier 3/2; not worked 480 min at own rate; bill holiday worked 3/2; holiday not
worked not billed; stacking = additive.
- **Worker A** works Mon–Fri 480 each (incl. Thu), 40 h, no statutory OT.
  - REG 1920 min × $19 = **$608.00**; HOL 480 min × $28.50 = **$228.00**; total **$836.00**.
  - Bill: 32 h × $27 = $864.00 + 8 h × $40.50 = $324.00 → $1,188.00.
- **Worker B** eligible, off Thursday, works 4 × 480.
  - REG 1920 × $19 = **$608.00**; HOL_NOT_WORKED 480 min × $19 = **$152.00** (worked minutes 0, excluded
    from RR, not toward 40); total **$760.00**.
  - Bill $864.00.
- **Worker C** works Mon–Fri 540 each (45 h, 9 h on Thanksgiving). Statutory OT 5 h, RR $19.00.
  - Additive: straight 45 h $855.00 + OT premium 5 h × $9.50 = $47.50 + holiday premium 9 h × $9.50 =
    $85.50 → **$988.00**.
  - Credit (§ 207(h)(2), federal): $85.50 ≥ $47.50 due → **$940.50** (= 36 h × $19 + 9 h × $28.50).
  - If the multiplier were 5/4: premium 9 h × $4.75 = $42.75 is **included** in RR → RR = $897.75 / 45 =
    $19.95; OT premium 5 × $9.975 = 49.875 → $49.88; total **$947.63**, no crediting. A Bullhorn-style
    "remove holiday hours from the week" would pay $897.75, underpaying $49.88.

### G7. Minimum-wage true-up (`ca-minimum-wage-true-up-new-year`)
Ontario CA, `workweekStartsOn: 1`, week Mon 2025-12-29 to Sun 2026-01-04. Rate card $16.60 (≥ $16.50 for
2025, < $16.90 for 2026). Mon–Fri 480 min each.
- Floors per shift: Dec 29–31 $16.50 (OK); Jan 1–2 $16.90 (short 30¢/h).
- Lines: REG 2400 × $16.60 = **$664.00**; MW_TRUEUP 960 min × 30¢/h = **$4.80**; total **$668.80**.
  Warning: "rate card below the minimum wage from 2026-01-01 (Cal. Lab. Code § 1182.12; $16.90)". Blocker
  replaced by true-up.
- FLSA weekly check $668.80 / 40 = $16.72 ≥ $7.25 ✔. January 1 carries no legal premium (CA).
- Flagged variant with OT, Fri = 600 min:
  - RR = (69,720 + 540)¢ / 42 h ≈ $16.7286, which is below the 2026 floor.
  - So the premium base for the Friday OT = max(RR, $16.90) = $16.90.
  - Premium 120 min × $8.45 = **$16.90**, not $16.73. Tests the `RR_base(date)` rule.
- Chicago variant (once local MW is modeled): week Mon 2026-06-29, $16.60 rate, Jul 1–3 floor $17.05 →
  24 h × 45¢ = $10.80.

### G8 (extra, recommended). CA meal/rest premium at the weighted regular rate (`ca-meal-rest-premium-ferra`)
Ontario CA. Mon–Wed 480 min at $18.00, Thu–Fri 480 min at $20.00 → 40 h, straight $752.00, RR = $18.80.
Confirmed on Thu: missed meal and missed rest.
- MEAL_PREMIUM 60 × $18.80 = **$18.80**; REST_PREMIUM **$18.80**; total **$789.60**.
- A second missed meal the same day adds nothing.
- Wrong: using Thursday's job rate ($20) → $40.00; using base $18 → $36.00.

### G9 (extra). CA flat-sum bonus (Alvarado) (`ca-flat-sum-bonus`)
G1 week plus a $50.00 attendance bonus (flat sum, nondiscretionary).
- CA: bonus rate = $50 / 40 h = $1.25; bonus OT = 20 × 1.5 × 1.25 + 3 × 2 × 1.25 = $37.50 + $7.50 =
  **$45.00**.
- Federal would be $50/63 h × 0.5 × 23 h = $9.13. CA governs.

---------------------------------------------------------------------------------------------------

## 9. Could not verify from a primary source / open questions for the owner

1. **§ 42 litigation after 2025-05-22.** Could not check the N.D. Ill. or 7th Cir. docket (rate-limited).
   IDOL's FAQ treats § 42(a),(b) as in force. Owner/counsel should confirm.
2. **§ 42 counting details:** rolling vs fixed 12 months, whether the duty ends after the window drops,
   whether other agencies' hours count, and whether the cash-in-lieu of benefits enters the regular rate.
3. **CA crediting** of ≥ 1.5× holiday premiums against daily/weekly OT, and whether CA allows a
   § 778.419-type method. Neither verified; slice (c) proposes additive and weighted-average only.
4. **IL 4-hour rule:** whether OT earned on worked minutes counts toward the 4 hours. **MA reporting pay:**
   3 h total at MW vs worked pay + shortfall.
5. **CA split-shift premium offset method** (not verified). CA workday start other than midnight (blocked).
6. **Cook County:** current municipal opt-out list (none published by the county). Decide default apply vs
   hold.
7. Primary-text access gaps:
   - Lab. Code text came via gov-search extract (leginfo blocked).
   - Some Part 778 sections came from the 2024 annual CFR edition (eCFR blocked).
   - Illinois text came via gov-search extracts (ilga.gov TLS).
   - Chicago 2026 MW rules came via gov-search extract (PDF 403).
   - CA 2027 rate $17.40 was not re-verified (from earlier research).
8. The UC Berkeley local-MW inventory is secondary (DIR links it). Ontario CA has no ordinance per that list
   only. Check the city if the demo ever claims "verified".
9. Rippling holiday/guarantee docs: none found. Gusto: API docs only.
