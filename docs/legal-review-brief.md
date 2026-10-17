# Granite pay rules and compliance: a brief for employment counsel

Prepared 2026-10-17 from rules version `2026.10-c8`. File paths in parentheses are for a developer.
Examples are invented.

## 1. What Granite does

Granite turns timesheets into **gross pay lines** per worker, workweek, placement and earning type
(packages/rules/src/engine.ts). The types are regular, overtime, double time, minimum-wage top-up,
reporting pay, Illinois day-labor minimum, holiday, California meal and rest premiums, and bonus.
Client bill lines are made too, and never change pay.

It does **not** compute or withhold taxes, take deductions, work out net pay, issue pay statements,
pay anyone or file returns. SPEC.md §1 and §22 exclude "payroll processing or tax filing", and no
code computes withholding. Granite writes an import file, and the agency's payroll system (Gusto,
QuickBooks, ADP and others) does the rest (src/exports/).

**Rounding.** Money is whole cents and time whole minutes; pay math uses no decimals
(packages/rules/src/int.ts). The regular rate is an exact fraction, never rounded. A line pays
`minutes × rate ÷ 60`, rounded once to the cent, half a cent up. Shifts at one placement and rate in
a week share a line.

There is one caveat. Hours-based files (Gusto, for one) round hours up to the hundredth, and the
payroll system applies its own stored rate. Its gross can therefore differ by a few cents, and the
file notes each difference (src/exports/gusto-hours.ts).

**Explanations.** Every line states its inputs, rule, citation and arithmetic. For example:

> Overtime: 6h 00m (360 min) × $26.4782…/h ($17.00 + 0.5 × regular rate $18.9565…/h) = 15886.9565…¢
> → rounded half-up once → $158.87 … Regular rate: $872.00 earned at straight time ÷ 46h 00m worked
> = $18.9565…/h, used unrounded (29 C.F.R. § 778.115; § 778.111(a)).

**When unsure, it holds.** Faced with an unknown state, a missing rate row or a rule changing
mid-week, the engine holds that worker's week with a message instead of guessing. Every rate,
threshold and multiplier is a dated database row (drizzle/*.sql).

## 2. Rules as built (packages/rules/src/rules/)

### 2.1 Weekly overtime (weekly-overtime.ts)
- **Citation:** 29 U.S.C. § 207(a)(1); 29 C.F.R. §§ 778.103–.105; 820 ILCS 105/4a(1); M.G.L. c. 151 § 1A; Cal. Lab. Code § 510(a).
- **Does:**
  - The workweek is a fixed seven days starting on the agency's chosen weekday, and pay periods must be whole workweeks.
  - Hours at all clients are added together, because the agency is the employer.
  - Minutes past the threshold are overtime, in the order worked, charged to the client whose shift they fall in.
  - The most protective of the federal and state rules is used once.
- **Data:** 40 h at 1.5× for US, IL, MA and CA, from 2000-01-01 (drizzle/0002, 0004).
- **Admits:** A row changing mid-week holds the week. Without start times, the order of work is assumed and flagged.

### 2.2 California daily, double-time and seventh-day overtime (california-overtime.ts)
- **Citation:** Cal. Lab. Code § 510(a); IWC wage orders § 3(A); DLSE Manual 48.1.3.2; *Mendoza v. Nordstrom* (2017) 2 Cal.5th 1074; DLSE Op. Ltr. 2000.01.19.
- **Does:**
  - Hours over 8 a day are paid at 1.5×, and over 12 at 2×.
  - The seventh day counts only when all seven days of one fixed workweek were worked: its first 8 hours at 1.5×, the rest at 2×.
  - Weekly overtime counts only hours not already paid a premium.
  - The workday runs midnight to midnight; a person splits shifts that cross it.
  - The federal result is computed too, and the larger is paid.
- **Data:** 480 min at 1.5×; 720 min at 2×; seventh day at 1.5×, over 480 min at 2×.
- **Admits:** Weeks that mix California with another state are held.

### 2.3 Regular rate (regular-rate.ts)
- **Citation:** 29 C.F.R. §§ 778.107, .109, .110(a), .111(a), .115; 56 Ill. Adm. Code 210.420, 210.430; 454 CMR 27.03(3); DLSE Manual 49.2.5.
- **Does:**
  - The rate is a weighted average. Straight-time earnings (never below that day's minimum wage), nondiscretionary bonuses and holiday premiums under 1.5× are added and divided by all hours.
  - Each overtime hour pays its own rate plus (multiplier − 1) × that average, never on less than the day's minimum wage.
  - The rate-of-the-job method (§ 778.419) is not offered.
- **Admits:** The code says Massachusetts computes it the same way. The research notes 454 CMR 27.02 excludes production bonuses, so the MA rate can be lower. The federal rate used is never lower.

### 2.4 Minimum wage floor (minimum-wage.ts, places.ts)
- **Citation:** 29 U.S.C. §§ 206(a)(1), 218(a); 820 ILCS 105/4; M.G.L. c. 151 § 1; Cal. Lab. Code § 1182.12; *Armenta v. Osmose* (2005) 135 Cal.App.4th 314; Chicago Mun. Code ch. 6-105; Cook County Code § 42-13.
- **Does:**
  - The floor is the highest federal, state, county or city rate that day. Places are matched by Census code, never by name.
  - A lower pay rate gets a top-up line for that shift's minutes, plus a warning. A top-up under half a cent rounds to nothing and is dropped.
  - A missing federal or state rate holds the week, as does a listed locality with no rates on file.
- **Data (drizzle/0004, 0015):**

| Where | Rates (each ends when the next starts) |
|---|---|
| Federal | $7.25 from 2009-07-24 |
| Illinois | $14.00 from 2024-01-01; $15.00 from 2025-01-01 |
| Chicago | $16.60 from 2025-07-01; $17.05 from 2026-07-01 |
| Cook County | $15.00 from 2025-07-01; $15.40 from 2026-07-01 |
| Massachusetts | $14.25 from 2022-01-01; $15.00 from 2023-01-01 |
| California | $16.50 from 2025-01-01; $16.90 from 2026-01-01; $17.40 from 2027-01-01 |

- **Admits:** Chicago's coverage thresholds are assumed met. Cook County applies everywhere outside Chicago, since no town opt-out is on file. SPEC §11 calls below-minimum pay a blocker; the code tops it up instead (drizzle/0015).

### 2.5 Bonuses (bonus.ts)
- **Citation:** 29 C.F.R. §§ 778.208–.211; *Alvarado v. Dart Container* (2018) 4 Cal.5th 542; DLSE Manual 49.2.4.2.
- **Does:** A person classifies each bonus and assigns it to one week. A nondiscretionary bonus goes into the regular rate. A California flat sum is divided by the non-overtime hours, and its overtime is paid at the full 1.5× or 2×; elsewhere it counts as nondiscretionary.
- **Admits:** A bonus earned over several weeks (§ 778.209) is not handled.

### 2.6 Holiday pay (holiday-pay.ts)
- **Citation:** 29 U.S.C. § 207(e)(2), (e)(6); 29 C.F.R. §§ 778.203, .218, .219; DLSE Manual 49.1.2.4.
- **Does:**
  - Holiday pay comes from the agency's or a client's policy, since no law found requires it.
  - Holiday work earns straight time plus (multiplier − 1) × rate. A premium of 1.5× or more stays out of the regular rate; a smaller one goes in.
  - Premiums are paid on top of overtime, never credited against it (owner decision C4, .claude/plans/slice-c-pay-rules.md).
  - A confirmed holiday not worked is paid but is not hours worked.
  - The worker gets the better of the client's and the agency's policy.
- **Data:** the 1.5× cut-off, from 2000-01-01, also used for California (drizzle/0021).

### 2.7 California meal and rest premiums (meal-rest-premium.ts)
- **Citation:** Cal. Lab. Code § 226.7(c); *Ferra v. Loews Hollywood Hotel* (2021) 11 Cal.5th 858; *UPS v. Superior Court* (2011) 196 Cal.App.4th 57; *Murphy v. Kenneth Cole* (2007) 40 Cal.4th 1094.
- **Does:** After a person confirms a missed period, it pays one hour at the week's regular rate, at most one meal and one rest premium per workday. Not hours worked; kept out of the regular rate.
- **Data:** 60 min, at most 1 per workday. Rows run through 2026-12-31 and from 2027-01-01, the statute's successor version (drizzle/0016).

### 2.8 California reporting-time pay (ca-reporting-time.ts)
- **Citation:** IWC wage orders § 5(A) (e.g. 8 CCR § 11070); DLSE Manual 49.1.2.4.
- **Does:** On a confirmed short day with under half the schedule worked, the day is brought up to half the schedule (rounded up), at least 2 and at most 4 hours, at the regular rate. Not hours worked; kept out of the regular rate.
- **Data:** half the schedule; minimum 120 min, maximum 240 min.
- **Admits:** Neither § 5(B) (a second report in one day) nor § 5(C) (its exceptions) is modeled.

### 2.9 Massachusetts reporting pay (ma-reporting-pay.ts)
- **Citation:** 454 CMR 27.04(1).
- **Does:** On a confirmed short day for a worker scheduled 3 hours or more, the day is brought up to 3 hours at its own rate (never below minimum wage), with no credit for overtime earned (decision C5).
- **Data:** 180 min due when at least 180 were scheduled.
- **Admits:** The research found the rule ambiguous; the code takes the reading that pays more.

### 2.10 Illinois day-labor minimum (il-day-labor-minimum.ts)
- **Citation:** 820 ILCS 175/30(g); 56 Ill. Adm. Code 260.450(b) (amended effective 2026-04-28).
- **Does:** For day and temporary labor (not clerical or professional, § 5), a worker used less than 4 hours at the client is paid the shortfall at the agreed rate; if placed elsewhere that shift, the day is brought up to 2 hours. Not hours worked; no credit for overtime earned.
- **Data:** 240 min, or 120 if reassigned.
- **Admits:** The row runs from 2000-01-01, but the broader rule text it applies dates from 2026-04-28.

### 2.11 Illinois § 42 equal pay: the hours counter (il-equal-pay.ts)
- **Citation:** 820 ILCS 175/42(a), (c) (P.A. 103-1030); 56 Ill. Adm. Code 260.505(b); IDOL bulletin of 2025-06-05.
- **Does:** It counts minutes worked on Illinois day and temporary labor per worker and client (all sites) over a rolling 12 months, with pre-Granite opening balances counted on their last day. Over 720 hours records a duty, and over 4,160 in 48 months a second; neither resets. It warns at 600 hours (Granite's choice, not law).
- **Data:** counts work from 2024-04-01; triggers over 43,200 min in 12 months and over 249,600 in 48; in force from 2024-08-09 (drizzle/0019).
- **Admits:** Only this agency's hours are known. Guarantee, holiday and premium time are not counted.

### 2.12 Illinois § 42 equal pay: the rate (il-equal-pay-rate.ts; docs/decisions/0023)
- **Citation:** 820 ILCS 175/42(a)(1)–(2), (b), (c); 56 Ill. Adm. Code 260.445, 260.505(b).
- **Does:** The Owner enters dated rows per worker and client: a straight-time rate (comparator, closest seniority, survey median or 75th percentile) plus the hourly cash value of benefits in lieu. From that date covered shifts pay at least the sum, and the benefits cash counts in the regular rate. After a crossing, later periods hold until a rate or a recorded request is on file; with only a request, the rate card is paid and a correction trues it up.
- **Admits:** A person applies the § 43 collective-bargaining exception by marking the duty "not applicable".

## 3. Compliance duties as built

Duties come from dated `compliance_rules` rows (drizzle/0029, 0030, 0033) via
src/server/compliance/generate.ts. Duties over 365 days past are not created, but none closes for
being old.

- **3.1 Registration renewals.** Illinois (820 ILCS 175/45; 56 Ill. Adm. Code 260.320) is due 60 days before expiry. Massachusetts (454 CMR 24.06(2)) is due 30 days before. New Jersey (N.J.S.A. 34:8D-8) is due 30 days before; no lead time is stated, so this is Granite's safe reading.
- **3.2 Illinois proof of registration** (820 ILCS 175/85(a); 260.510). For each client with Illinois day or temporary labor, proof is due before each contract and on each March 1 and September 1. A contract is new after a 183-day gap, which is Granite's own number.
- **3.3 Illinois equal pay.** See 2.11–2.12. The duty is due at the end of the crossing's pay period.
- **3.4 Massachusetts job order** (M.G.L. c. 149 § 159C(b); 454 CMR 24.08). One is due per placement by the end of its first pay period. The code assumes weekly pay periods (src/server/compliance/sync.ts).
- **3.5 New Jersey notice in the worker's language** (N.J.S.A. 34:8D-3(a); N.J.A.C. 12:72-3.1). It applies to New Jersey placements in the designated SOC groups (33, 35, 37, 39, 47, 49, 51, 53) when the worker's language is not English, and is due on the start date.
- **3.6 Form I-9** (8 C.F.R. § 274a.2(b)(1); USCIS M-274). Dates only, per hire. Section 1 is due by the first day; Section 2 three business days later (holidays counted), or the first day for a shorter job; reverification by the work-authorization end date.
- **3.7 Workers' comp.** Renewal is due the day the policy ends (820 ILCS 175/45). The audit is due on the date entered. The audit packet (wc-packet.ts) sets the overtime premium apart (NCRB Basic Manual Rule 2-C-2-a), computed as (m − 1)/m of each overtime line.
- **3.8 ACA offer** (26 C.F.R. §§ 54.4980H-1(a), -3(c)(4)(i), -3(d); aca.ts). The Owner sets the measurement (3–12 months), administrative (90 days at most) and stability (at least 6 months) periods. A worker is full-time when `minutes × 7 ≥ 1,800 × days`, counting paid work plus confirmed holidays not worked. Thirteen weeks without hours is a break; a period with days missing is never decided. Coverage is due the day before the stability period starts.
- **3.9 Illinois hours counters** (counters.ts). These are 12- and 48-month totals per worker and client, including opening balances. The Owner removes one only with a recorded reason.

## 4. Questions for counsel

1. Is one fixed agency-wide workweek, adding hours at all clients, right? (2.1)
2. California: seventh day only when all seven days of one fixed workweek were worked; midnight-to-midnight workday. Right? (2.2)
3. For weeks mixing California with another state (held today), how should California's 40 hours treat out-of-state hours? (2.2)
4. Is the weighted average correct in all three states, with no rate-of-the-job option? (2.3)
5. Is a per-shift top-up acceptable in place of holding the week? Is dropping top-ups under half a cent acceptable? (2.4)
6. Should Chicago's rate apply at every Chicago site, and Cook County's everywhere outside Chicago absent an opt-out on file? (2.4)
7. Should holiday premiums of 1.5× or more stay out of the regular rate (California included) and never offset overtime? Is the better of two policies the right default? (2.6)
8. Is a person's classification of each bonus enough, and is a flat sum outside California nondiscretionary? (2.5)
9. Short-day pay never enters the regular rate, however often paid. Is that right, given that 29 C.F.R. § 778.220 excludes it only when "infrequent and sporadic"? (2.8–2.10)
10. Is the shortfall at the day's own rate the right reading of 454 CMR 27.04(1)? (2.9)
11. Should earned overtime count toward the Illinois 4 hours? Should the amended 260.450(b) apply before 2026-04-28? (2.10)
12. Is a rolling, never-resetting § 42 count of this agency's hours only, with opening balances on their last day, right? Is § 42 still in force (filings after 2025-05-22 unchecked)? (2.11)
13. Should § 42(b) cash in lieu of benefits enter the regular rate? (2.12)
14. Is it defensible to pay the rate card once a request is recorded, then true up? (2.12)
15. The workers' comp premium is exact only in single-rate weeks; in the section 1 example the true premium is $56.87, but the packet would show $52.96. Will carriers accept that? (3.7)
16. Should every Massachusetts placement get a job order? There is no professional or clerical exemption and no same-day deadline for daily pay. (3.4)
17. Are Granite's own numbers acceptable: holidays as I-9 business days, the 183-day contract gap, the 365-day look-back? (3.2, 3.6)
18. Is paid work plus confirmed holidays a complete count of ACA hours of service? (3.8)

## 5. Not covered

- **Other states.** Only federal, California, Illinois and Massachusetts pay rules exist. Any other worksite, New Jersey included, holds the week.
- **California localities.** Worksites in 38 cities and 2 counties with their own minimum wage are held (drizzle/0017).
- **Other California rules.** Alternative workweeks, split-shift premiums, industry minimum wages, non-midnight workdays.
- **Prevailing wage.** Job orders carry a flag that no pay code reads; the research recommended holding such weeks.
- **Other pay.** Shift differentials, multi-week bonuses, contractual minimum-hours guarantees.
- **Paid leave.** Neither code nor SPEC addresses paid sick or other leave.
- **Payroll processing.** Taxes, deductions, net pay, pay statements, payday timing and final pay belong to the payroll system (SPEC §22).
- **Not tracked.** The Illinois § 10 employment notice, Illinois yearly safety training, New Jersey day-one equal pay (34:8D-7(b)), record retention.
