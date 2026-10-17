# 0031 — Sign-in and the first run: Linear's way in, shadcn's mark, samples in one click

Status: accepted
Date: 2026-10-16

## Context
The owner (2026-10-16): the sign-in and the onboarding must be "very sophisticatedly made",
"seamless", pieced together "based off of inspiration, as well as what other products do". Slice
(k) built sign-in as GitHub's page under a header bar with the product's name; a stranger trying the
demo met a password form first and the demo people below it, then had to download a zip of sample
timesheets from the banner, unzip it and drop the files in.

The sign-in pages themselves were studied as they render today (screenshots taken 2026-10-16 for
study only, never copied): Linear (`linear.app/login`), Vercel (`vercel.com/login`), Stripe
(`dashboard.stripe.com/login`), GitHub (`github.com/login`), Notion (`notion.so/login`) and Mercury
(`app.mercury.com/login`); with shadcn/ui's documented login and sidebar blocks
(`ui.shadcn.com/blocks/login`, `ui.shadcn.com/blocks/sidebar`), the app's neutral base.

What they share:
- one narrow column on a light page — Linear and Vercel on a light grey, the form straight on it;
- the product's mark above "Log in to …" (Linear, GitHub, Notion), or at the top left (Stripe,
  Vercel, Mercury);
- the main way in as one full-width filled button, the other ways under it as outlined buttons of
  the same size (Linear: "Continue with Google" filled, then email, SSO, passkey);
- an "or" rule between ways in (GitHub, Stripe, Notion, Vercel);
- a quiet footer: the language choice at the bottom (Notion), and nothing else to distract.

## Decision
1. **Frame** (`_layouts/auth.md`): the page in the app's sidebar tone (Linear's grey), no header bar;
   the Shiftbook mark centred at the top of the column; the language switch at the foot of the page
   (Notion).
2. **The mark** (`brand-mark.tsx`; replaced by Granite's own mark, decision 0034): shadcn/ui's blocks set a product as a small rounded square in
   the primary color holding one icon (their "Acme Inc." placeholder); Shiftbook's holds lucide's
   book-with-a-check. The same square, with the agency's initials, starts the sidebar's agency menu
   (Linear's workspace menu; shadcn's team switcher).
3. **Sign in** (`sign-in.md`): the heading centred. In demo mode the demo is the main way in, as
   Linear puts its main provider first: "Continue as Demo Owner" filled, the three other demo people
   outlined under it, each with their initials and role; then "or" and the email form. Outside demo
   mode the form is the page.
4. **Samples in one click** (`convert.md`, `bank/import.md`): in demo mode the upload step offers
   "Use the sample timesheets" and the bank import "Use the sample bank file", which put the demo's
   files into the same upload as a dropped file (the same code path; the download links stay for
   anyone who wants the files). The setup guide's demo line points at that button.

## Alternatives considered
- Stripe's white card on a decorated background: the decoration is Stripe's own art.
- A first-run welcome screen before Home (Linear's onboarding steps): one more screen between a
  stranger and the work; Home's setup guide already walks the week.
- Keeping GitHub's header bar: none of the six current pages has one.

## Consequences
- Every page before the app (sign in, the code, authenticator setup, reset, invite) shares the frame
  and a centred heading.
- No reference's logo, art, colors or wording is used; the mark is lucide's icon on the app's own
  primary color.
