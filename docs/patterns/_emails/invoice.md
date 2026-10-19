# Pattern: Invoice email and collection reminder email (to the client)

Status: adopted — slice r (2026-10-17)
Reference product and screen: Stripe — invoice emails ("we automatically include a PDF attachment of
the same invoice"), one-off and automatic reminders for unpaid invoices
Source URL: https://docs.stripe.com/invoicing/send-email
Researched: 2026-10-17. Confidence: medium (Stripe's email text is not published as text).

## Hierarchy (invoice)
1. Sender "{agency} via Tabulado"; replies go to the agency.
2. Subject: invoice number, from the agency.
3. Amount due and due date (credit note: amount credited and the invoice it credits).
4. The agency's message when one was typed.
5. The PDF attached (with its backup pages when the client's settings include them).
   When the client gets a consolidated statement and the week has two or more of its invoices, the
   statement PDF is attached too (completeness audit G1).
6. Footer: the agency's contact details.

## Hierarchy (reminder)
1. Subject: before due / overdue / final notice, with the number (slice h's reminder templates).
2. Body: slice h's reminder template text for the stage, in the client's language.
3. The PDF attached.

Deviations allowed: none
