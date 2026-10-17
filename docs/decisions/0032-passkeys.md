# 0032 — Passkeys: sign in with the device's lock, counted as both steps

Status: accepted; revised the same day after a second-opinion security review (see the last section)
Date: 2026-10-16

## Context
Decision 0031 put a "Passkey" tile on the sign-in page, off until built. Decision 0025 left passkeys
for later ("stronger, but SPEC asks for MFA on top of a sign-in the owner knows"). SPEC §2 and §21
require MFA for the Owner and Coordinators. GitHub lets a person add passkeys in "Password and
authentication" (after re-authenticating) and sign in with one "without having to enter your
password, perform two-factor authentication (2FA), or verify a new device"
(docs.github.com, "Signing in with a passkey"; "Managing your passkeys").

## Decision
1. **Library (stack change)**: `@simplewebauthn/server` 14.0.3 and `@simplewebauthn/browser` 14.0.0
   (MIT, pinned exactly; the current stable major). WebAuthn's verification (CBOR, COSE keys,
   signatures, the RP ID hash, flags) is easy to get subtly wrong by hand; this pair is the most used
   TypeScript implementation, has no outside calls, and needs no attestation service (we ask for
   attestation "none"). Nothing else is added.
2. **Who the site is** (`src/server/auth/passkey-site.ts`): the RP ID is the hostname of
   `SHIFTBOOK_APP_URL` and the expected origin is its origin. In live mode nothing else is used —
   never the request's Host header, which a caller can forge — and without `SHIFTBOOK_APP_URL` every
   passkey action answers "Passkeys are not set up on this server yet" (the tile and the account
   section stay; the password still works). In demo mode, without it, the page's own address.
3. **Adding a passkey** (account page): a full session only; `residentKey: "required"` (a
   discoverable passkey, so sign-in needs no email) and `userVerification: "required"`;
   `excludeCredentials` lists the person's passkeys, so a device is not registered twice;
   attestation "none". The user handle is the person's id (16 random-looking bytes, no name or email).
   The passkey's name defaults from its device type, in the language of the page the person is on
   ("Synced passkey", "Passkey on one device"), numbered when two would read the same. At most **20
   passkeys** a person (removed ones aside), counted under a per-person lock; the 21st is refused in
   plain words.
   - **The password or a code goes with every passkey** ("confirm it's you", explicitly, for that
     passkey): the registration options are issued only by the request that carries the password (or
     a code, for someone with an authenticator), checked as decision 0025's confirmation checks it
     (wrong tries counted). A recent sign-in — which also sets the session's confirmation time — or a
     confirmation given for something else is not enough. The challenge issued is that
     confirmation's only use (once, five minutes, for that person). So a session held for a moment by
     someone else cannot leave a passkey behind. Not asked in the demo's shared "Continue as" sessions
     nor of someone with neither a password nor an authenticator (only the demo people), as before.
   - **The person is emailed** each time a passkey is added (`docs/patterns/_emails/passkey-added.md`,
     GitHub's security notice): which passkey, when, and what to do if it was not them; through the
     agency's mail transport (the demo mailbox in demo mode), kept with the agency's other emails.
4. **Signing in**: usernameless (discoverable) — the options carry no credential list. The passkey is
   found by its credential id across agencies (sign-in mode, as `user_logins` is found by email), its
   signature checked first, then refused when the response came from inside another site's frame
   (`crossOrigin: true` in the client data), the user handle is missing or names someone else (a
   discoverable passkey always returns the one it was made with), it was removed, its person is not
   active (suspended, invited, gone), or its signature counter went backwards (a copied
   authenticator; a counter that stays 0, as synced passkeys report, is accepted). The counter and
   `last_used_at` are updated under the passkey's row lock. A counter that went backwards is also
   logged as `passkey_clone_suspected` (the counts kept and given), apart from the refusal.
5. **A user-verified passkey is both steps** (SPEC §2, §21): a session started from a passkey is
   started with its second step done. Why it satisfies MFA: the private key lives on the person's
   device (something they have) and the authenticator unlocks it only after its own PIN, fingerprint
   or face check (something they know or are), which the signed `UV` flag reports; NIST SP 800-63B
   counts such a multi-factor cryptographic authenticator as multi-factor on its own, and it is
   phishing-resistant because the signature covers the origin and the RP ID hash. Hence the rule:
   **without the UV flag, the passkey is refused** — at registration and at every sign-in — never
   accepted as a single factor. A passkey does not replace the authenticator app a role needs for a
   password sign-in: a Coordinator who signs in with a password still gives a code.
   - **The UV flag is self-asserted.** With attestation "none" nothing proves which authenticator made
     the passkey or that its user verification is any good: the flag is the authenticator's own word
     (signed by the passkey's key, so not forgeable in transit, but not certified). Accepted: synced
     passkeys from the platforms send no attestation at all, and NIST's guidance on syncable
     authenticators (SP 800-63Bsup1, carried into SP 800-63B-4) accepts them at AAL2 on the
     authenticator's own user verification. Requiring attestation would need the FIDO metadata
     service (an outside call) and would refuse most phones and laptops.
6. **Challenges: a table, not a cookie** (`webauthn_challenges`). A challenge must work once; a
   sealed cookie holding it could be replayed with the same signed response for its whole life (the
   server would keep no record of its use), and synced passkeys' counters stay 0, so the counter
   cannot catch the replay either. The table keeps only the challenge's SHA-256, its purpose
   (`register` for one person, `sign_in` for anyone), the person for a registration, when it expires
   (5 minutes, also the ceremony's timeout) and when it was used. A response's challenge is looked up
   by digest and marked used under the row's lock *before* the response is judged, so even a refused
   response spends it, and two verifications of one response at once sign in once. A registration
   challenge never signs anyone in (the purpose is checked).
   - **Caps on the unauthenticated options request**: at most 20 open sign-in challenges per address
     group and 10,000 in all, counted and inserted under one transaction-scoped advisory lock (so
     parallel requests cannot pass a cap together; the lock is held for a count and an insert). An
     **address group** is an IPv4 address, or an IPv6 address's /64 network (one household or server
     gets a whole /64, so single IPv6 addresses cost nothing to change), or an IPv4-mapped IPv6
     address's IPv4. When no trusted proxy recorded the address, only the global cap applies. The
     global cap trades a flood's cost for a flood's reach: past 10,000 open challenges, passkey
     sign-in waits up to five minutes for everyone (password sign-in is untouched).
   - **Clean-up stays cheap**: each options request deletes at most 500 lapsed challenges
     (`FOR UPDATE SKIP LOCKED`, so parallel requests never wait on each other's clean-up); a lapsed
     challenge is refused whether it is still kept or not.
7. **Wrong tries**: refusals of a passkey we know (any refusal once its credential id is found: a
   spent or lapsed challenge, a failed signature, a check after it) count in the short throttle
   table (decision 0025), under keys of their own — the
   passkey and the address group (10 in 15 minutes), and passkey refusals from the address group (50)
   — apart from the password's, so neither blocks the other. A passkey nobody added (an unknown
   credential id) is refused without counting or logging, so junk cannot fill the throttle. A
   response whose signature and checks pass is **never** held back by the throttle: the throttle
   only changes the refusal's answer to "wait 15 minutes" and stops logging refusals while it holds
   (the log is not flooded). A success clears the passkey-and-address count. (A passkey cannot be
   guessed, so the throttle exists for the log and the database, not against guessing.)
8. **Removing** a passkey needs "confirm it's you" when due (decision 0025's 15 minutes); the row
   keeps `removed_at` (the log and the list of what was refused can name it); a removed passkey never
   signs in again; and **the person's other sessions end**, the current one kept — one of them may be
   the passkey's (as a new password does; the demo's shared sessions aside).
9. **Row-level security** as for the other sign-in tables (drizzle/0034): `passkeys` and
   `webauthn_challenges` carry `agency_id` (null for a sign-in challenge, whose person is not known
   yet), forced row-level security, and a policy that also admits a transaction in sign-in mode
   (`app.auth`, set only by `src/server/auth/`). Both are tied to the person by a foreign key on
   (user, agency) with `ON DELETE CASCADE`, so the demo reset (which re-creates the demo people)
   clears the demo's passkeys too. A passkey signs in only its own person in its own agency, even
   when the same email belongs to people in two agencies.
10. **Audit**: `passkey_added` and `passkey_removed` (entity: the person; the passkey's id and name in
    the details), `passkey_clone_suspected`, `sign_in` with method `passkey`, and `sign_in_failed`
    with step `passkey` and the reason when a known passkey is refused. Nothing logs a credential id,
    a public key or a challenge.
11. **Demo**: works fully — WebAuthn is between the browser and the device; nothing leaves the app.
    The demo's shared "Continue as" sessions may add passkeys (they are never asked to confirm). A
    passkey sign-in into a demo agency starts a session **marked demo**, so the demo people's actions
    are still labelled "(demo)" in the log (the Owner's name carries no note of its own). Like the
    shared sessions, such a session is good only while the agency is a demo, is never asked to
    confirm, and is not ended by a new password, a new authenticator or a removed passkey (only by
    suspension, sign-out or time).
12. **Password changes and resets keep passkeys** (GitHub: its password reset documents using a
    passkey during the reset and reviewing other credentials separately — it does not revoke them).
    A passkey is a credential of its own, not derived from the password; the notice sent when it was
    added, and the list on Your account, are how a person finds one they did not add. A new password
    still ends the person's other non-demo sessions, passkey sessions included.

## Alternatives considered
- A sealed httpOnly cookie for the challenge: no write on the options request, but not single-use
  (see 6).
- Reusing decision 0025's 15-minute confirmation for adding a passkey: a session's sign-in sets that
  time too, so a session held for a moment just after sign-in could add one unasked (review H1).
- Removing passkeys on a password reset: GitHub does not; a person locked out of their password would
  also lose the way in that still works.
- A per-address advisory lock instead of one lock: the global cap needs one count of everything.
- Passkeys only as a second step after the password: weaker usability, no gain; GitHub, Google and
  Microsoft treat a user-verified passkey as complete.
- Accepting passkeys without user verification as a password replacement only: would make a
  stolen unlocked security key enough to sign in an Owner; refused.
- Hand-written WebAuthn verification: CBOR/COSE/ASN.1 parsing is where such code goes wrong.
- Attestation (`direct`) to know the authenticator's maker: needs the FIDO metadata service, an
  outside call, for no decision we make (see 5).

## Consequences
- `passkey: true` in `src/server/auth/methods.ts`; the tile appears on the sign-in page.
- Live deployments must keep `SHIFTBOOK_APP_URL` stable: passkeys are bound to its hostname; moving
  the app to another hostname means everyone adds their passkeys again.
- Renaming a passkey is not built: GitHub's documentation describes adding, listing and deleting
  only.
- "Confirm it's you" still takes the password or a code, not a passkey.
- The passkey actions live in `src/app/[locale]/(auth)/passkey-actions.ts`, apart from `actions.ts`;
  the session cookie they set is the same one, with the same attributes.
- Framing: refusing `crossOrigin` responses stops a passkey ceremony run inside another site's frame;
  the app's frame headers (`frame-ancestors`/`X-Frame-Options`) are left to the app-wide headers.
- The shared "confirm it's you" dialog now tracks its own "confirming" state outside React
  transitions, and can take a change's own submit (`useAskToConfirm`): before, a wrong first try left
  Confirm disabled whenever the asking change was itself waiting in a transition.

## Second opinion (2026-10-16), fixed
A security review of the first version found, each now covered by a test (`src/server/auth/*.test.ts`,
`tests/integration/passkeys.test.ts`, `tests/e2e/passkeys.spec.ts`): adding a passkey relied on the
session's confirmation time, which sign-in sets, so a briefly held session could leave a passkey
behind unannounced (now the password or a code goes with every passkey, and the person is emailed);
removing a passkey left the person's other sessions open; the open-challenge cap was per address only,
counted IPv6 addresses one by one, and could be passed by parallel requests; the RP ID could follow
the request in live mode without `SHIFTBOOK_APP_URL`; a response without a user handle, or from
another site's frame, was accepted; there was no cap on passkeys per person; junk responses filled the
password throttle shared by the address, and the throttle could hold back a good signature; a counter
that went backwards was not flagged; the demo's passkey sessions were not marked demo. Tests added
for two verifications of one response at once, tenants (the same email in two agencies), a
registration challenge used to sign in, and the site under a forged Host header in live mode.
