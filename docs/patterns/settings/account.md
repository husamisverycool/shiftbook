# Pattern: Your account (`/settings/account`)

Status: adopted — slice (k) plan, decisions K1 and K7 (2026-10-16, under the owner's "just keep going")
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
Researched: 2026-10-16 (`docs/research/roster-audit-language-slice-k.md` §3a, §4). Confidence: high
for the sections and their actions; the page's spacing is not documented.

## Purpose in Shiftbook
Each person's own settings, whatever their role (the read-only accountant too: these change only
their own account): their language, their password, their authenticator and recovery codes.

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
5. **Connected accounts** (decision 0033; Vercel's "Login Connections" in the account's
   Authentication settings, one connection per outside service): one line on what they are (another
   way to sign in; the authenticator code is still asked when the role needs it); one row each for
   **Google** and **Microsoft** (shown when that way in is offered), the provider's own mark and name:
   - Not connected: **Connect** — confirm it's them, then the provider (the demo's stand-in in the
     demo), then back here with a toast.
   - Connected: the account's email as the provider gave it, "Connected <date>", and **Disconnect**
     (a confirmation; confirm it's them first).
6. **Sign out** (a secondary button at the bottom).

## Interactions
- Set up authenticator, Set up again and Make new recovery codes first ask the person to confirm it's
  them when they have not given their password or a code in the last 15 minutes (GitHub's sudo mode;
  `_components/confirm-access.md`).
- Language → saved at once; the page reloads in that language.
- Update password → saved; the other places they were signed in are signed out; a toast says so.
- Connect → back from the provider with a toast: connected; or already connected to another
  Shiftbook person; or the provider did not sign them in.

## States
- Wrong current password, the passwords differ, or the rule is broken: a message under the field.
- Demo person: the authenticator and password can be tried; nothing is sent anywhere.
- Saving: the button shows it is working.

## Never copy
GitHub's, Slack's or Square's wording, icons, colors or logos.

Deviations allowed: none
