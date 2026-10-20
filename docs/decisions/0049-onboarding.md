# 0049 — Onboarding: a code with the link, three setup questions, one email layout, default free days

Date: 2026-10-20. Status: accepted. Plan: `.claude/plans/onboarding.md`.

## Context
The owner asked for an onboarding "really well done, perfectly made", drawn from the best products.
The sign-up email carried only a link for 24 hours; the "Check your email" screen had no way to send a
new one and said "sent" even when sending failed; every email was bare text; a new agency met a ten-step
guide with no questions asked; and with no `STRIPE_TRIAL_DAYS` set a new agency was paused at once.

## Decision
1. **Code and link together** (Linear's login email, Slack's confirm screen): the sign-up email carries
   a six-digit code and the button. Either works once, for an hour (the email-link reference's hour);
   a right code ends the request and starts a fresh one for the password step (30 minutes), by INSERT,
   so the app role still cannot change a code, a link or an expiry (drizzle/0068 grants only
   `code_tries`). Codes are kept as a digest salted with the request id; five wrong codes end the
   request; codes typed from one address are throttled (30 an hour). Requests per email rise from 3 to
   5 an hour, so "Send a new code" (once a minute) has room. The email is sent before answering, so a
   failure is said on the screen. Codes never appear in a subject or preview (review L4).
2. **The authenticator stays required** for the Owner (decision 0032 unchanged); after it, one optional
   step offers a passkey for faster sign-in (GitHub's offer).
3. **Three setup questions** at `/welcome` (Gusto's one-question screens, Mercury's progress bar,
   Linear's skippable invite): the agency's address, time zone and pay week; the payroll system and its
   one detail; teammates. They save through Settings' own actions. Home's guide becomes "Finish
   setting up" with ten steps in the order a new agency takes them.
4. **One email layout** for every email (`src/server/mail/layout.ts`, `docs/patterns/_emails/layout.md`):
   wordmark, heading, the one button with its link written out, a large code, a footer, a preheader,
   dark-mode colours, a plain-text part with links on their own lines. Tabulado's own mail is sent as
   "Tabulado" (never "Tabulado via Tabulado").
5. **Onboarding emails**: a welcome once when the first Owner finishes two-step sign-in; from the daily
   sweep, a setup reminder naming the next step (two days in, then three days later, at most two, only
   while steps are left) and the free days ending (7 and 3 days before, never once subscribed).
6. **Free days by default**: an unset or unreadable `STRIPE_TRIAL_DAYS` means 30 days (the 30 decision
   0036 gave agencies already there); `0` still means none.

## Consequences
- The sweep (`/api/notifications/sweep`, `CRON_SECRET`) must be scheduled daily for the reminder and
  free-days emails; without it only the welcome goes.
- Passkeys still do not replace the authenticator for a password sign-in.

## Second opinion (2026-10-20, subagent security review), fixed
- M1: a code could be guessed slowly across new codes and addresses (25 an hour) → at most 10 wrong
  codes per email per day, whatever the request or address.
- L1: the fifth wrong code said so, revealing a sign-up under way → it answers as any wrong code.
- L2: a known email skipped one database round trip → both paths make it.
- L3: two sweeps or setups at once could send an onboarding email twice → one lock per agency around
  the check and the record.
- L4: a schema comment said codes are cleared → corrected.
- Also: email links must be web addresses; setup reminders only in an agency's first 30 days (agencies
  from before this change are not reminded).
- Checked and fine: code randomness and salting, constant-time compare, concurrent tries, the fresh
  request on a right code with drizzle/0043–0044's function and grants, the redirect, HTML escaping,
  MAIL_FROM parsing, /welcome's permissions, tenant isolation of the onboarding emails.
