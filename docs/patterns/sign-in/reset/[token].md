# Pattern: Choose a new password from the reset link (`/sign-in/reset/[token]`)

Status: adopted — slice (k) plan, decision K1 (2026-10-16, under the owner's "just keep going")
Reference product and screen: GitHub — the password reset link (when two-factor authentication is
on, the code or a recovery code is asked first, then Verify; then "Password" and "Confirm password",
then "Change password")
Source URL: https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/updating-your-github-access-credentials
Researched: 2026-10-16. Confidence: high for the order of the steps and the fields.

## Purpose in Granite
The page the reset email links to. A person with an authenticator proves it first, so whoever reads
their email alone cannot change their password.

## Hierarchy
1. **H1** "Choose a new password", with the email it is for under it.
2. **Step 1, only for a person with an authenticator** (GitHub: the two-factor prompt first): the
   code field (or **Use a recovery code**), **Verify**.
3. **Step 2:** **New password** (autocomplete "new-password"; the rule under it: at least 15
   characters, any characters, not the email), **Confirm password**, **Change password** (primary).
4. After the change: straight into the app, signed in (the other sessions end).

## Interactions
- Enter submits each step.

## States
- The link is expired, used or wrong: "This link no longer works" with **Ask for a new link** (to
  `/sign-in/reset`) and **Back to sign in**.
- Wrong code: as on the code page (counts toward the lock).
- The passwords differ, or the new one breaks the rule: a message under the field.
- Submitting: the button shows it is working.

## Never copy
GitHub's wording, icons, colors or logos.

Deviations allowed: none
