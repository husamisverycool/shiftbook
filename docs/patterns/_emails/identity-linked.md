# Pattern: "An account was connected to your Shiftbook sign-in" email

Status: adopted — decision 0033, after its security review (H2c, 2026-10-17)
Reference product and screen: GitHub — the security notice it emails when something new can act as
the account ("A third-party OAuth application has been added to your account"): what was added, when,
where to review it, and what to do if it was not you; GitHub's security log and authorized
integrations pages are where the person reviews it
Source URL: https://docs.github.com/en/apps/oauth-apps/using-oauth-apps/authorizing-oauth-apps
Source URL: https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/reviewing-your-authorized-integrations
Source URL: https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/reviewing-your-security-log
Researched: 2026-10-17. Confidence: medium — GitHub's documentation names the notices and the pages
they point to, not their text; the order below follows those notices as received.

## Purpose in Shiftbook
Whenever a Google, Microsoft or agency SSO account is connected to a person — from Your account,
when joining with it, or at sign-in — the person is told by email, so a connection they did not make
is noticed at once.

## Hierarchy
1. Sender: "{agency} via Shiftbook"; replies go to the agency's email address.
2. Subject: which provider was connected to their Shiftbook account.
3. Greeting with their name.
4. One line: the provider account (its email when the provider gave one) can now sign them in to the
   agency on Shiftbook.
5. When it was connected (date and time, UTC).
6. The link to review it: Your account › Connected accounts.
7. If it was not them: disconnect it there and tell the agency's Owner.
8. Footer: sent by Shiftbook on behalf of the agency.

## States
- Language: the person's own language (English or Spanish).
- Nothing secret in it: the copy Shiftbook keeps is the same.

## Never copy
GitHub's wording, icons, colors or logos.

Deviations allowed: none
