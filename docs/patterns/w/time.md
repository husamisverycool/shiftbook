# Pattern: Worker app Time (`/w/time`)

Status: adopted — slice t (2026-10-17)
Reference product and screen: Gusto mobile app Time tab (Clock in / Clock out, the Current pay period
card, hours sent to the manager to review and approve); Square Team timecards (regular, overtime,
double time, total)
Source URL: https://support.gusto.com/article/207607681100000/gusto-mobile-app-employee-experience
Source URL: https://apps.apple.com/us/app/square-team/id1435368303
Researched: 2026-10-17. Confidence: high.

## Hierarchy
1. Title **Time**; the clock-in card as on Home.
2. Weeks, newest first, each a section: the week's dates, its total hours; then one row per day:
   date, in–out times (or the hours when read as a daily total), the hours, and a status word —
   **Waiting for review**, **Approved**, **Paid**, **Questioned** (disputed by the client).
3. Under the list: hours go to the agency to check before payday.

## States
- No hours yet: one line. A clock-in in progress shows on top.

Deviations allowed: none
