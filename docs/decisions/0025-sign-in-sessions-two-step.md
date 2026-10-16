# 0025 — Sign-in: passwords, a six-digit authenticator code, server sessions, one-time links

Status: accepted
Date: 2026-10-16

## Context
Until slice (k) the app ran only in demo mode as the demo Owner (session.ts refused live mode).
SPEC §2 needs real people with roles, and MFA for the Owner and Coordinators; §21 needs the security
basics. The demo must still open without a password (§18), through the same code paths.

## Decision
- **Passwords** (NIST SP 800-63B-4 §3.1.1.2; OWASP Password Storage Cheat Sheet): 15 to 128
  characters (15 because a password may be the only factor for Billing and the accountant), any
  characters, no composition rules, not the email, not one character repeated; NFKC-normalized;
  hashed with scrypt N = 2^17, r = 8, p = 1 (OWASP's minimum for scrypt), a 16-byte salt.
- **The second step**: TOTP (RFC 6238; SHA-1, 6 digits, 30 s, one step either side), a step never
  accepted twice; ten one-time recovery codes (stored as SHA-256 digests, shown once). Required for
  the Owner and Coordinators — the app does not open until it is set up (GitHub's "require two-factor
  authentication"); offered to everyone else. The authenticator secret is sealed with AES-256-GCM
  under the app's key (`SHIFTBOOK_ENCRYPTION_KEY` in the environment settings; a demo-only key derived
  from a fixed label in demo mode), bound to the person.
- **Wrong tries**, limited three ways: a short throttle per email and address and per address (10 and
  50 wrong passwords in 15 minutes; it covers unknown emails too, so it says nothing about who has an
  account, and a stranger elsewhere cannot lock someone out); per person, 100 wrong passwords in a
  day lock the password for an hour (NIST SP 800-63B's limit; a reset link clears it); wrong codes
  counted apart, never cleared by a right password: 10 in 15 minutes lock the code for 15 minutes,
  100 in a row for a day (the count then starts over), and a half session ends after 5. While codes
  are locked a recovery code still gets the person in, so a lock never shuts them out for good. When
  the visitor's address is unknown (no trusted proxy recorded it) there is no throttle key at all:
  one on the email alone would let anyone block that email for its owner; the person's day lock
  still counts. Every count is read and written under the
  login row's lock (parallel tries count one by one; a code or a recovery code works once even sent
  twice at once). An unknown email costs a password check too, and says the same as a wrong
  password. The password is checked outside any database transaction, at most four at once with 32
  waiting (beyond that, "busy"), so a flood of sign-ins cannot hold the database's connections.
- **Sessions**: a random 32-byte token in an httpOnly, SameSite=Lax cookie (`sb_session`, Secure on
  HTTPS); only its SHA-256 is stored. 12 hours idle, 7 days at most. The half session after a
  password lasts 10 minutes while a code is owed, 30 while the authenticator a role needs is set up,
  and is replaced by a fresh token once the step is passed. Signing out ends that session;
  suspension, a new password and a new authenticator end the person's other sessions too (not the
  demo's shared "Continue as" sessions, which used neither). A demo session is good only for a demo
  agency.
- **Confirm it's you** (GitHub's sudo mode): setting up or replacing an authenticator, new recovery
  codes, and every change to the agency's people need the password (or, with an authenticator, a
  code) given within the last 15 minutes of the session (GitHub allows two hours). A half session
  waiting for its code can never set up an authenticator. Never asked in the demo's shared sessions.
- **One-time links** (invites, 10 days — Stripe; password resets, 1 hour, one a minute at most): a
  random token with a prefix, stored as SHA-256; the copy of the email Shiftbook keeps hides it. A
  reset for someone with an authenticator asks the code before the new password (GitHub's order), so
  email access alone changes nothing; the browser that gave the code gets a proof cookie, and only it
  sets the password. A reset email goes out after the response, so an existing account answers as
  fast as an unknown one. The pages carry `Referrer-Policy: no-referrer` and
  `Cache-Control: no-store`, as the client approval links do.
- **Where it lives**: `src/server/auth/` (pure helpers: password, TOTP, recovery codes, sealing; the
  service; the emails). The login, session and token tables are read before the agency is known, so
  their row-level policy also admits a transaction that set `app.auth` (only `withAuth` in the
  service does); it then fences itself to the person's agency. An email belongs to one person in one
  agency.
- **The proxy** sends a request with no session cookie to sign-in (keeping where it was going) except
  the sign-in pages, invites and the client approval links; every page and action reads the session
  itself (`currentActor()`), so a stale cookie meets sign-in too.
- **Demo** (decision K3): "Continue as" the Owner, Lena (coordinator), Rosa (billing) or Morgan
  (accountant) starts a real session, marked demo (its second step counted: the demo has no phones),
  only for a demo agency in demo mode. Invite and reset emails go to the demo mailbox, whose copy the
  members and reset pages show so the whole flow can be tried. The demo reset keeps sessions (no
  foreign key to users) and clears logins.
- **New dependency**: `qrcode` 1.5.4 (MIT) draws the authenticator's QR code as an SVG on the server.

- **Live is the safe default**: a built app is a demo only when `SHIFTBOOK_MODE=demo` says so, so a
  live deployment that forgets the setting never offers the demo people or uses the demo key;
  `scripts/create-agency.ts` refuses outside live mode or without the key.

## Second opinion, fixed
A security review of the first version found, each now covered by a test (`tests/integration/sign-in.test.ts`):
a right password cleared the wrong-code count (so codes could be guessed between sign-ins); parallel
tries were counted from a stale read (and a code could pass twice); the hash ran inside a database
transaction (a sign-in flood could hold every connection); a stolen session could replace the
authenticator and the recovery codes; a reset request answered more slowly for an existing account;
ten wrong passwords locked anyone out from anywhere and told that the account existed; a live
deployment without the mode set ran as a demo. Also: the setup's half session now gets a fresh
token; two Owners demoting each other at once can no longer leave none; a wrong current password
counts; the reset's code is bound to the browser that gave it; a demo session ends when its agency is
no longer a demo; the "Reset demo" action checks demo mode; a login is tied to its person in the same
agency by a foreign key; AES-GCM tags must be 16 bytes. A second look at the fixes found, and fixed:
the day lock renewed itself forever (now the count starts over, and recovery codes work during a
lock); an email-only throttle key could block an email for its owner when addresses are unknown; the
code step locked rows in the opposite order to the other paths (a possible deadlock); a role change
turned old sessions into setup sessions (now they end, and the person signs in again).

## Alternatives considered
- A hosted identity provider (Auth.js, Clerk, Auth0): another vendor holding the agency's people and
  a network dependency the demo must not have; the needs here are small and standard.
- Passkeys / WebAuthn: stronger, but SPEC asks for MFA on top of a sign-in the owner knows; can be
  added later as another second step.
- SMS codes: weaker (GitHub and NIST discourage them) and a paid outside service.
- Signed (stateless) session cookies: cannot be ended at once on suspension or sign-out.

## Consequences
- Live mode now runs: a deployment needs `SHIFTBOOK_ENCRYPTION_KEY` and `SHIFTBOOK_APP_URL` (links in
  emails), and the first agency and Owner come from `scripts/create-agency.ts` (it prints the Owner's
  invite link once).
- Losing the encryption key loses every authenticator (people set them up again); it must be kept
  with the database backups' secrets, never in the database.
- Playwright signs in once as the demo Owner (a setup project) and reuses the session.
