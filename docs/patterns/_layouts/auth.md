# Pattern: Sign-in frame (`src/app/[locale]/(auth)/layout.tsx`)

Status: adopted — slice (k) plan; revised by decision 0031 (2026-10-16, the owner's "very
sophisticated … seamless" sign-in)
Reference product and screen: Linear — login page (light grey page, the mark above "Log in to
Linear", the ways in as full-width buttons); Vercel — login page (one narrow column on a light page);
Notion — login page (the language choice at the foot); GitHub — sign-in, two-factor sign-in,
password reset and invitation pages (one task per page, before the app); Square — the person's
language applies to the login page too. The mark is Tabulado's own (decision 0034), shown bare, in the
text colour, as Linear and Notion show theirs
Source URL: https://docs.github.com/en/authentication/securing-your-account-with-two-factor-authentication-2fa/accessing-github-using-two-factor-authentication
Source URL: https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/updating-your-github-access-credentials
Source URL: https://linear.app/docs/login-methods
Source URL: https://linear.app/login
Source URL: https://vercel.com/login
Source URL: https://www.notion.so/login
Source URL: https://ui.shadcn.com/blocks/login
Source URL: https://squareup.com/help/us/en/article/5234
Researched: 2026-10-16 (`docs/research/roster-audit-language-slice-k.md` §3–4). Confidence: high
for "one task per page, before the app"; the exact widths and spacing are not documented.

## Purpose in Tabulado
The frame around the pages a person sees before the app opens: sign in, the six-digit code, setting
up an authenticator when their role needs one, a password reset, accepting an invite. There is no
agency navigation here: the person is not signed in yet (or not all the way).

## Hierarchy
1. **Demo banner** (root frame, demo mode only) — unchanged.
2. **The page** in the app's light sidebar tone (Linear's and Vercel's light page), no header bar.
3. **One narrow column** (about 22rem), its top a little below the page's top: the Tabulado mark
   (44px, the text colour, no tile behind it; decision 0034) centred (Linear, GitHub, Notion: the product's mark above the heading), then the page's own
   pattern; every page's heading centred.
4. **The foot of the page:** the language switch — a globe, then English · Español, the current one
   darker (Notion's "Language" at the foot; SPEC §20; Square: the language setting applies to the
   login page). The switch keeps the same page and changes only the language.

## Interactions
- Language switch → the same page in the other language (a sign-in link keeps working).
- No link leads into the app from here; each page names its own way on (sign in, back to sign-in).

## States
- None of its own: each page handles its states.

## Never copy
GitHub's, Linear's, Vercel's, Notion's or Square's wording, icons, colors or logos; any product's
background art.

Deviations allowed: none
