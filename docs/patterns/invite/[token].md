# Pattern: Accept an invite (`/invite/[token]`)

Status: adopted — slice (k) plan, decisions K1 and K4 (2026-10-16, under the owner's "just keep going")
Reference product and screen: Stripe — team invites (an emailed invite with the steps to accept; it
expires after 10 days); GitHub — an invitation to an organization (the role it gives; when the
organization requires two-factor authentication, it is turned on before joining)
Source URL: https://docs.stripe.com/get-started/account/teams
Source URL: https://docs.github.com/en/organizations/managing-membership-in-your-organization/inviting-users-to-join-your-organization
Source URL: https://docs.github.com/en/organizations/keeping-your-organization-secure/managing-two-factor-authentication-for-your-organization/requiring-two-factor-authentication-in-your-organization
Source URL: https://linear.app/docs/login-methods
Source URL: https://developers.google.com/identity/branding-guidelines
Source URL: https://learn.microsoft.com/en-us/entra/identity-platform/howto-add-branding-in-apps
Researched: 2026-10-16 (`docs/research/roster-audit-language-slice-k.md` §3e). Confidence: high for
the expiry and the requirement; the invite page's layout is not described in text.

## Purpose in Tabulado
The page the invite email links to: the invited person sets their password and joins the agency.

## Hierarchy
1. **H1** "Join <agency name>".
2. One line: who invited them and the role they will have (with the role's one-line description,
   the same as on the members page), and the email they will sign in with.
3. **Join with Google** / **Join with Microsoft** (decision 0033; Linear lets a member in with Google
   or a password alike): full-width outlined buttons with the provider's own mark, when that way in is
   offered; then a rule with "or".
4. **Form:** **Password** (autocomplete "new-password"; the rule under it), **Confirm password**,
   **Join** (primary).
5. After joining: the authenticator setup page when the role needs one (GitHub: two-factor before
   access); otherwise straight into the app.

## Interactions
- Enter submits.
- Join with Google or Microsoft → the provider → back joined, only when the provider confirms an
  email equal to the invited one (decision 0033); that account is then connected to them.

## States
- The invite is expired, used, cancelled or wrong: "This invite no longer works" — ask the agency's
  Owner to send it again; **Go to sign in**.
- The passwords differ, or the password breaks the rule: a message under the field.
- Back from the provider refused: a notice above the buttons — the account's email is not the
  invited one, or the provider did not confirm it, or the provider did not sign them in.
- Submitting: the button shows it is working.

## Never copy
Stripe's or GitHub's wording, icons, colors or logos.

Deviations allowed: none
