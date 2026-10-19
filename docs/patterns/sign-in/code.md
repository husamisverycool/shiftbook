# Pattern: The six-digit code (`/sign-in/code`)

Status: adopted — slice (k) plan, decision K1 (2026-10-16, under the owner's "just keep going")
Reference product and screen: GitHub — the two-factor step after the password (type the code from
the authenticator app, then Verify; "More options" → use a recovery code, then Verify)
Source URL: https://docs.github.com/en/authentication/securing-your-account-with-two-factor-authentication-2fa/accessing-github-using-two-factor-authentication
Source URL: https://docs.github.com/en/authentication/securing-your-account-with-two-factor-authentication-2fa/recovering-your-account-if-you-lose-your-2fa-credentials
Researched: 2026-10-16. Confidence: high for the steps and the recovery-code option.

## Purpose in Tabulado
The second step of signing in (SPEC §2: required for the Owner and Coordinators; anyone who set up
an authenticator uses it too).

## Hierarchy
1. **H1** "Enter your code".
2. One line: open the authenticator app and type the six-digit code it shows for Tabulado.
3. **Form:**
   1. **Code** field: six digits, numeric keyboard, autocomplete "one-time-code".
   2. **Verify** button (primary, full width).
   3. A refusal in place when there is one.
4. **More options** (GitHub "More options"): **Use a recovery code** — swaps the field for the
   recovery code field (ten characters, as written on the saved list) and back.
5. **Not you? Sign out** — ends this half-signed-in session and returns to sign in.

## Interactions
- The code submits on its own once six digits are typed (and with Enter).
- After the code: the page they were going to (or Convert timesheets). A recovery code used says how
  many are left on the next page.

## States
- Wrong code: the field cleared, a message; each wrong code counts (a right password never clears
  the count).
- Locked: ten wrong codes in 15 minutes lock the code for 15 minutes; the message says so.
- Five wrong codes, or ten minutes without the code: the half session ends — back to sign in with a
  notice.
- Submitting: the button shows it is working.

## Never copy
GitHub's wording, icons, colors or logos.

Deviations allowed: none
