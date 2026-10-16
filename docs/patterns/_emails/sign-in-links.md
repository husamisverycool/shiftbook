# Pattern: Invite and password reset emails

Status: adopted — slice (k) plan, decision K1 (2026-10-16, under the owner's "just keep going")
Reference product and screen: Stripe — team invites (an email "with the steps to accept the
invitation"; it expires after 10 days); Linear — invites ("an invite link via email along with steps
to join"); GitHub — the password reset email (a link that must be used in time)
Source URL: https://docs.stripe.com/get-started/account/teams
Source URL: https://linear.app/docs/invite-members
Source URL: https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/updating-your-github-access-credentials
Researched: 2026-10-16. Confidence: medium — none of them publishes the email's text; the order
below follows the approval emails' (`approval-request.md`), which follow Stripe's invoice email.

## Purpose in Shiftbook
The two emails that carry a one-time sign-in link: an invite to join the agency, and a password
reset. Plain text with a simple HTML copy; no images, no tracking, nothing loaded from other sites.

## Hierarchy (invite)
1. Sender: "{agency} via Shiftbook"; replies go to the agency's email address.
2. Subject: who invited them, to which agency, on Shiftbook.
3. Greeting with their name.
4. One line: who invited them, to which agency, with which role; the role's one-line description.
5. The link to accept the invite.
6. Until when the invite works (10 days), and that it is meant for them only.
7. If they did not expect it, they can ignore it.
8. Footer: sent by Shiftbook on behalf of the agency.

## Hierarchy (password reset)
1. Sender and replies as above.
2. Subject: reset your Shiftbook password.
3. Greeting with their name.
4. One line: someone asked to reset the password they use for the agency.
5. The link to choose a new password.
6. The link works once, for one hour.
7. If it was not them, they can ignore it; the password stays as it is.
8. Footer as above.

## States
- Language: the person's own language (English or Spanish).
- The copy Shiftbook keeps of either email hides the link (only the person's inbox has it).

## Never copy
Stripe's, Linear's or GitHub's wording, icons, colors or logos.

Deviations allowed: none
