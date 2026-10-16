# Pattern: Sign-in frame (`src/app/[locale]/(auth)/layout.tsx`)

Status: adopted — slice (k) plan (2026-10-16, under the owner's "just keep going")
Reference product and screen: GitHub — sign-in, two-factor sign-in, password reset and invitation
pages (a page of its own before the app opens: one narrow column, one task per page, no app
navigation); Linear — login page (the ways to sign in listed one under another); Square — the
person's language applies to the login page too
Source URL: https://docs.github.com/en/authentication/securing-your-account-with-two-factor-authentication-2fa/accessing-github-using-two-factor-authentication
Source URL: https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/updating-your-github-access-credentials
Source URL: https://linear.app/docs/login-methods
Source URL: https://squareup.com/help/us/en/article/5234
Researched: 2026-10-16 (`docs/research/roster-audit-language-slice-k.md` §3–4). Confidence: high
for "one task per page, before the app"; the exact widths and spacing are not documented.

## Purpose in Shiftbook
The frame around the pages a person sees before the app opens: sign in, the six-digit code, setting
up an authenticator when their role needs one, a password reset, accepting an invite. There is no
agency navigation here: the person is not signed in yet (or not all the way).

## Hierarchy
1. **Demo banner** (root frame, demo mode only) — unchanged.
2. **Header:** the product's name ("Shiftbook") on the left, and the language switch on the right
   (SPEC §20; Square: the language setting applies to the login page). The switch keeps the same
   page and changes only the language.
3. **Page content:** one narrow column centred on the page, the page's own pattern inside it.

## Interactions
- Language switch → the same page in the other language (a sign-in link keeps working).
- No link leads into the app from here; each page names its own way on (sign in, back to sign-in).

## States
- None of its own: each page handles its states.

## Never copy
GitHub's, Linear's or Square's wording, icons, colors or logos.

Deviations allowed: none
