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
Source URL: https://linear.app/docs/account-preferences
Source URL: https://linear.app/docs/notifications
Source URL: https://linear.app/docs/saml-and-access-control
Source URL: https://linear.app/docs/profile
Researched: 2026-10-16 (`docs/research/roster-audit-language-slice-k.md` §3a, §4); laid out on
2026-10-17 as Linear's settings, from Linear's own screenshots (`_components/settings.md`). Confidence:
high for the sections, their actions and the layout.

## Purpose in Granite
Each person's own settings, whatever their role (the read-only accountant too: these change only
their own account): their language, their password, their authenticator and recovery codes, their
passkeys and the outside accounts they sign in with.

## Hierarchy
Laid out as Linear's settings (`_components/settings.md`): the shared header, then sections in the
centred column, each section's rows in a rounded bordered panel.
1. **Page header:** "Settings" above, H1 "Your account"; under it the person's name, then their email
   and role, then (demo) the demo line.
2. **Preferences** section (Linear's Preferences "General": rows in a panel): rows — **Appearance**
   (System, Light, Dark; Geist, GitHub and Linear offer exactly these three, saved when chosen;
   decision 0046) and **Language**
   over its muted line (it sets their screens, their sign-in page and the emails Granite sends them;
   Square), the select (English, Español) at the row's right, saved when chosen (Slack's Language).
3. **Password** section (GitHub "Change password"), the muted line under the heading saying when it was
   last changed: a panel holding **Current password**, **New password** (the rule under it), **Confirm
   new password**, label over a full-width field (Linear's SAML setup); the panel's foot holds **Update
   password** at the right. A person with no password yet (a demo person) sees no current-password
   field and the button says **Set password**.
4. **Authenticator** section (GitHub's two-factor methods, as Linear rows):
   - Off: one row — **Authenticator app** over "Off…" (and that their role needs it, for the Owner and
     Coordinators), **Set up authenticator** at the right as a text action; it opens the three-part
     setup (the same component as `sign-in/setup.md`) in the panel.
   - On: two rows — **Authenticator app** over "On since <date>" and what **Set up again** is for (a new
     phone; the old authenticator works until the new one is verified), **Set up again** at the right;
     **Recovery codes** over how many are left, **Make new recovery codes** at the right (a confirmation
     says the old ones stop working; then the new ten with Download, Print, Copy and **I have saved my
     recovery codes**).
5. **Passkeys** section (GitHub "Passkeys" under "Password and authentication"; passkeys.dev
   "Bootstrapping": the account's settings, once signed in, are where a passkey is added):
   - The muted line under the heading: what a passkey is (the device's fingerprint, face or screen lock
     instead of the password and code) and that it counts as both steps; **Add a passkey** at the
     heading's right (Linear's add action beside a section heading).
   - **The list** in the panel (GitHub's list of registered passkeys, each with a delete control beside
     it; laid out as Linear's SAML domains: a tile, the name over when it was added): one row per passkey
     — a key in a 32px tile, its name (from its device type: synced, or on one device — GitHub's
     "Synced" label) over when it was added and when it was last used (or not yet), **Remove** at the
     right in the destructive colour. None yet: the panel's one muted row says so (Linear's empty panel).
6. **Connected accounts** (decision 0033; Vercel's "Login Connections" in the account's Authentication
   settings, one connection per outside service; laid out as Linear's notification methods: a 32px tile,
   the name over its state): the muted line under the heading says what they are (another way to sign
   in; the authenticator code is still asked when the role needs it); one row each for **Google** and
   **Microsoft** (shown when that way in is offered), the provider's own mark in the tile:
   - Not connected: "Not connected" under the name, **Connect** at the right — confirm it's them, then
     the provider (the demo's stand-in in the demo), then back here with a toast.
   - Connected: the account's email as the provider gave it and "Connected <date>" under the name, and
     **Disconnect** at the right in the destructive colour (a confirmation; confirm it's them first).
7. **Sign out:** a last panel of one row (Linear's "Workspace access"): "Sign out of Granite in this
   browser", **Sign out** at the right.

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
  Setting a first password (a person who joined with Google or Microsoft) confirms it's them first,
  as any new way in does (decision 0033, review L3).
- Connect → back from the provider with a toast: connected; or already connected to another
  Granite person; or the provider did not sign them in.

## States
- Wrong current password, the passwords differ, or the rule is broken: a message under the field.
- Demo person: the authenticator and password can be tried; nothing is sent anywhere.
- Saving: the button shows it is working.
- Passkeys: the person closes the browser's prompt or cancels "confirm it's you" — nothing is said;
  this device already holds one of their passkeys, the browser cannot make passkeys, the passkey is
  refused, they already have 20 (the most), or passkeys are not set up on this server — one line under
  Add a passkey; a wrong password or code — said in the confirmation, which stays open; adding — the
  button says so.

## Look (checked against Linear's screenshots, 2026-10-17)
As `_components/settings.md`: 688px column; Preferences' row 60px with the select at the right; text
actions (Set up authenticator, Set up again, Make new recovery codes, Connect, Sign out) as Linear's
plain-text actions; Remove and Disconnect in the destructive colour (Linear's "Leave workspace").
Remaining differences: the title keeps the app's 28px bold (rule 2) where Linear's is 24px medium; our
type is 14px where Linear's is 13px (lengths scaled to match).

## Never copy
GitHub's, Slack's, Square's, passkeys.dev's or Linear's wording, icons, colors or logos (the key is
lucide's icon).

## Loading and errors (slice o)
- Loading: the page's outline in the settings shape (`_components/loading.md`); buttons that start
  work show a spinner in place of their icon (Primer Button `loading`).
- A failure: the frame stays; the failed content's place says so with "Try again"
  (`_components/error.md`).

Deviations allowed: none
