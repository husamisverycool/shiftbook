# 0012 — Email through one transport: a demo mailbox, and Resend when live

Status: accepted
Date: 2026-10-16

## Context
Slice (d) sends approval links to clients (SPEC §10). Demo mode must make no outside calls and use
the same code paths as the live app (SPEC §18). Research: `docs/research/client-approval-slice-d.md`
part 2 §5.

## Decision
- One `MailTransport` interface (`src/server/mail/transport.ts`), chosen once in `services.ts` — the
  shape Rails, Laravel and Django use, and the one ADR 0004 already follows.
- Demo mode and tests: `DemoMailboxTransport` writes the delivered message to the agency's
  `demo_mailbox` table. Only this fictional mailbox ever holds a working link; the request's history
  shows it in demo mode so the person can act as the client.
- Live: `ResendTransport` — `POST https://api.resend.com/emails` with plain `fetch` (no SDK), a
  Bearer key from the environment (`RESEND_API_KEY`, set in the cloud environment settings), an
  `Idempotency-Key` per message, from `MAIL_FROM` (Shiftbook's address) as "{agency} via Shiftbook"
  with `Reply-To` the agency.
- Every message is logged in `email_messages` with the link hidden, per request (Stripe keeps a log
  of the emails sent to each customer).

## Alternatives considered
Postmark (the fallback: plain HTTP too, but its bounce webhooks are not signed); Amazon SES
(cheapest at volume, but request signing and a sandbox to leave first); SendGrid (pricing could not
be checked).

## Consequences
The agency needs no email setup in version one. Sending from the agency's own domain (DKIM and
DMARC records) and bounce webhooks come with the live email setup. Approval emails are
transactional, so no unsubscribe header is added (the Gmail and Yahoo sender rules exclude them).
