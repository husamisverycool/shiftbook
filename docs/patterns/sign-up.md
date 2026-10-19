# Pattern: Create your agency (`/sign-up`)

Status: adopted — decision 0036 (2026-10-17)
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
4. **After sending** (the same page, the form replaced; Linear and Vercel move to their email step):
   H1 "Check your email"; one line: a link to finish was sent to the address (Stripe verifies the
   email first), it works once for 24 hours; one muted line: nothing arrived → check spam, or
   **Use a different email** (a quiet button that brings the form back, the fields kept); **Back to sign
   in** link at the foot.

## Interactions
- Enter submits. Focus starts in Work email.
- Create agency → the same answer for every address (no one learns which emails have an account);
  an address that already signs in to Tabulado receives a note instead of a link.

## States
- **Demo:** the heading, then one notice in place of the form: the demo uses its own made-up agency,
  so no agency is created here; **Continue as a demo person** (primary, full width) opens the sign-in
  page with the demo people; "Already have an account? Sign in" stays.
- A field empty or the email not an address: a message under the button; nothing is sent.
- Too many tries (3 an hour for one email, 10 an hour from one place): the message says to wait an hour.
- Sending: the button shows it is working and cannot be pressed twice.
- Already signed in: the page still opens (someone may create a second agency with another email).

## Never copy
Stripe's, Linear's or Vercel's wording, icons, colors, illustrations or logos.

Deviations allowed: none
