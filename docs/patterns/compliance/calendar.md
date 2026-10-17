# Pattern: Compliance calendar (`/compliance/calendar`)

Status: adopted — slice (j) plan (2026-10-16, under the owner's "just keep going")
Reference product and screen: Google Calendar — views and keyboard shortcuts (Week view 2 or w,
Month view 3 or m, Agenda view 5 or a; t moves to the current day; j or n to the next date range;
g goes to a date); Outlook on the web — calendar shortcuts (Shift+Left arrow "Go to the previous time
period")
Source URL: https://support.google.com/calendar/answer/37034?hl=en
Source URL: https://support.microsoft.com/en-us/office/keyboard-shortcuts-for-outlook-3cdeb221-7ae5-4c1d-8c1d-9e63216c1efd
Researched: 2026-10-16 (`docs/research/compliance-slice-j.md` §7). Confidence: high for the views
and keys (Google's help page lists no key for the previous range; Outlook's does); low for the grid's
look (not described in words by either).

## Purpose in Granite
The same duties as the list, on the dates they are due (SPEC §16: "List and calendar views").

## Hierarchy
1. **View header and tabs** as `compliance.md`; the areas, search and filters apply here too.
2. **Toolbar:** **Today**, previous and next buttons, the range shown ("October 2026", "Oct 12 –
   18, 2026"), a date to go to, and the view: Month (default) · Week · Agenda.
3. **Month:** a grid of the month's weeks (the agency's workweek start first); each day lists its
   duties as short chips with a status mark; a day with more than three shows "+N more" which opens
   the day's list.
4. **Week:** seven columns, each day's duties listed in full (duties are all-day).
5. **Agenda:** the duties from the range's first day on, grouped by day, as rows like the list.
6. A chip or row opens the obligation.

## Interactions
- Keys (not while typing): m or 3 month, w or 2 week, a or 5 agenda; t today; j or n next range;
  Shift+Left previous range; g puts the cursor in the date to go to.
- The view and the date are in the address.

## States
- **Nothing in range:** the grid is shown empty with a line saying nothing is due in this range and
  when the next duty is.

## Never copy
Google's or Microsoft's wording, icons, colors or logos.

Deviations allowed: none
