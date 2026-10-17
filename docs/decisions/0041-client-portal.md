# 0041 — The client portal: emailed links with decision 0013's rules

Status: accepted
Date: 2026-10-17

## Context
SPEC §27 item 8 (owner, 2026-10-17): clients approve hours, see invoices and backup, download a
remittance stub and proof of registration, and request workers. Research:
`docs/research/client-portal-slice-v.md` (Stripe customer portal, TempWorks WebCenter, Avionté,
Instawork, Bill.com).

## Decision
1. **A portal link per contact**, as approval links (decision 0013): `sbcp_` + 32 random bytes, only
   the SHA-256 stored, one SECURITY DEFINER lookup (`portal_link_lookup`) returning the link's id and
   agency, everything after inside the agency's fence and the contact's client. Opening reads (it
   notes the first opening and the last visit); every change is a POST that checks the link again.
   Links last the agency's `approval_link_days`. A new link revokes the earlier ones; removing access
   revokes all at once. "Email me a new link" from an expired link: to the address on file, once per
   five minutes, three a day, not after 30 days. The agency sends a contact a link at most once a
   minute. A contact has at most 20 requests waiting at a time.
2. **Tokens are hidden wherever text is kept**: the approval redaction covers both prefixes, and
   `email_messages` refuses a stored body with a portal token.
3. **Hours to approve** reuse the approval page: the portal issues a fresh approval link only to the
   contact whose email is the request's approver (the decision's evidence stays the approver's).
4. **Requests for workers** are their own table (a draft for the agency, Linear's Triage), not a
   job-order status: accepting creates the job order through the existing service; declining needs a
   reason the client sees. A typed hook (`onStaffRequestReceived`) is where notifications attach.
5. **No payments**: the portal says how to pay; the remittance PDF is for the client's own records.

## Alternatives considered
- A password account for clients (Bill.com): more to secure and support for a small agency's
  clients; Stripe's portal uses emailed links.
- Short-lived sessions behind the link (Stripe's 5 minutes): a bearer link already gates every read;
  a session cookie would add CSRF surface for little gain at 256-bit tokens.

## Consequences
Anyone with a forwarded link sees that client's portal until it expires or access is removed; the
email says not to forward it, and the agency sees each contact's last visit.
