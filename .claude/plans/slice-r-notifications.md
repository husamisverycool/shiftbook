# Slice (r) — notifications, invoices by email, credit notes, collection reminders, promises to pay

Status: building (owner: "build everything … in full", 2026-10-17; SPEC §27 item 3)

## Plain summary
- A bell in the sidebar with the number of unread notices. Notices arrive when a client approves or
  disputes hours, a weekly run is blocked, a compliance duty is due soon or overdue, or an invoice
  is overdue. Each opens the thing it is about. Linear's Inbox: a list, unread first, mark read
  (U), mark all read, delete read.
- Settings › Notifications: each person chooses, per kind of notice, whether it also comes by email
  (Linear notification settings: notices always reach the inbox; email is a channel you switch on).
- "Send invoice" emails the client's billing contact the invoice PDF (Stripe: the email carries the
  PDF; resend shows when it was last sent).
- "Issue a credit note" on an invoice: an amount, a reason, a memo; a numbered credit-note PDF;
  it lowers what the invoice asks for, or becomes the client's credit when already paid (Stripe
  credit notes; never more than the invoice's total).
- Settings › Collections: reminders emailed automatically before and after an invoice is due, on a
  schedule the agency picks (Stripe "send reminders … before, when, or after the invoice is due");
  a client can be left out. A scheduled job sends each reminder once.
- A promise to pay (date, amount, note) on an invoice, shown in receivables; broken when the date
  passes with money still owed.

## Steps
1. Research (`docs/research/notifications-slice-r.md`), pattern files, this plan.
2. drizzle/0045: notifications, notification_settings, promises_to_pay; email_messages gains
   invoice_id and attachment names; demo_mailbox attachment names; reminders gain "emailed" and the
   email; client_billing_profiles.reminders_off; invoices.credit_reason and memo.
3. Pure pieces with unit tests: which notices a state produces; the reminder schedule's due steps;
   the credit-note limit; the email texts.
4. Services with integration tests (tenant isolation of every new table).
5. Screens; demo seed; e2e in English and Spanish; second opinion on credit-note arithmetic.
