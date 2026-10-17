# 0033 — Google, Microsoft, an agency's single sign-on, and emailed sign-in codes

Status: accepted
Date: 2026-10-16

## Context
Decision 0031 put the other ways in on the sign-in page as Notion's tiles (Google, Microsoft, a
passkey, SSO) and Linear's "email me a code" link, switched off until each is built (passkeys:
decision 0032). The owner (2026-10-16) wants them working, in the demo too, without weakening what
decision 0025 set: one person per email, MFA for the Owner and Coordinators (SPEC §2), wrong tries
limited, nothing about who has an account told to a stranger, and the demo making no outside call.

What the references do (read 2026-10-16; wording never copied):
- Linear (`linear.app/docs/login-methods`): Google for a Google-supported address; "Continue with
  Email" sends a code to type on the login page; SAML from Settings › Security, members then use
  "Continue with SAML SSO"; owners can always sign in another way so a broken provider never locks
  them out.
- Notion (`notion.so/help/saml-sso-configuration`): a workspace owner turns single sign-on on in the
  workspace's identity settings, gives the provider's details, and copies the address Notion shows
  into the provider; a person types their email and is sent to the provider; with no configuration
  for them they "sign in the usual way, like with a code sent to your email".
- Stripe (`docs.stripe.com/get-started/account/sso`): SSO as one more way in or the only one;
  service-provider-initiated sign-in from Stripe's own sign-in page; a compromised provider is the
  agency's risk to weigh.
- Vercel (`vercel.com/docs/accounts`): "Login Connections" in the account's Authentication settings,
  one connection per outside service; an emailed six-digit one-time code to sign in.
- OpenID Connect Core 1.0 §3.1 (`openid.net/specs/openid-connect-core-1_0.html`): the code flow,
  `state`, `nonce`, ID-token validation (§3.1.3.7); RFC 7636 (PKCE, S256).
- Google (`developers.google.com/identity/openid-connect/openid-connect`): `iss` is
  `https://accounts.google.com` or `accounts.google.com`; use `sub`, never the email, as the key;
  `email_verified`. Branding: `developers.google.com/identity/branding-guidelines`.
- Microsoft (`learn.microsoft.com/en-us/entra/identity-platform/id-token-claims-reference`, optional
  claims reference): multi-tenant `iss` is `https://login.microsoftonline.com/{tid}/v2.0`; the
  `email` claim "isn't guaranteed to be correct" and must not be used for authorization; the optional
  claim `xms_edov` says the email's domain owner was verified. Branding:
  `learn.microsoft.com/en-us/entra/identity-platform/howto-add-branding-in-apps`.

## Decision
1. **One OpenID Connect client** (`src/server/auth/oidc.ts`) for Google, Microsoft and every agency's
   own provider: the discovery document (cached an hour; every endpoint https outside the demo);
   the authorization code flow with PKCE (S256), a random `state` and `nonce`; the code exchanged at
   the token endpoint (client secret in the form); the ID token verified with `jose`: the signature
   against the issuer's published keys, **RS256 or ES256 only** (never `none`, never HS*), `iss`
   (Google's two spellings; Microsoft's `{tenantid}` filled from the token's own `tid`, which must be
   a GUID), `aud` exactly our client ID (one audience), `azp` when present equal to it, `exp`, `nbf`
   and `iat` (`iat` at most 10 minutes old) with 60 seconds of clock skew, `nonce` equal to ours,
   `sub` present. Each refusal has a unit test with keys made in the test.
2. **The request's state** lives in one sealed cookie (`sb_oidc`: AES-256-GCM under the app key,
   httpOnly, SameSite=Lax, path `/api/auth/oidc`, 10 minutes): the state, nonce, PKCE verifier,
   provider, purpose (sign in, connect, invite, SSO) and where to go after. The callback refuses a
   state that is not the cookie's and deletes the cookie, so a code from someone else's browser is
   never used here (login CSRF).
3. **Providers.** Google (issuer `https://accounts.google.com`) and Microsoft (Entra ID v2.0,
   multi-tenant `common` endpoint) when their keys are in the environment:
   `SHIFTBOOK_GOOGLE_CLIENT_ID`, `SHIFTBOOK_GOOGLE_CLIENT_SECRET`, `SHIFTBOOK_MICROSOFT_CLIENT_ID`,
   `SHIFTBOOK_MICROSOFT_CLIENT_SECRET` (`docs/hosting-settings.md`). The redirect address to register
   with each is `<SHIFTBOOK_APP_URL>/api/auth/oidc/<google|microsoft|sso>/callback`. Scopes `openid
   email profile`.
4. **The demo identity service** (demo mode only): a discovery document, an authorize step, a token
   endpoint and published keys at the fixed address `https://identity.demo.shiftbook.invalid`
   (RFC 6761: `.invalid` never resolves), which the same client code reaches IN-PROCESS through a
   fetch that answers only that address (`demoFetch`) — never over the network, never at an address
   taken from a request (revised after the security review, H1). Only the browser's step is a route
   on the app, `/api/demo/idp/<google|microsoft|sso>/authorize` (404 outside demo mode). Its page
   (`/sign-in/demo-provider/<provider>`)
   is Shiftbook's own plain page, saying it stands in for that provider in the demo, listing the demo
   people's addresses and one address that belongs to no member. It signs ID tokens (ES256) with a key
   made at run time (on first use, kept in memory, never written); client secrets are derived at run
   time from the demo key. In demo mode
   the demo stand-ins are always used, even when real keys are set: the demo makes no outside call.
5. **Linking rules** (`decideIdentitySignIn` in `src/server/auth/linking.ts`, applied by
   `src/server/auth/identities.ts`; each has a test):
   - An identity is its issuer and subject (`sub`), never its email. It belongs to one Shiftbook
     person (unique while not removed); a person has at most one per provider (Vercel).
   - It is linked (a) from Your account while signed in, after confirming it's them (sudo mode) —
     **Connect** / **Disconnect**; (b) when accepting an invite with it, only if the provider asserts
     a verified email equal to the invited email; (c) at sign-in, only if the provider asserts a
     **verified** email equal to an active member's: Google `email_verified` true; Microsoft only
     with `xms_edov` true (otherwise: "connect it from Your account first"); an agency's provider
     `email_verified` (or, on Entra ID, `xms_edov`) true. The first such link also needs a code sent to
     that mailbox now, unless the provider hosts the mailbox itself; a person who already has another
     identity from that provider is refused; every link is announced by email (security review H2).
   - An unverified email is refused as such before any lookup, so a provider that lets anyone type
     an email learns nothing about who has an account.
   - No sign-in ever creates a member or an agency. Suspended members are refused (their sessions
     already ended); an invited person joins only through the invite.
   - A disconnected identity is kept as removed (for the record); it can be connected again.
6. **The second step is the same as after a password** (`nextStep`): the six-digit code for anyone
   with an authenticator; authenticator setup for an Owner or Coordinator without one (SPEC §2).
   The demo people in demo mode skip it, as "Continue as" does (decision K3): their session is a demo
   session. A session records its first factor, so the log of the code step names it ("google and
   authenticator code").
7. **An agency's single sign-on** (Owner only; Settings › Single sign-on, beside Members in the
   agency menu, as Linear and Notion keep it with security and members): an OpenID Connect issuer
   address, client ID and client secret, on or off. The secret is sealed under the app key, bound to
   the agency (as authenticator secrets and SSNs are), never shown again: the page says only that it
   is set and its last four characters. Saving checks the issuer's discovery document (Stripe's
   configuration checks) and needs "confirm it's you". The sign-in page's SSO tile asks the work
   email; for an active member of an agency with SSO on, the flow runs against that agency's
   provider and the identity must be linked to a member of that agency, or carry a verified email
   equal to the member's; for every other email the page says SSO is not set up for it (the same
   answer whether the email exists or not). In demo mode the demo agency's SSO is on and points at
   the demo stand-in ("sso"); other issuers cannot be saved in the demo. (Tightened by the security
   review: M2, L1, L5, L6.)
8. **Emailed sign-in codes** (Linear's and Vercel's): type the email; an active member gets a
   six-digit code by the app's mail transport (the demo mailbox in demo mode, whose copy the page
   shows, as the reset page does). The code is stored only as an HMAC-SHA256 under a key derived
   from the app key and bound to the code's row; it lasts 10 minutes, works once, five wrong tries
   end it, a newer code replaces it, and one is sent at most once a minute (and, after the security
   review, at most five an hour and ten a day, M1). The page answers the same whether or not the
   email exists. A right code is a first factor; `nextStep` follows. The copy of the email Shiftbook
   keeps hides the code.
9. **Wrong tries** count as wrong passwords do (decision 0025): the throttle per email and address
   and per address covers wrong codes and refused provider sign-ins. (Revised by the security review:
   a wrong emailed code counts as a wrong authenticator code, M1; a provider's refusals are keyed by
   the identity, L2.)
10. **Audit**: `sign_in` with method `google`, `microsoft`, `sso` or `email_code`; refusals as
    `sign_in_failed` when a person is known; connecting and disconnecting as the activity log's
    "identity connected" / "identity disconnected" (an `update` of the person, as an SSN change is).
11. **Storage** (`drizzle/0039_identities.sql`): `user_identities`, `email_sign_in_codes` (both read
    before the agency is known, so their row policy also admits sign-in mode, as `user_logins` does)
    and `agency_sso` (fenced to the agency); `sessions.first_factor`. `drizzle/0040_identity_hardening.sql`
    gives each emailed code its purpose (`sign_in`, `link`, `confirm`) and moves the demo agency's SSO
    issuer to the stand-in's fixed address.

## Second opinion (security review of d45d9a2, 2026-10-17), fixed
Each item has a test; file references are under `src/server/auth/` unless named.
- **H1 — the demo trusted a provider at a caller-chosen address.** The demo's stand-in was called over
  HTTP at the request's own Host. Now it is reached in-process (`demoFetch`, item 4): no server-side
  address is ever built from a request. `originFrom` (src/server/request-info.ts) also takes the
  scheme from X-Forwarded-Proto only when it says http or https, and a Host that is not a host name
  (or a bracketed IPv6 address) with a port is no address. Tests: a flow started with a spoofed Host
  completes with `fetch` stubbed to fail and never called; the in-process transport refuses every other
  address; `originFrom` with odd schemes and Hosts.
- **H2a — silent linking by email at sign-in.** The first link of a provider's identity at sign-in
  now needs a six-digit code sent to the member's address (`/sign-in/link`: GitHub's device
  verification by email; Slack binds existing members to SSO by email), unless the provider hosts that
  mailbox: Google for `@gmail.com`, or its Workspace domain when `hd` equals the address's domain;
  Microsoft with `xms_edov` true — the domain is verified in the user's own tenant, so that tenant hosts
  it, and the authenticator code (or its setup) still follows for the Owner and Coordinators. An
  agency's own provider never counts: its Owner controls what it asserts, so it could otherwise sign
  in as any member; the first SSO sign-in of each member needs the code. An invite already proves the
  mailbox (its link came there). The waiting link is sealed in a 10-minute httpOnly cookie
  (`sb_link`) naming the code's row; the code works only for that link.
- **H2b — a second account from the same provider.** A person who already has an identity from that
  provider is refused ("other_identity": sign in with that one, or disconnect it first).
- **H2c — every link is announced** by email to the person (`docs/patterns/_emails/identity-linked.md`,
  GitHub's "added to your account" notice): from Your account, when joining, at sign-in.
- **M1 — emailed codes.** A wrong code counts as a wrong authenticator code (10 in 15 minutes lock
  codes for 15 minutes, 100 in a row for a day; recovery codes still open an authenticator), never the
  password's count. Codes are capped per person (five an hour, ten a day, every purpose together) and
  requests per address (30 an hour). Only a code actually sent replaces the pending one, so requests
  beyond the caps void nothing: a stranger can at most use up a day's codes, never shut the owner out
  of the code they hold. One pending code per purpose (not several at once): several would multiply a
  guesser's chances.
- **M2 — SSRF through an Owner's issuer.** Every call to a provider goes through `safeFetch`: https on
  port 443 to a name (never an IP address, never credentials in the address), every address the name
  resolves to must be public (RFC 6890's special-purpose ranges and IPv6 forms carrying IPv4 refused),
  checked in the connection's own lookup so a name that later resolves inward (DNS rebinding) is
  refused at that connection; answers at most 512 KiB and 10 seconds; no redirects. The endpoints a
  discovery document names must be on the issuer's own host, except Google's and Microsoft's
  documented hosts (`endpointHostsFor`, oidc-flow.ts). An issuer that is an IP address or resolves to
  a private address is refused when saved ("issuer_private").
- **L1** — the SSO lookup is capped at 20 per address in 15 minutes; in live mode a code request does
  all its work after the response (the lookup included), so members and others answer alike; nothing
  is recorded for an unknown address.
- **L2** — a provider's refusals are counted by its identity (issuer and subject), not by the email it
  shows.
- **L3** — "confirm it's you" no longer skips a person with neither a password nor an authenticator:
  they confirm with a code sent to their email (GitHub's emailed verification), before connecting or
  disconnecting accounts, setting a first password, or any other sensitive change. It also closed a
  hole: the password check used to accept anything from such a person. (Re-authenticating at the
  provider with `prompt=login`, `max_age=0` and an `auth_time` check was considered: it depends on each
  provider honouring it, and one emailed code covers everyone.)
- **L4** — the code is never in the subject (inbox previews and notifications show subjects), and the
  email says never to share it. The code is not bound to the browser that asked for it: it is a first
  factor only (the authenticator still follows for the Owner and Coordinators), lasts 10 minutes, works
  once and is limited as above; binding would not stop someone who tricks a person into reading it
  out (their browser asked for it), so it would add a cookie without a defence.
- **L5** — the SSO page is the Owner's: everyone else gets the same "not for your role" state as the
  other Owner settings, and the agency menu lists it only for the Owner. A client secret has at least 16
  characters.
- **L6** — recorded limits and fixes: turning SSO on adds a way in and does not remove the others (a
  "require SSO" switch, as Linear, Notion and Stripe offer, is a follow-up). Entra ID as an agency's
  provider sends no `email_verified`: its app registration needs the optional `email` and `xms_edov`
  claims, or members' first SSO sign-in is refused as unverified. An identity linked to a different
  member of the same agency no longer signs in when another member typed their email. Both caches
  (discovery documents and key sets) hold at most 64 entries, oldest out first, and a saved or switched
  SSO configuration is read afresh.

## New dependency
`jose` 6.2.12 (MIT, no dependencies; already in the lockfile under shadcn's MCP SDK): JWS
verification, remote key sets with caching, and signing for the demo stand-in. Writing JOSE by hand
is where ID-token bugs come from (algorithm confusion, key selection).

## Alternatives considered
- A hosted identity broker (Auth0, Clerk, WorkOS): another vendor holding the agency's people, and
  the demo would need it too.
- SAML for agencies' single sign-on (Linear, Notion, Stripe): XML signatures are a large attack
  surface for a small app; every provider those products list (Okta, Entra ID, Google Workspace,
  OneLogin) also speaks OpenID Connect, so one client serves all three ways in.
- Linking by email alone: the email is mutable and, at Microsoft, unverified (both providers say so).
- State in a database table: one more table read before the agency is known; a sealed cookie bound
  to the browser does the same job with nothing to sweep.
- Magic links instead of codes: a link opens in whatever browser the mail app picks; a code is typed
  where the sign-in began.

## Consequences
- A live deployment that wants Google or Microsoft registers the redirect address with them and sets
  the four keys; nothing else changes. An agency's Owner registers
  `<SHIFTBOOK_APP_URL>/api/auth/oidc/sso/callback` with their provider.
- The demo stand-in's signing key is new at each start: an ID token issued before a restart no
  longer verifies (a person simply tries again). Its issuers no longer depend on the app's address,
  so an identity connected in the demo survives a change of port.
- A provider compromise is the agency's risk for its own SSO (Stripe says so); Shiftbook still asks
  the authenticator code after it for the Owner and Coordinators.
- Known limit, left as it is: the log line of an authenticator set up right after a provider's
  sign-in still reads "password and a new authenticator" (the session's first factor is named only at
  the code step).
