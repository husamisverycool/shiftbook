# 0032 — Passkeys: sign in with the device's lock, counted as both steps

Status: accepted
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
2. **Who the site is**: the RP ID is the hostname of the app's base URL and the expected origin is
   that URL's origin — the same base URL the invite and reset links use (`linkBaseUrl`:
   `SHIFTBOOK_APP_URL` when set, which live mode requires; the request's own origin only in demo
   mode). A forged Host header therefore cannot change what a live deployment accepts.
3. **Adding a passkey** (account page): a full session only, after "confirm it's you" (GitHub asks for
   the password before "Add a passkey"; decision 0025's sudo window); `residentKey: "required"` (a
   discoverable passkey, so sign-in needs no email) and `userVerification: "required"`;
   `excludeCredentials` lists the person's passkeys, so a device is not registered twice;
   attestation "none". The user handle is the person's id (16 random-looking bytes, no name or email).
   The passkey's name defaults from its device type, in the language of the page the person is on
   ("Synced passkey", "Passkey on one device"), numbered when two would read the same.
4. **Signing in**: usernameless (discoverable) — the options carry no credential list. The passkey is
   found by its credential id across agencies (sign-in mode, as `user_logins` is found by email), its
   signature checked first, then refused when it was removed, its person is not active (suspended,
   invited, gone), the user handle names someone else, or its signature counter went backwards (a
   cloned authenticator; a counter that stays 0, as synced passkeys report, is accepted). The counter
   and `last_used_at` are updated under the passkey's row lock.
5. **A user-verified passkey is both steps** (SPEC §2, §21): a session started from a passkey is
   started with its second step done. Why it satisfies MFA: the private key lives on the person's
   device (something they have) and the authenticator unlocks it only after its own PIN, fingerprint
   or face check (something they know or are), which the signed `UV` flag attests; NIST SP 800-63B
   §5.1.8/§5.1.9 count such a multi-factor cryptographic authenticator as AAL2/AAL3 on its own, and
   it is phishing-resistant because the signature covers the origin and the RP ID hash. Hence the
   rule: **without the UV flag, the passkey is refused** — at registration and at every sign-in —
   never accepted as a single factor. A passkey does not replace the authenticator app a role needs
   for a password sign-in: a Coordinator who signs in with a password still gives a code.
6. **Challenges: a table, not a cookie** (`webauthn_challenges`). A challenge must work once; a
   sealed cookie holding it could be replayed with the same signed response for its whole life (the
   server would keep no record of its use), and synced passkeys' counters stay 0, so the counter
   cannot catch the replay either. The table keeps only the challenge's SHA-256, its purpose
   (`register` for one person, `sign_in` for anyone), the person for a registration, when it expires
   (5 minutes, also the ceremony's timeout) and when it was used. A response's challenge is looked up
   by digest and marked used under the row's lock *before* the response is judged, so even a refused
   response spends it. Expired rows are deleted as new ones are made. A sign-in challenge also keeps
   the digest of the visitor's address: at most 20 open ones per address (when the address is known),
   so the unauthenticated options request cannot fill the table.
7. **Wrong tries**: a refused passkey sign-in counts in the same short throttle as passwords
   (decision 0025): keyed by the passkey's credential id and the address (10 in 15 minutes) and by the
   address (50 in 15 minutes, shared with wrong passwords); none when the address is unknown. A
   success clears the passkey-and-address count.
8. **Removing** a passkey needs "confirm it's you"; the row keeps `removed_at` (the log and the list
   of what was refused can name it); a removed passkey never signs in again.
9. **Row-level security** as for the other sign-in tables (drizzle/0034): `passkeys` and
   `webauthn_challenges` carry `agency_id` (null for a sign-in challenge, whose person is not known
   yet), forced row-level security, and a policy that also admits a transaction in sign-in mode
   (`app.auth`, set only by `src/server/auth/`). Both are tied to the person by a foreign key on
   (user, agency) with `ON DELETE CASCADE`, so the demo reset (which re-creates the demo people)
   clears the demo's passkeys too.
10. **Audit**: `passkey_added` and `passkey_removed` (entity: the person; the passkey's id and name in
    the details), `sign_in` with method `passkey`, and `sign_in_failed` with step `passkey` and the
    reason when a known passkey is refused. Nothing logs a credential id, a public key or a challenge.
11. **Demo**: works fully — WebAuthn is between the browser and the device; nothing leaves the app.
    The demo's shared "Continue as" sessions may add passkeys (they are never asked to confirm); a
    passkey sign-in of a demo person is an ordinary, non-shared session.

## Alternatives considered
- A sealed httpOnly cookie for the challenge: no write on the options request, but not single-use
  (see 6).
- Passkeys only as a second step after the password: weaker usability, no gain; GitHub, Google and
  Microsoft treat a user-verified passkey as complete.
- Accepting passkeys without user verification as a password replacement only: would make a
  stolen unlocked security key enough to sign in an Owner; refused.
- Hand-written WebAuthn verification: CBOR/COSE/ASN.1 parsing is where such code goes wrong.
- Attestation (`direct`) to know the authenticator's maker: needs the FIDO metadata service, an
  outside call, for no decision we make.

## Consequences
- `passkey: true` in `src/server/auth/methods.ts`; the tile appears on the sign-in page.
- Live deployments must keep `SHIFTBOOK_APP_URL` stable: passkeys are bound to its hostname; moving
  the app to another hostname means everyone adds their passkeys again.
- A passkey's session is not tied to the passkey: removing a passkey does not end sessions it
  started (changing the password does).
- Renaming a passkey is not built: GitHub's documentation describes adding, listing and deleting
  only.
- "Confirm it's you" still takes the password or a code, not a passkey. A person with neither (only
  the demo people) is never asked, as before (decision 0025).
- The passkey actions live in `src/app/[locale]/(auth)/passkey-actions.ts`, apart from `actions.ts`;
  the session cookie they set is the same one, with the same attributes.
