# Pattern: Settings › Collections (reminder schedule)

Status: adopted — slice r (2026-10-17)
Reference product and screen: Stripe — Settings › Billing › "Manage invoices sent to customers":
"Send reminders … before, when, or after the invoice is due"
Source URL: https://docs.stripe.com/invoicing/send-email
Researched: 2026-10-17 (`docs/research/notifications-slice-r.md`). Confidence: medium (the setting's
option list needs a sign-in; Granite uses the three reminder kinds slice h already has).

## Hierarchy
The settings column (`_components/settings.md`):
1. Title "Collections".
2. Section "Automatic reminders": a panel — row 1: "Email reminders for unpaid invoices", a switch;
   then one row per reminder (before due, overdue, final notice): its name over a muted line, and the
   number of days before or after the due date on the right (a select of fixed choices).
3. Section "Clients left out": a panel listing clients that get no automatic reminders, each with a
   switch (Stripe lets a customer be excluded by its own settings).
4. Footer of the first panel: Save.

## Interactions
- Save records the schedule from today (an effective-dated setting).

## States
- Read-only roles see the values without controls.

Deviations allowed: none
