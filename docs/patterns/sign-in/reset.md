# Pattern: Ask for a password reset (`/sign-in/reset`)

Status: adopted — slice (k) plan, decision K1 (2026-10-16, under the owner's "just keep going")
Reference product and screen: GitHub — requesting a new password (enter the email address, "Send
password reset email"; a link arrives by email and must be used in time)
Source URL: https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/updating-your-github-access-credentials
Researched: 2026-10-16. Confidence: high for the steps.

## Purpose in Shiftbook
A person who forgot their password gets a one-time link by email (one hour, one use).

## Hierarchy
1. **H1** "Reset your password".
2. One line: type the email you sign in with; a link to choose a new password is sent there.
3. **Form:** **Email** field; **Send reset link** button (primary, full width).
4. **Back to sign in** link.
5. After sending (the same page, the form replaced): **Check your email** — the link was sent if an
   account uses that address; it works once, for one hour. **Back to sign in**.
   - Demo only: the demo sends no email; the page shows the email's copy from the demo mailbox with
     its link, so the reset can be tried (decision K3).

## Interactions
- Enter submits. The email typed on the sign-in page is carried over.

## States
- Whatever the address, the same answer (no one can learn which emails have an account).
- Submitting: the button shows it is working.

## Never copy
GitHub's wording, icons, colors or logos.

Deviations allowed: none
