# Slice (k) — sign-in and roles, the worker roster with encrypted SSNs, the activity log, Spanish/English

Status: in progress (2026-10-16, under the owner's "just keep going"; no approval needed)
SPEC: §2 roles and MFA, §17 worker roster, §19 audit log, §20 language, §21 security; §24 acceptance
step 10 ("An Owner can reveal one SSN with a reason and the audit log shows it").
Research: `docs/research/roster-audit-language-slice-k.md` (from the notes of 2026-10-16).

## What the owner gets (plain words)
People sign in with their email and password; Owners and Coordinators also confirm a six-digit code
from an authenticator app. The Owner invites the team by email with a role, changes roles and
suspends people. Each person picks English or Spanish for themselves. A Workers page lists the
roster; each worker's profile shows their details, payroll numbers, language, documents and the last
four digits of their Social Security number — the Owner can see the whole number after giving a
reason, and every look is recorded. An activity log shows who did what and when, for everything,
filtered and exportable. The demo still opens with no password: "Continue as" the Owner, a
coordinator, billing or the accountant.

## Done means (evidence I will paste)
1. `pnpm test` (unit, integration, goldens), `pnpm typecheck`, `pnpm lint`, `pnpm hooks:test` — real
   output, green; the tenant-isolation test covers every new table.
2. Playwright, English and Spanish: continue as the demo Owner; invite a coordinator (the link from
   the demo mailbox), accept, set a password, set up the two-step code (computed from the setup key),
   sign out, sign in with password and code; a wrong code and a locked account are refused; the
   accountant sees no change buttons and every change is refused on the server; open Workers, filter,
   open a profile, add a document, reveal the SSN with a reason; open the activity log, filter to the
   reveal, export it; switch the language in preferences. Accessibility checks on every screen.
3. Screenshots of every new screen and state, compared with the pattern files.
4. Second-opinion reviews of sign-in and sessions, the SSN encryption and reveal, and the
   permissions — fixed.

## Decisions (each with a record in docs/decisions/)
- K1 **Sign-in**: email and password (scrypt, OWASP's N=2^17, r=8, p=1; at least 15 characters, no
  composition rules, at most 128 — NIST SP 800-63B-4 asks 15 without a second step), then a six-digit authenticator code (RFC 6238 TOTP,
  SHA-1, 30 s, ±1 step, a step never used twice) — GitHub's two steps. Required for Owner and
  Coordinator (SPEC §2), offered to everyone. Ten one-time recovery codes, shown once, stored hashed.
  Ten failed attempts in 15 minutes lock the account for 15 minutes. Password reset by an emailed
  link (one hour, one use). No new dependency except a QR code drawer (`qrcode`, MIT).
- K2 **Sessions**: a random 32-byte token in an httpOnly, Secure, SameSite=Lax cookie; only its
  SHA-256 is stored, with the user, the agency, when the second step was passed, last seen and expiry
  (12 hours idle, 7 days at most). Sign-out and suspension end sessions at once. Credentials,
  sessions and one-time tokens live outside row-level security (they are read before the agency is
  known) and are reached only through `src/server/auth/`; everything else stays per agency. An email
  belongs to one agency.
- K3 **Demo**: the sign-in page in demo mode lists the demo people ("Continue as"); choosing one
  starts a real session through the same code, marked as demo, its second step counted as passed
  (the demo has no phones). Invites and resets in the demo go to the demo mailbox, so the whole
  password and code flow can be tried there too.
- K4 **Permissions**: one table of what each role may do (`src/server/permissions.ts`), checked in
  every server action and used by every screen to hide what a person cannot do: Owner everything;
  Coordinator intake, hours, placements, workers (not SSNs), compliance duties for workers and
  placements; Billing invoices, receivables, cash, client billing; Accountant reads everything except
  SSNs and changes nothing.
- K5 **SSNs**: envelope encryption — a fresh data key per SSN (AES-256-GCM), wrapped by the agency's
  key-encryption key (AES-256-GCM) from `SHIFTBOOK_ENCRYPTION_KEY` (set in the cloud environment
  settings, never in the database); demo mode derives a demo-only key from a fixed label (HKDF), so
  demo SSNs are fictional and unprotected by design. Only the last four are stored in clear. Reveal:
  the Owner, a reason, shown once and audited ("reveal"), the people who looked listed on the
  profile (Toast's Retrieve SSN). Never in logs, prompts, exports or screens otherwise; validated as
  nine digits, area not 000 or 666, group not 00, serial not 0000 (9xx accepted: test numbers and
  ITINs).
- K6 **Activity log**: every create, update, approve, export, reveal, sign-in and settings change is
  already or will be an `audit_events` row; one page lists them (Stripe Workbench events: list and
  detail, filters by date, action, record type and person; GitHub's export of the filtered list as
  CSV); each record's own history uses the same component.
- K7 **Language**: each person's language in their preferences (Slack's Language & region); it opens
  their sign-in, their screens and the emails Shiftbook sends them. Duty explanations are written in
  the reader's language (task 46).

## Steps (tests first; each step usable end to end)
1. **Sign-in, sessions, two-step code, members, invites, preferences, permissions** — pages
   `/sign-in`, `/sign-in/code`, `/sign-in/setup` (the authenticator a role needs, before the app
   opens — GitHub's required two-factor), `/sign-in/reset`, `/sign-in/reset/[token]` (the code
   first for a person with an authenticator — GitHub's order), `/invite/[token]`,
   `/settings/account`, `/settings/members`; the proxy sends anyone without a session to sign-in
   (except the client approval links, the cron route and the sign-in pages); `currentActor()` reads
   the session; `actorAllowedTo(ability)` gates every action (decision 0026); `scripts/create-agency.ts`
   makes a live agency and its first Owner's invite link (decision 0025).
2. **Worker roster** — `/workers` (Toast Team page) and `/workers/[id]` (Toast profile: sections
   with their own Edit; Retrieve SSN), add a worker, documents, payroll numbers, language
   (decision 0027). Built: migration 0035 (status and end date; the sealed SSN, its last four and
   keyed index; `worker_documents`), `src/server/workers/{ssn,service,queries}.ts`, the Workers
   sidebar item (G then W), the two pages, `tests/integration/workers.test.ts`,
   `tests/e2e/workers.spec.ts` (en/es). Worker files are W-4, state withholding, direct deposit and
   other — no I-9 or identity copies (J4); Billing sees their list but cannot open them.
3. **Activity log** — `/settings/activity` (Stripe Workbench events; GitHub audit-log export) and
   per-record history; Spanish duty explanations (decision 0028). The Owner and the accountant read
   the whole log (`viewActivity`); a record's own history is the log filtered to it ("Show this
   record's activity"). Duties carry `explain` (a message key and values) beside the English
   message; a parity test keeps the English template and the stored sentence identical. The
   engine's own messages follow in slice l (task 50).

## Pattern files
`docs/patterns/sign-in.md` (GitHub's two-step sign-in; Linear's login), `sign-in/code.md`,
`sign-in/setup.md`, `sign-in/reset.md`, `sign-in/reset/[token].md`, `invite/[token].md`,
`_emails/sign-in-links.md`, `settings/account.md` (GitHub's two-factor setup; Slack's
language), `settings/members.md` (Linear Members; Stripe Add member), `workers.md` (Toast Team page),
`workers/[id].md` (Toast profile and Retrieve SSN), `settings/activity.md` (Stripe Workbench events;
GitHub audit log), `_layouts/auth.md`.
