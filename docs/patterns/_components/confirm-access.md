# Pattern: Confirm it's you (shared dialog)

Status: adopted — slice (k), after the second-opinion review of sign-in (2026-10-16)
Reference product and screen: GitHub — sudo mode (before a protected high-impact action, even when
signed in, GitHub asks to authenticate again: the password, or a 2FA code then "Verify"; afterwards
such actions need no prompt for a while, and each one resets the timer; recovery codes and
organization invitations are among the protected actions)
Source URL: https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/sudo-mode
Researched: 2026-10-16. Confidence: high for when it asks and what it accepts; the dialog's layout is
shown in screenshots, not described.

## Purpose in Shiftbook
A stolen or forgotten-open session must not change how someone signs in, or the agency's people,
without the password or a code (decision 0025). Asked before: setting up or replacing an
authenticator, making new recovery codes, inviting, changing roles, suspending; removing a passkey;
and (step 2) revealing an SSN. Adding a passkey asks every time, the password or code going with that
passkey's request (decision 0032).

## Hierarchy
1. **Title** "Confirm it's you".
2. One line: the change needs the password (or, for a person with an authenticator, a code from it or
   a recovery code), given within the last 15 minutes.
3. **Field**: Password, or Code (six digits, or a recovery code).
4. **Confirm** (primary) and **Cancel**.
5. A refusal in place: wrong, or too many tries (locked for a while).

## Interactions
- Enter submits. Confirm → the dialog closes and the change goes ahead at once (no second click).
- Cancel or Escape → nothing changes.
- Not asked again for 15 minutes in this session (GitHub: two hours); never in the demo's shared
  "Continue as" sessions (they have neither a password nor a code).

## Never copy
GitHub's wording, icons, colors or logos.

Deviations allowed: none
