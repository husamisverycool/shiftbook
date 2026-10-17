# Pattern: Worker app Home (`/w`)

Status: adopted — slice t (2026-10-17)
Reference product and screen: Square Team app Home (clock in first; "your next shift"); Gusto mobile
app (onboarding to-dos first; the current pay period card)
Source URL: https://apps.apple.com/us/app/square-team/id1435368303
Source URL: https://support.gusto.com/article/207607681100000/gusto-mobile-app-employee-experience
Researched: 2026-10-17 (`docs/research/workers-app-slice-t.md` §2, §4). Confidence: medium.

## Hierarchy
1. Greeting with the worker's first name.
2. **Finish onboarding** card while steps remain: how many of how many are done, **Continue**.
   Once onboarding is done, a **Policies to confirm** card (decision 0043; Gusto's onboarding to-do
   first) while a required policy changed after the worker confirmed it, or is new: how many, and
   **Review** (the onboarding Policies step).
3. **Clock in** card (when a current assignment's client allows clocking in): the assignment
   (position at client), **Clock in**; while clocked in, since when and **Clock out**.
4. **This week** card: hours so far and the week's dates; **See hours**.
5. **Next shift** (Square Team's "your next shift"): the next confirmed or awaiting shift — day and
   date, time, position at client — and, when shifts or offers wait for an answer, how many;
   **See shifts**. No upcoming shift and nothing waiting: nothing.
6. **Earned pay you can request** (slice w; only when the agency offers it): the amount available
   from approved hours not yet paid, a plain line that no money moves in Granite and the agency's
   payroll partner would pay it, and **Request** (an amount, then a confirmation).
7. **Latest pay**: the last stub's gross and its week; **See pay**.

## Interactions
- Each card's action goes to its tab; Clock in/out acts in place and the card changes at once.

## States
- No assignment allows clocking in: no Clock in card. Location asked only when the client requires
  it; refused location → no clock-in, with a line saying the client asks for location.
- No pay yet: "Your pay stubs appear here after your first paid week."

Deviations allowed: none
