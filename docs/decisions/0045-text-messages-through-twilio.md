# 0045 — Text messages through one transport: a demo outbox, and Twilio when live

Status: accepted (recorded after the fact: slice t added text messages on 2026-10-17 without a record)
Date: 2026-10-17

## Context
The worker app (SPEC §27 items 5–6, slice t) signs workers in with a six-digit code sent to their
mobile number, sends onboarding links, and tells a worker when their phone number changes; scheduling
(slice u) tells workers when a schedule they are on is published. That is a new outside service, which
CLAUDE.md asks to record. Demo mode must make no outside calls and use the same code paths (SPEC §18).

## Decision
- One `SmsTransport` interface (`src/server/worker-app/sms.ts`), chosen once by mode — the shape email
  already has (decision 0012).
- Demo mode and tests: `DemoSmsTransport` keeps the message in the agency's `sms_messages` table with
  its text, so the demo screen can show the code; nothing leaves the app.
- Live: `TwilioTransport` — `POST https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json` with
  plain `fetch` (no SDK), Basic authentication from the environment (`TWILIO_ACCOUNT_SID`,
  `TWILIO_AUTH_TOKEN`), sent from `TWILIO_FROM` (an E.164 number). Missing settings fail with a plain
  message naming the setting; they are set in the hosting variables, never in code or chat
  (`docs/hosting-settings.md`, `docs/launch-guide.md`).
- Every message is logged in `sms_messages`; a sign-in code is never kept (only "[code hidden]"), and
  the log names no worker when a number is shared by several agencies (worker-app security review).

## Alternatives considered
Amazon SNS (request signing, sender registration per country); Vonage and MessageBird (pricing and
US 10DLC registration not checked); email codes only (many hourly workers use their phone, not email).

## Consequences
Live sign-in by text needs a Twilio account and, for US numbers, 10DLC or toll-free registration
(Twilio's own requirement) before messages are delivered reliably. Without the settings, workers
cannot sign in to the worker app by text; the agency side is unaffected.
