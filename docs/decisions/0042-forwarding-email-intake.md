# 0042 — Timesheets by email: a forwarding address per agency, received through Resend

Status: accepted (owner, 2026-10-17: "finish everything")
Date: 2026-10-17

## Context
SPEC §6 lists "a forwarding email address (body and attachments)" among intake sources; it was the
one source not built. Decision 0012 already sends email through Resend; Resend also receives mail for
a domain and posts each message to a webhook (`docs/research/forwarding-email-slice-y.md`).

## Decision
1. **Address.** Each agency has `timesheets+<token>@<INBOUND_EMAIL_DOMAIN>`; the token is 20 base32
   letters (100 random bits), unique, stored per agency (`inbound_addresses`, row-level security). A
   new address ends the old at once. The demo shows an address on the reserved `in.granite.example`.
2. **Webhook.** `POST /api/inbound/email`, live only. The Svix signature over the raw body with
   `INBOUND_EMAIL_SECRET`, constant-time, five-minute window; no secret, nothing is taken (503). The
   event is capped at 256 KB (metadata only). Unknown addresses get the same answer as known ones.
   The agency comes from `inbound_address_lookup(token)`, the one cross-agency function (exact match on
   a bound parameter, `SECURITY DEFINER`, execute granted to the app role only).
3. **Fetching.** Body and files from Resend's Receiving API with `RESEND_API_KEY`; files only from
   Resend's own https hosts, redirects refused, each read with a hard cap (25 MB a file, 60 MB an email,
   10 files). Downloads happen before any database transaction opens.
4. **Once.** One row per provider `email_id` (unique), checked before downloading and again at insert.
5. **Senders.** Ramp's receipt forwarding: an optional list of addresses or `@domains`. Empty accepts
   anyone with the address. With a list, the sender must match and Resend's `authentication.dmarc`
   must be `pass` (the From line alone can be forged). A refused email's files are never stored.
6. **Filing.** Files go through `receiveDocument` — the upload's own path: same accepted types, same
   duplicate check, same read job, redaction before any model call, never a new worker — into the week
   that ended most recently before the email arrived (where the agency is). If that week's files are
   already made, the files are held (stored, listed) until someone with the hours ability adds them to
   an open week. Inline pictures under 50 KB are signature logos and passed over; other files Granite
   does not read are listed as not taken. The body is kept with SSN-, date- and long-number-shaped text
   removed (the redaction the worker messages use), at most 20,000 characters, and shown with the email;
   it is not read for hours (no reader takes free text; a timesheet in the body is rare and a person
   sees it).
7. **Telling people.** A notice (`email_received`) to whoever converts timesheets: filed ones open the
   week, held ones open the forwarding section.
8. **Who.** The Owner replaces the address and edits senders (settings ability); Owner and Coordinator
   file held emails and, in the demo, send the test email (hours ability); everyone sees the section.

## Alternatives considered
- Postmark inbound (posts the whole message, attachments in base64): one more provider beside Resend,
  and large bodies in the webhook request itself.
- Per-agency domains: DNS work for every agency; the plus address does the same with one domain.

## Consequences
- Hosting settings gain `INBOUND_EMAIL_DOMAIN` and `INBOUND_EMAIL_SECRET` (with the existing
  `RESEND_API_KEY`), plus the receiving domain and webhook set up in Resend.
- Readings of filed files start when someone opens the week (as an upload left unread does).
