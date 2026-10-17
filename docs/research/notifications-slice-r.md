# Research — notifications, invoice email, credit notes, collection reminders (slice r)

Read live on 2026-10-17 (Firecrawl). Quotes are short; nothing below is copied into the app's wording.

## Linear — Inbox
Source URL: https://linear.app/docs/inbox
- "The Inbox is your notification center"; "Find your Inbox in the sidebar"; `G` then `I` goes there.
- Move with `J` / `K` or arrows; open a notification to see the item.
- Actions: delete the selected notification with `Backspace`, "delete all read notifications with
  `Shift` `Backspace`", `U` "to mark as read or unread", `Option/Alt` `U` "to mark all notifications
  as read". Snooze (`H`), display options "Show unread first". Up to 2,000 open notifications kept.
- "You cannot choose which notifications go to your Inbox. All notifications will arrive there."

## Linear — Notification settings
Source URL: https://linear.app/docs/notifications
- "You'll always see notifications in your Linear inbox." Other channels (desktop, mobile, email,
  Slack) are switched on per channel, then "enable or disable each notification type".
- Types are grouped ("You cannot select only status changes").
- Email: "digest or immediate delivery"; digests "are only sent if you haven't already read the
  Linear inbox notification."

## Stripe — Send customer emails
Source URL: https://docs.stripe.com/invoicing/send-email
- Click the invoice › "Send invoice"; before a resend Stripe shows a preview.
- "When Stripe emails an invoice, we automatically include a PDF attachment of the same invoice."
- Recipients: the customer's billing email(s), with CC recipients pre-filled on invoices sent from the
  Dashboard.
- Automatic reminders for unpaid invoices: "Select if you want Stripe to send the reminder before,
  when, or after the invoice is due. You can choose from a set of predefined options." (the option
  list itself: unverified — the settings page needs a sign-in).
- Email logs for 60 days on the customer page.
- Credit notes can be emailed ("Send credit notes to customers").

## Stripe — Issue credit notes
Source URL: https://docs.stripe.com/invoicing/dashboard/credit-notes
- "Credit notes are documents that decrease the amount of an open or paid invoice"; it "doesn't void
  and replace the original invoice". Examples: overbilled, short delivery, discounts.
- "A credit note reduces the amount due without recording any payment"; an open invoice credited to
  0 becomes paid. On a paid invoice: credit the customer's balance or refund outside Stripe.
- "The sum of all credit notes issued for an invoice can't exceed the total amount of the invoice."
- Flow: invoice › More actions › "Issue a credit note" › select a reason › amounts (per line, or a
  custom line with description) › issue. Void only while the invoice is open.

## Mapping
| Granite | Reference |
|---|---|
| Bell + inbox page, unread first, mark read / all read, delete read, keyboard J/K/U | Linear Inbox |
| Settings › Notifications: inbox always; email per kind | Linear notification settings |
| Send invoice / resend with last-sent shown; PDF attached | Stripe send customer emails |
| Issue a credit note: reason, amount (custom line with description), memo; cap at invoice total; paid → client credit | Stripe credit notes |
| Collection reminder schedule before / on / after due | Stripe automatic reminders |
| Promise to pay on an invoice | slice h's collections (FreshBooks/QuickBooks notes) — date, amount, note |
