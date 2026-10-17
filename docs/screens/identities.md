# Decision 0033 screens compared with their pattern files

Captured 2026-10-16 in demo mode (1280×860, full page), through the demo's stand-in providers. ✓ =
matches the pattern file. Avery Quinn is an invented person invited during the capture.

### Sign in — `docs/patterns/sign-in.md` (items 5–6 and the new notices)
Screens: `identities/i01-sign-in.png`, `i02-sign-in-notice.png`.
- ✓ "Email me a sign-in code" as a quiet link under the form (Linear's "Continue with Email").
- ✓ A rule with "or continue with", then Notion's two-column tiles: Google and Microsoft with each
  provider's own mark, SSO. (The Passkey tile is decision 0032's and stays off on this branch.)
- ✓ A refusal from a provider comes back as the notice above the ways in (`i02`: no member uses that
  account).

### The demo's stand-in provider — `docs/patterns/sign-in/demo-provider/[provider].md`
Screens: `i03-demo-provider-microsoft.png`, `i04-demo-provider-es.png`.
- ✓ H1 "Demo sign-in: <provider>", the line saying it stands in for that provider and nothing leaves
  Shiftbook; "Choose an account" with each demo person's name over their email, then "Someone who is
  not a member"; Cancel. Shiftbook's own frame and wording: nothing of Google's or Microsoft's.
- ✓ Spanish (`i04`).

### Sign in with SSO — `docs/patterns/sign-in/sso.md`
Screens: `i05-sso.png`, `i06-sso-not-set-up.png`.
- ✓ H1, the line, Work email, Continue (full width), Back to sign in.
- ✓ No SSO for the email: the message in place with "Sign in another way" and "Email me a sign-in
  code" (`i06`); the same for an unknown email and a member without SSO.

### Email me a sign-in code — `docs/patterns/sign-in/email.md`
Screens: `i07-email-code.png`, `i08-email-code-sent-wrong.png`, `i09-email-code-es.png`.
- ✓ Step 1: H1, the line, Email, Send code, Back to sign in.
- ✓ Step 2 on the same page: "Check your email" with the same words whatever the address; the
  six-digit field (sends itself at six digits), Sign in; a wrong code's message in place (`i08`);
  "Send a new code" and "Use a different email"; demo only, the demo mailbox's copy of the email.
- ✓ Spanish (`i09`).

### Your account › Connected accounts — `docs/patterns/settings/account.md` §5
Screens: `i10-account-connected-accounts.png`, `i11-account-google-connected.png`,
`i12-account-disconnect-dialog.png`.
- ✓ After the authenticator, before Sign out: the heading, the one line, one row each for Google and
  Microsoft with the provider's mark and name; "Not connected" and Connect.
- ✓ Connected (`i11`): the email the provider gave and "Connected <date>", Disconnect; the toast on
  the way back from the provider.
- ✓ Disconnect asks first (`i12`).
- Difference: Vercel lists its connections inside its Authentication page among passkeys; here the
  rows sit in one bordered list (the shadcn base), which Vercel's documentation does not describe.

### Settings › Single sign-on — `docs/patterns/settings/sso.md`
Screens: `i13-sso-settings.png`, `i14-sso-settings-es.png`, `i17-agency-menu.png`.
- ✓ Page header ("Settings", H1, the line); demo note.
- ✓ The status row: the switch with "Single sign-on", On/Off and its line.
- ✓ "For your identity provider": the sign-in redirect address, read-only, Copy, the hint.
- ✓ "Provider details": Issuer address with its hint, Client ID, the secret shown only as "Set, ends
  in ····abcd" with "Replace the secret" left empty to keep it; Save.
- ✓ The foot line: who changed it last, and when.
- ✓ The agency menu lists "Single sign-on" after Members (`i17`).
- ✓ Spanish (`i14`).

### Accept an invite — `docs/patterns/invite/[token].md`
Screens: `i15-invite-providers.png`, `i16-invite-mismatch.png`.
- ✓ "Join with Google" / "Join with Microsoft" as full-width outlined buttons with the provider's
  mark, a rule with "or", then the password form.
- ✓ Back from the provider with another account's email: the notice above the buttons (`i16`).

## After the security review (2026-10-17)

### Confirm it's your email — `docs/patterns/sign-in/link.md`
Screens: `i18-link-proof.png`, `i19-link-proof-wrong.png`, `i20-link-proof-es.png`.
- ✓ H1 "Confirm it's your email", the line naming the account being connected and the hinted address
  ("b***@…", never its length), the six-digit field (sends itself at six digits), Confirm.
- ✓ A wrong code's message in place (`i19`); "Send a new code"; demo only, the demo mailbox's copy —
  the code email names what is being connected and says never to share the code.
- ✓ Spanish (`i20`).

### Settings › Single sign-on, not the Owner — `docs/patterns/settings/sso.md`
Screen: `i21-sso-not-for-role.png`.
- ✓ Only the header and the "not for your role" state the other Owner settings use (a lock, "Single
  sign-on is for the Owner"); the agency menu has no Single sign-on item for them (Playwright).
- The emailed "confirm it's you" in the shared dialog (`_components/confirm-access.md`) is shown only to
  a person with no password and no authenticator after 15 minutes; it is covered by the integration
  tests, not a screenshot.
