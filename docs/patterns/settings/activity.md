# Pattern: Activity (`/settings/activity`)

Status: adopted — slice (k) plan, step 3 (2026-10-16, under the owner's "just keep going")
Reference product and screen: Stripe Workbench — Events (the list on the left, the selected event's
details on the right; filters for the date, the event type and the resource, each applied; a
Refresh button because the list does not update itself; Copy link for the filtered view; the
details show what changed, from `previous_attributes`); GitHub's organization audit log (each entry
names the actor, the action and the date and time; filters by actor, action and date; by default
the past three months; an Export that follows the current filters, as CSV); Vercel's audit log
(the export carries each change's previous and next state; exporting the log is itself logged)
Source URL: https://docs.stripe.com/workbench/overview
Source URL: https://docs.stripe.com/workbench/guides
Source URL: https://docs.stripe.com/development/dashboard/events
Source URL: https://docs.github.com/en/organizations/keeping-your-organization-secure/managing-security-settings-for-your-organization/reviewing-the-audit-log-for-your-organization
Source URL: https://vercel.com/docs/audit-log
Researched: 2026-10-16 (`docs/research/roster-audit-language-slice-k.md` §2a, §2d, §2e). Confidence:
high for the two panes, the filters, Refresh, Copy link, the filtered export and its columns; the
spacing and the page size are not documented.

## Purpose in Granite
SPEC §19: every create, update, approval, export and reveal, viewable globally and per record.
SPEC §24 step 10: the Owner's reveal of an SSN shows here, with its reason. The Owner and the
accountant read it (GitHub, Linear and Vercel keep their logs to owners; Granite's accountant
reads everything except SSNs, and the log never holds one — decision 0028).

## Hierarchy
1. **Page header:** "Settings" above H1 "Activity"; on the right **Refresh** (Stripe), **Copy link**
   (Stripe) and **Export CSV** (GitHub, following the filters).
2. **Filters** (Stripe's filters with Apply; GitHub's qualifiers as fields): **From** and **To** dates
   (the past three months by default, GitHub), **Person**, **Record type**, **Action**; **Apply**
   and **Clear**. A record chosen from the details shows as a removable chip, "Record: Marcus Bell ×"
   (Stripe's resource filter): the record's own history.
3. **Two panes** (Stripe Workbench):
   1. **The list**, newest first: each event on one row — what happened ("SSN viewed", "Changed",
      "Approved"…) with the record's type and name, and under it who and when. The selected row is
      marked. **Load more** under the list (50 at a time).
   2. **The details** of the selected event: what happened; when (date and time); who; the record
      (its name, a link to its page when it has one, and **Show this record's activity**); the
      reason, when one was given; **Changes**: each field with its value before and after
      (Stripe's `previous_attributes`; Vercel's previous and next); **Event data**, the event as
      recorded, folded (Stripe's payload).
4. Under the filters: how many events match.

## Interactions
- Apply runs the filters and puts them in the address (Copy link copies it). Clear goes back to the
  past three months, everyone, everything.
- A row (click, or the Up and Down arrows inside the list) shows its details.
- Show this record's activity filters to that record; the chip's × removes it.
- Export CSV downloads the filtered events: when, who, action, record type, record, record id,
  reason, before, after (Vercel's previous/next). The export is itself an event (Vercel).

## States
- Nothing matches: "No activity matches these filters." and **Clear filters**.
- Not the Owner or the accountant: one line saying who reads the agency's activity; the records'
  own histories stay where they are (a job order's Activity tab, a duty's history).
- Events by Granite itself (duties it works out) show "Granite" as who.

## Never copy
Stripe's, GitHub's or Vercel's wording, icons, colors or logos.

## Look (checked against the reference's own screenshots, 2026-10-17)
Stripe Workbench's inspector (https://docs.stripe.com/workbench/overview) shows a record's fields by
their recorded names with their raw values; so Changes lists each field as recorded with its value
before and after, and Event data is the event as recorded — not relabelled or reformatted.

Deviations allowed: none
