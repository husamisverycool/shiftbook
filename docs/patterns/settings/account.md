# Pattern: Your account (`/settings/account`)

Status: adopted — slice (k) plan, decisions K1 and K7 (2026-10-16, under the owner's "just keep going");
Passkeys added by decision 0032 (2026-10-16)
Reference product and screen: GitHub — "Password and authentication" settings (Change password: old
password, new password, confirm, "Update password"; two-factor authentication: turn it on with the
three-part setup, see and regenerate recovery codes — a new set invalidates the old); Slack —
Preferences, "Language & region" (a Language dropdown); Square — the person's language applies to
their login page and the emails sent to them
Source URL: https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/updating-your-github-access-credentials
Source URL: https://docs.github.com/en/authentication/securing-your-account-with-two-factor-authentication-2fa/configuring-two-factor-authentication
Source URL: https://docs.github.com/en/authentication/securing-your-account-with-two-factor-authentication-2fa/configuring-two-factor-authentication-recovery-methods
Source URL: https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/sudo-mode
Source URL: https://slack.com/help/articles/215058658-Manage-your-language-preferences
Source URL: https://squareup.com/help/us/en/article/5234
Source URL: https://vercel.com/docs/accounts
Source URL: https://docs.github.com/en/authentication/authenticating-with-a-passkey/managing-your-passkeys
Source URL: https://docs.github.com/en/authentication/authenticating-with-a-passkey/signing-in-with-a-passkey
Source URL: https://passkeys.dev/docs/use-cases/bootstrapping/
Researched: 2026-10-16 (`docs/research/roster-audit-language-slice-k.md` §3a, §4). Confidence: high
for the sections and their actions; the page's spacing is not documented.

## Purpose in Shiftbook
Each person's own settings, whatever their role (the read-only accountant too: these change only
their own account): their language, their password, their authenticator and recovery codes, their
passkeys and the outside accounts they sign in with.

## Hierarchy
1. **Page header:** "Settings" above, H1 "Your account"; under it the person's name, email and role.
2. **Language** section (Slack "Language & region"): a **Language** select (English, Español), saved
   when chosen; the line under it says it sets their screens, their sign-in page and the emails
   Shiftbook sends them (Square).
3. **Password** section (GitHub "Change password"): **Current password**, **New password** (the
   rule under it), **Confirm new password**, **Update password**. The line under the heading says
   when it was last changed. A person with no password yet (a demo person) sees no current-password
   field and the button says **Set password**.
4. **Authenticator** section (GitHub two-factor authentication):
   - Off: one line on what it is (required for the Owner and Coordinators), **Set up authenticator**,
     which opens the three-part setup (the same component as `sign-in/setup.md`) in place.
   - On: "On since <date>"; **Recovery codes**: how many are left, **Make new recovery codes** (a
     confirmation says the old ones stop working; then the new ten with Download, Print, Copy and
     **I have saved my recovery codes**); **Set up again** for a new phone (the same three-part
     setup; the old authenticator works until the new one is verified).
5. **Passkeys** section (GitHub "Passkeys" under "Password and authentication"; passkeys.dev
   "Bootstrapping": the account's settings, once signed in, are where a passkey is added):
   - One muted line: what a passkey is (the device's fingerprint, face or screen lock instead of the
     password and code) and that it counts as both steps.
   - **The list** (GitHub's list of registered passkeys, each with a delete control beside it): one row
     per passkey — its name (from its device type: synced, or on one device — GitHub's "Synced"
     label), when it was added and when it was last used (or not yet), and **Remove** at the right.
     None yet: one line saying so.
   - **Add a passkey** (GitHub: "Add a passkey" under "Passkeys").
6. **Connected accounts** (decision 0033; Vercel's "Login Connections" in the account's
   Authentication settings, one connection per outside service): one line on what they are (another
   way to sign in; the authenticator code is still asked when the role needs it); one row each for
   **Google** and **Microsoft** (shown when that way in is offered), the provider's own mark and name:
   - Not connected: **Connect** — confirm it's them, then the provider (the demo's stand-in in the
     demo), then back here with a toast.
   - Connected: the account's email as the provider gave it, "Connected <date>", and **Disconnect**
     (a confirmation; confirm it's them first).
7. **Sign out** (a secondary button at the bottom).

## Interactions
- Set up authenticator, Set up again and Make new recovery codes first ask the person to confirm it's
  them when they have not given their password or a code in the last 15 minutes (GitHub's sudo mode;
  `_components/confirm-access.md`).
- Language → saved at once; the page reloads in that language.
- Add a passkey → "confirm it's you" every time — the password or code goes with that passkey's
  request, never a recent sign-in or a confirmation given for something else (GitHub: "If prompted,
  authenticate with your password or another existing method"; decision 0032); not asked in the
  demo's shared sessions or of someone with neither — then the browser's own passkey prompt; then a
  confirmation that the passkey was added, with its name, and **Done** (GitHub: "review the
  information confirming that a passkey was successfully registered, then click Done"); the list
  shows it, and the person is emailed (`_emails/passkey-added.md`).
- Remove → a confirmation naming the passkey (GitHub's "Delete confirmation" pop-up), then "confirm
  it's you" when due; the row goes and a toast says so. A removed passkey never signs in again, and
  every other place the person is signed in is signed out (as a new password does).
- Update password → saved; the other places they were signed in are signed out; a toast says so.
- Connect → back from the provider with a toast: connected; or already connected to another
  Shiftbook person; or the provider did not sign them in.

## States
- Wrong current password, the passwords differ, or the rule is broken: a message under the field.
- Demo person: the authenticator and password can be tried; nothing is sent anywhere.
- Saving: the button shows it is working.
- Passkeys: the person closes the browser's prompt or cancels "confirm it's you" — nothing is said;
  this device already holds one of their passkeys, the browser cannot make passkeys, the passkey is
  refused, they already have 20 (the most), or passkeys are not set up on this server — one line under
  Add a passkey; a wrong password or code — said in the confirmation, which stays open; adding — the
  button says so.

## Never copy
GitHub's, Slack's, Square's or passkeys.dev's wording, icons, colors or logos (the key is lucide's
icon).

Deviations allowed: none
