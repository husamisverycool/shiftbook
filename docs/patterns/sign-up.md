# Pattern: Create your agency (`/sign-up`)

Status: adopted — decision 0036 (2026-10-17); the email step raised in slice ab, onboarding (2026-10-20;
`.claude/plans/onboarding.md`).
Reference product and screen: Stripe — "Create your Stripe account" (dashboard.stripe.com/register: the
heading at the top left of one card, then labelled fields one under another — Email, Full name, …— the
primary "Create account" button full width, and "Already have an account? Sign in" centred at the foot);
Linear — signup ("Create your workspace", then "What's your email address?": one field, one button,
"Back to signup" under it; the product's mark above the heading); Vercel — signup ("Continue with
Email": one field, the button full width, a hairline, a link back to the other options); Stripe —
creating an account sends an email to verify the address before the account is used
Source URL: https://dashboard.stripe.com/register
Source URL: https://linear.app/signup
Source URL: https://vercel.com/signup
Source URL: https://docs.stripe.com/get-started/account
Source URL: https://linear.app/docs/login-methods
Source URL: https://slack.com/help/articles/212681477-Sign-in-to-Slack
Source URL: https://supabase.com/docs/guides/auth/auth-email-passwordless
Researched: 2026-10-17 from screenshots taken that day (Stripe's register form, Linear's and Vercel's
signup and their email steps; kept outside the repository). Confidence: high for the fields, their
order, the full-width button and the "already have an account" line; the email step's wording is
not copied.

## Purpose in Tabulado
An agency's first person (who becomes its Owner) creates the agency themselves (decision 0036). Live
mode only: the demo uses its own made-up agency.

## Hierarchy
Inside the sign-in frame (`_layouts/auth.md`: the mark, one narrow column, the language at the foot).
1. **H1** "Create your agency", centred (Linear centres its heading under the mark; Stripe's card is
   wider and left-aligned — Tabulado keeps the frame's centred headings); one muted line under it: the
   agency starts with a free trial when there is one, and the Owner sets a password and an
   authenticator next.
2. **Form** (Stripe's register form, its fields in this order):
   1. **Work email** (email keyboard, autocomplete "email").
   2. **Your name** (autocomplete "name").
   3. **Agency name** (autocomplete "organization") — in Stripe's place for its extra field (Country).
   4. **Create agency** (primary, full width).
   5. A refusal in place under the button when there is one.
3. **Already have an account? Sign in** — one muted line, centred, "Sign in" a link (Stripe's and
   Linear's foot line).
4. **After sending** (the same page, the form replaced; Slack's confirm-your-email screen, Linear's code
   step): H1 "Check your email"; one line: a six-digit code was sent to the address (bold), it works for
   an hour, and **Wrong email?** (a quiet button that brings the form back, the fields kept); six code
   boxes in a row (Slack's); a refusal under them when there is one; **Open Gmail** and **Open Outlook**
   (outline buttons side by side, each opening that mail site in a new tab); one muted line: nothing
   arrived → check spam, or **send a new code** (a quiet button, waiting 60 seconds after each send with
   the seconds shown — one email a minute, as the email-link reference allows); **Back to sign in** at
   the foot.

## Interactions
- Enter submits. Focus starts in Work email.
- Create agency → the same answer for every address (no one learns which emails have an account);
  an address that already signs in to Tabulado receives a note instead of a code.
- Code boxes: typing moves to the next box, Backspace to the one before, pasting fills all six; the
  sixth digit sends it (Slack). Right → the password step; the email's button does the same in one click.

## States
- **Demo:** the heading, then one notice in place of the form: the demo uses its own made-up agency,
  so no agency is created here; **Continue as a demo person** (primary, full width) opens the sign-in
  page with the demo people; "Already have an account? Sign in" stays.
- A field empty or the email not an address: a message under the button; nothing is sent.
- Too many tries (5 an hour for one email, 10 an hour from one place): the message says to wait an hour.
- The email could not be sent: the message says so and to try again in a minute (never "Check your
  email" for an email that did not go).
- Wrong code: "That code isn't right" and the boxes clear; five wrong codes, or an hour gone: the code
  no longer works, send a new one.
- Sending: the button shows it is working and cannot be pressed twice.
- Already signed in: the page still opens (someone may create a second agency with another email).

## Never copy
Stripe's, Linear's or Vercel's wording, icons, colors, illustrations or logos.

Deviations allowed: none
