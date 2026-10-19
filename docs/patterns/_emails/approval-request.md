# Pattern: Client approval emails (request, reminder, new link, confirmation, agency notice)

Status: adopted — slice (d) plan (2026-10-16)
Reference product and screen: Bullhorn Time & Expense — time approval request email (one button to
the approval page, sent only while time is unapproved), its reminders and its confirmation email
(what was approved and what was disputed); Stripe — invoice email (a link to the hosted page, plain
summary, the business as sender)
Source URL: https://kb.bullhorn.com/bte/Content/BHTE/Topics/manageClientLevelReminderSettings.htm
Source URL: https://kb.bullhorn.com/bte/Content/BHTE/Topics/approvingTime.htm
Source URL: https://kb.bullhorn.com/bte/Content/BHTE/Topics/troubleshootingApprovalEmailDelivery.htm
Source URL: https://docs.stripe.com/invoicing/send-email.md
Source URL: https://docs.stripe.com/invoicing/hosted-invoice-page.md
Researched: 2026-10-16. Confidence: medium — Bullhorn does not publish the subject or body text;
the order below is from Stripe's invoice email and Bullhorn's description of its contents.

## Purpose in Tabulado
The emails that carry the approval link (SPEC §10: "reminders") and confirm the client's decision.
Plain text with a simple HTML copy; no images, no tracking pixels, nothing loaded from other sites.

## Hierarchy (request, reminder and new link)
1. Sender: "{agency} via Tabulado"; replies go to the agency's email address.
2. Subject: the client, the period and that hours wait for approval (reminder: says it is a
   reminder).
3. One line: who asks and what (the agency asks the approver to review the period's hours).
4. Summary: number of workers, shifts and hours waiting.
5. The button / link to the approval page, and how long it lasts.
6. Footer: the agency's contact details; that the link is personal and should not be forwarded.

## Hierarchy (confirmation to the approver, notice to the agency)
1. Subject: hours approved (and disputed, when any) for the client and period.
2. What was approved (shifts and hours) and what was disputed (worker, day, reason), by whom and
   when (Bullhorn's confirmation lists approved and disputed time).
3. The agency's contact details (to the approver); a link into Tabulado to the request (to the agency).

## States
- Language: the approver's language chosen when the request was sent (English or Spanish); the
  agency notice uses the agency's language.

## Never copy
Bullhorn's or Stripe's wording, icons, colors or logos.

Deviations allowed: none
