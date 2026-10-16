# Pattern: The sign-in code email

Status: adopted — decision 0033 (2026-10-16)
Reference product and screen: Linear — the login email ("copy the code provided in the email and
paste it into the Enter code field"); Vercel — the six-digit one-time code sent to the email typed
Source URL: https://linear.app/docs/login-methods
Source URL: https://vercel.com/docs/accounts
Researched: 2026-10-16. Confidence: medium — neither publishes the email's text; the order follows
the password reset email (`sign-in-links.md`).

## Purpose in Shiftbook
The six-digit code that signs a member in without a password (`/sign-in/email`).

## Hierarchy
1. Sender: "{agency} via Shiftbook"; replies go to the agency's email address.
2. Subject: the code, then "is your Shiftbook sign-in code" (the code readable in the inbox list).
3. Greeting with their name.
4. One line: someone asked to sign in to the agency with this email.
5. The code, on its own line.
6. It works once, for 10 minutes.
7. If it was not them, they can ignore it; nobody can sign in without the code.
8. Footer: sent by Shiftbook on behalf of the agency.

## States
- Language: the person's own language (English or Spanish).
- The copy Shiftbook keeps hides the code (only the person's inbox has it).

## Never copy
Linear's or Vercel's wording, icons, colors or logos.

Deviations allowed: none
