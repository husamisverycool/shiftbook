# Pattern: Accept an invite (`/invite/[token]`)

Status: adopted — slice (k) plan, decisions K1 and K4 (2026-10-16, under the owner's "just keep going")
Reference product and screen: Stripe — team invites (an emailed invite with the steps to accept; it
expires after 10 days); GitHub — an invitation to an organization (the role it gives; when the
organization requires two-factor authentication, it is turned on before joining)
Source URL: https://docs.stripe.com/get-started/account/teams
Source URL: https://docs.github.com/en/organizations/managing-membership-in-your-organization/inviting-users-to-join-your-organization
Source URL: https://docs.github.com/en/organizations/keeping-your-organization-secure/managing-two-factor-authentication-for-your-organization/requiring-two-factor-authentication-in-your-organization
Researched: 2026-10-16 (`docs/research/roster-audit-language-slice-k.md` §3e). Confidence: high for
the expiry and the requirement; the invite page's layout is not described in text.

## Purpose in Shiftbook
The page the invite email links to: the invited person sets their password and joins the agency.

## Hierarchy
1. **H1** "Join <agency name>".
2. One line: who invited them and the role they will have (with the role's one-line description,
   the same as on the members page), and the email they will sign in with.
3. **Form:** **Password** (autocomplete "new-password"; the rule under it), **Confirm password**,
   **Join** (primary).
4. After joining: the authenticator setup page when the role needs one (GitHub: two-factor before
   access); otherwise straight into the app.

## Interactions
- Enter submits.

## States
- The invite is expired, used, cancelled or wrong: "This invite no longer works" — ask the agency's
  Owner to send it again; **Go to sign in**.
- The passwords differ, or the password breaks the rule: a message under the field.
- Submitting: the button shows it is working.

## Never copy
Stripe's or GitHub's wording, icons, colors or logos.

Deviations allowed: none
