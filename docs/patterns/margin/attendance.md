# Pattern: Attendance (`/margin/attendance`)

Status: adopted — slice u (2026-10-17, SPEC §27 item 7)
Reference product and screen: Deputy — Attendance & absence report (filters including the lateness
tolerance, default 15 minutes; summary figures with count and percentage; per-site and per-worker
tables; no-show rate = no-shows ÷ scheduled shifts × 100; a detail table showing only problem shifts);
Instawork — fill rate (filled ÷ requested)
Source URL: https://help.deputy.com/hc/en-au/articles/4416427469327-Attendance-and-absence-report
Source URL: https://www.instawork.com/business/fill-rate
Researched: 2026-10-17 (`docs/research/scheduling-slice-u.md` §7). Confidence: high (Deputy); medium
(Instawork's definition is from its marketing page).

## Hierarchy
1. **View header and tabs** as `margin.md`, with an Attendance tab.
2. **Figures** (`_components/key-figures.md`, Deputy's summary): Scheduled shifts · Fill rate (filled
   of requested, %) · No-shows (count and % of scheduled) · Late (count and %: the first time in later
   than the start plus the tolerance).
3. **By client** (Deputy's per-site table): client, shifts requested, filled, fill rate, past scheduled
   shifts, no-shows, no-show rate, late.
4. **Problem shifts** (Deputy's detail table, issues only): date, client, worker, job order, issue
   (no-show, late by N minutes, still open).

## Interactions
- The range is the last four weeks to the end of this week; nothing else to change.

## States
- **No shifts in range:** says so. **Not for this role:** as `margin.md`.
- **Loading / failure:** as `margin.md`.

Deviations allowed: none
