# Pattern: Compliance (`/compliance`)

Status: adopted — slice (j) plan (2026-10-16, under the owner's "just keep going")
Reference product and screen: Vanta — Tests page (subject areas in a sidebar so each person can
focus on their list; the most urgent items first; search by name; filter by status and by framework;
an owner on each item); Linear — display options (group the list by status)
Source URL: https://help.vanta.com/en/articles/11345374-the-tests-page
Source URL: https://help.vanta.com/hc/en-us/articles/6993220120980-Assignment-and-Ownership-for-Tests-Policies-and-Documents
Source URL: https://linear.app/docs/display-options
Researched: 2026-10-16 (`docs/research/compliance-slice-j.md` §7). Confidence: high for the
hierarchy (sidebar of areas, urgency order, search, filters, owners); low for column layout and
labels (the Vanta article does not describe them; Shiftbook's columns follow its own data).

## Purpose in Shiftbook
Every compliance duty the agency has, most urgent first (SPEC §16): registrations and renewals,
client proof pages, Illinois equal-pay crossings, New Jersey and Massachusetts notices, workers' comp,
Form I-9 deadlines, ACA offers.

## Hierarchy
1. **View header:** H1 "Compliance"; at the right **Compliance settings** (Vanta: settings reached
   from the page).
2. **Tabs:** List · Calendar · Counters · Workers' comp · ACA, keeping the filters in the address.
3. **Areas** at the left (Vanta's sidebar of subject areas), each with its count of open items:
   All · Registrations · Clients · Placements · Workers · Equal pay · Workers' comp · ACA.
4. **Toolbar:** search by name (Vanta: search by test name); **Status** filter (Overdue, Due soon,
   Upcoming, Done, Not applicable; open ones by default); **State** filter (Illinois,
   Massachusetts, New Jersey, Federal — Vanta's framework filter); **Owner** filter (anyone, me,
   no owner).
5. **List,** grouped by status in urgency order — Overdue, Due soon, Upcoming, then Done and Not
   applicable when the filter shows them (Linear group by status; Vanta most urgent first) — and by
   due date within a group. A row: the duty and its subject (for example "Illinois registration
   renewal — Cedar Row Staffing (demo)"), the state, the due date (with "in 5 days" / "3 days late"),
   the owner (a picker in the row; Vanta assigns owners from the list), the status badge. The row
   opens the obligation.

## Interactions
- Areas, search and filters change the list at once and stay in the address.
- The owner picker saves when chosen; only the Owner and the item's role may change it.
- Keyboard: G then O opens Compliance (app frame); `/` puts the cursor in the search box (Google
  Calendar's search key, as on the calendar tab); ↑/↓ and Enter move through and open rows.

## States
- **Nothing open:** says no compliance duty is open, with the next upcoming date if any.
- **No match:** says nothing matches the search and filters, with a button to clear them.
- **Read only** (the accountant): no owner picker; the owner's name is shown.

## Never copy
Vanta's or Linear's wording, icons, colors or logos.

## Look (decision 0029, from the products' own screenshots)
The list grouped as Linear's list view shows groups (https://linear.app/docs/filters): full-width tinted bands with the group's name and count, rows edge to edge under them with hairline dividers, no box; the views (List, Calendar, Counters, Workers' comp, ACA) as underline tabs under the title; each status a tinted badge.

Deviations allowed: none
