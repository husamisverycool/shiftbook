# Pattern: Workers (`/workers`)

Status: adopted — slice (k) plan, step 2 (2026-10-16, under the owner's "just keep going")
Reference product and screen: Toast Payroll — Team page (an always-visible "Search employees" bar;
"+Add employee"; a Filters control whose Status defaults to Active, with the others included by
checkbox; people hidden by the filter are still found by search; the Name column; a row opens the
person's profile) and its "employees missing from the Team page" help (symptom → cause → fix)
Source URL: https://intercom.help/toast-central/en/articles/14726296-toast-payroll-team-page
Source URL: https://intercom.help/toast-central/en/articles/15695452-toast-payroll-employees-missing-from-team-page
Researched: 2026-10-16 (`docs/research/roster-audit-language-slice-k.md` §1a). Confidence: high for
search, the add button, the default Active filter and the status checkboxes; the column widths and
the page size are not documented.

## Purpose in Shiftbook
The agency's roster (SPEC §17): every temporary worker, found by name or payroll number, opened to
their profile. No SSN column (California's and New York's guidance: no SSNs on rosters).

## Hierarchy
1. **Page header:** H1 "Workers"; on the right **Add worker** (primary; the Owner and Coordinators).
2. **Search** (Toast "Search employees"): name or a payroll number; it finds ended workers too.
3. **Filters** (Toast Filters → Status): Active shown by default; a checkbox **Include ended**.
4. **Table**, sorted by last name:
   1. **Name** (last, first) — a link to the profile — with the preferred language under it.
   2. **Assignment** — the current job and client (Toast's Job column, "+1" when more than one).
   3. **Hired** — the hire date.
   4. **Payroll numbers** — "Set" or "Missing for <system>" for the system in use.
   5. **Status** — Active / Ended badge.
5. Under the table: how many workers are shown (of how many, when the search narrows them).

## Interactions
- `/` focuses the search. Typing filters as you type. Enter on a row's name opens the profile.
- Add worker → a dialog: first and last name, preferred language, hire date; Save opens the new
  profile.

## States
- No workers yet: one line and **Add worker**.
- Nothing matches the search (which looks at ended workers too): the words searched and **Clear
  search**.
- No active workers while ended ones exist (the Toast help's symptom → fix): "No active workers.
  Ended workers are hidden" with **Include ended**.
- The accountant and Billing: no Add worker; one line saying the Owner and coordinators add or
  change workers.

## Never copy
Toast's wording, icons, colors or logos.

## Look (decision 0029, from the products' own screenshots)
Stripe's table (https://docs.stripe.com/invoicing/dashboard): full width, small-capital headers, hairline rows; each name with the person's initials in a circle (Linear's lists show people with their avatar, https://linear.app/docs/custom-views); the status as a tinted badge.

Deviations allowed: none
