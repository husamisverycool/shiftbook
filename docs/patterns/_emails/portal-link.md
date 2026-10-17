# Pattern: Client portal link email

Status: adopted — slice (v) plan (2026-10-17)
Reference product and screen: Stripe — customer portal login link email (one link that opens the
portal, how long it lasts); the app's approval request email (`_emails/approval-request.md`) for the
frame: plain text first, the agency's name as sender, one button, the agency's contact details
Source URL: https://docs.stripe.com/customer-management/activate-no-code-customer-portal
Source URL: https://docs.stripe.com/customer-management
Researched: 2026-10-17 (`docs/research/client-portal-slice-v.md` §1). Confidence: medium.

## Hierarchy
1. Subject: "{agency}: your client portal".
2. Greeting by name; one sentence on what the portal holds (invoices and payments, hours to
   approve, documents, requests for workers).
3. The one link: "Open the portal".
4. When the link stops working, and not to forward it (anyone with it can see the portal).
5. "If you weren't expecting this email, you can ignore it."
6. The agency's contact details.

## Interactions
- The link opens the portal's Overview; opening it changes nothing (decision 0013).

## States
- Sent in the contact's language (English or Spanish).

Deviations allowed: none
