# Slice (l) — passkeys (decision 0032)

Status: in progress (2026-10-16)

## Plain summary
People can add a passkey on their account page (after "confirm it's you") and then sign in with the
"Passkey" tile on the sign-in page: the device asks for a fingerprint, face or screen lock, and the
app opens. Because the device checks it is them, a passkey counts as both steps, so Owners and
Coordinators need no code on top. A passkey can be removed (after "confirm it's you").

## Steps (tests first in each)
1. Library and record: `@simplewebauthn/server` and `@simplewebauthn/browser`, pinned; `docs/decisions/0032-passkeys.md`.
2. Storage: `drizzle/0038_passkeys.sql` — `passkeys` and single-use `webauthn_challenges`, the same
   row-level security as the other sign-in tables; schema entries appended.
3. Server: `src/server/auth/passkeys.ts` — a pure judge (challenge, origin, RP ID, user verification,
   removed passkey, inactive member, counter) and the database steps (options, add, sign in, remove,
   list); audit events; the throttle; unit tests with a software authenticator
   (`tests/support/soft-authenticator.ts`) and integration tests (`tests/integration/passkeys.test.ts`).
4. Sign-in tile (`src/components/shiftbook/auth/passkey.tsx`) and its actions
   (`src/app/[locale]/(auth)/passkey-actions.ts`); `methods.ts` turns the tile on.
5. Account: the Passkeys section (`src/components/shiftbook/settings/passkeys.tsx`), the page's query.
6. Messages (`passkeys` namespace, English and Spanish), pattern files, e2e with Chromium's virtual
   authenticator and axe in both languages.

## Done when
Typecheck, lint, unit, integration, goldens, proposed, hooks tests and the e2e specs pass.

## Second-opinion fixes (2026-10-16/17)
The password or a code goes with every new passkey and the person is emailed; removing one signs out
the other sessions; capped, race-safe sign-in challenges (per address group and in all); the site
only from SHIFTBOOK_APP_URL in live mode; no user handle or a framed response refused; 20 passkeys a
person; the throttle never blocks a good signature and ignores unknown passkeys; a counter going back
flagged; the demo's passkey sessions marked demo. Recorded in decision 0032.
