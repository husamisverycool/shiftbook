# Pattern: Settings › Agency (`/settings/agency`)

Status: adopted — completeness audit G1 (2026-10-17)
Reference product and screen: Gusto — company details (legal name, addresses, phone); Linear —
workspace settings, General (one column of sections with rows), as every settings page
(`_components/settings.md`)
Source URL: https://support.gusto.com/article/106622257100000/edit-company-details-for-admins
Source URL: https://linear.app/docs/workspaces
Researched: 2026-10-17 (`docs/research/agency-setup-g1.md`). Confidence: high for the fields; the
layout is the settings column already used everywhere.

## Purpose in Tabulado
The agency's own details: the name, address, phone and reply-to email its invoices and emails carry,
and its time zone (what "today" is for due dates, periods and reminders).

## Hierarchy
1. **Header:** "Settings" above, H1 "Agency".
2. **Business details** section (Gusto company details), a form panel: legal name; address (up to
   four lines); phone; billing email (replies to invoices and emails go there); Save in the panel's
   foot.
3. **Time zone** section: one row — the label over one muted line, and a select of US time zones at
   the right (Gusto keeps the company's time zone with its details); saved with the form.

## Interactions
- Save checks each field and shows the rule under the field that breaks it; saved: a toast.
- Only the Owner changes them; anyone else sees them read only with a line saying who can.

## States
- **New agency:** blank fields, the time zone unset ("Choose a time zone"); Home's setup guide links
  here.

## Never copy
Gusto's or Linear's wording, icons, colors or logos.

## Loading and errors
- Loading: the page's outline in the settings shape (`_components/loading.md`).
- A failure: the frame stays; "Try again" (`_components/error.md`).

Deviations allowed: none
