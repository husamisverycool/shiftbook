# Pattern: A worker's shifts (`/shifts-preview`, demo; the worker app's Shifts screen)

Status: adopted — slice u (2026-10-17, SPEC §27 items 6–7). Mounted at `/shifts-preview` in the demo
until the worker app (slice t) takes it as its Shifts screen.
Reference product and screen: Instawork — My Shifts (Upcoming / Past / Cancelled; confirm; cancel with
a required reason); Deputy — Upcoming shifts (a count needing confirmation; confirm; offers)
Source URL: https://help.instawork.com/en/articles/5765313-how-do-i-confirm-my-shift
Source URL: https://help.instawork.com/en/articles/2410766-how-do-i-cancel-a-shift
Source URL: https://help.deputy.com/hc/en-au/articles/360000985936-Shift-confirmation
Researched: 2026-10-17 (`docs/research/scheduling-slice-u.md` §6). Confidence: high.

## Hierarchy
1. A narrow mobile column. (Demo only: which demo worker is looking, as a select.)
2. Three segments: **Upcoming** (with the count needing an answer), **Past**, **Cancelled** (Instawork).
3. **Offered to you** first: open shifts offered to this worker — day and date, time, job order,
   worksite and city — with Accept and Decline (Deputy offers).
4. Each shift as a row: the day and date, the time, the job order and worksite; its state in words
   (waiting for your answer, confirmed); Confirm, and Can't make it (a reason required; Instawork).

## Interactions
- Confirm and Accept take effect at once. Can't make it opens a short form for the reason; the shift
  returns to the agency as open with a warning (Deputy).

## States
- **Nothing in a segment:** one muted line.
- **Loading:** the page outline (`_components/loading.md`).

Deviations allowed: none
