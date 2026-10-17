# Pattern: Holidays (`/settings/holidays`)

Status: adopted — slice G2 (2026-10-17)
Reference product and screen: Gusto — holiday pay policy (one policy for the company: the holidays it
covers, paid or not; a time-off policy type beside sick and vacation); Bullhorn — holiday rules on a
rate card or client (a client's own rule wins on its placements); Linear — settings layout
(`_components/settings.md`)
Source URL: https://support.gusto.com/article/999926221000000/Time-off-overview
Source URL: https://docs.gusto.com/embedded-payroll/v2024-03-01/docs/create-a-holiday-pay-policy
Source URL: https://support.gusto.com/article/999756591000000/Manage-time-off-policies
Source URL: https://linear.app/docs/account-preferences
Researched: 2026-10-17 (Gusto's help center and embedded payroll docs). Confidence: medium (Gusto's
own holiday article was not reachable; its embedded docs and time-off overview were).

## Purpose in Granite
The agency's holiday policies (agency data, not law: no state Granite covers requires holiday pay):
which days are holidays, what hours worked on them pay and bill (a multiple of the rate), and how
many hours a holiday not worked pays when a person confirms the worker is eligible. The agency's
policy applies to every client; a client's own policy wins on that client's work (the engine never
lets it lower the agency's for the worker — it picks the client's policy where one exists).

## Hierarchy
Laid out as Linear's settings (`_components/settings.md`):
1. **Page header:** "Settings" above, H1 "Holidays", one muted line on what a policy does.
2. **Section "Policies"** with **Add policy** at the heading's right (Owner only): each policy a row in
   a panel — its name over "Agency default" or the client's name and the number of days, the worked
   multiple and the hours paid for a holiday not worked at the right, a "…" menu with **Edit** and
   **Delete**. An empty panel is one muted row.
3. **The policy dialog** (Gusto's policy form): name; applies to (the agency, or one client); the
   holiday dates (one per line, or added with a date field); pay for hours worked (× the pay rate,
   1 to 3); hours paid for a holiday not worked (0 to 12); bill hours worked at (× the bill rate, or
   not billed as a premium); bill a holiday not worked (yes/no).

## Interactions
- Save checks the dates, the multiples and that no other policy for the same client (or the agency)
  already holds one of the dates — the engine would not know which to use.
- Editing a saved policy asks for a "Reason for the change" (a text box at the foot of the dialog;
  Save refuses without one). Delete asks for confirmation with the same reason box; runs computed
  later no longer pay it. Adding, editing and deleting are audited with the policy's full before
  and after, and the reason.
- A change that would alter what a date pays (adding, removing, or changing the terms of a date)
  is refused when that date is in a pay period whose files exist: the dialog stays open with the
  message that the date is in a paid period and a correction starts there first. Dates outside paid
  periods can still be added.
- People other than the Owner see the policies, without the controls.

## States
- Loading: the page's outline in the settings shape (`_components/loading.md`).
- A failure: the frame stays; "Try again" (`_components/error.md`).
- A refused save or delete: the dialog stays open with the reason under the field it concerns (or,
  for a locked date, above the actions).

Deviations allowed: none
