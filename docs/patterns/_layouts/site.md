# Pattern: Website layout (public, tabulado.com)

Status: adopted — slice aa (2026-10-20)
Reference product and screen: Resend's and Attio's marketing header (sticky, transparent at the top,
a blurred background and a hairline border once the page scrolls), Linear's and Mercury's header
contents (wordmark, a few plain links, the demo one click away, one filled button), Linear's mobile
menu (a labelled two-bar button opening a full-width panel), Linear's skip link, and Linear's footer
columns with Stripe's footer language choice and Mercury's footnotes at the very bottom.
Source URL: https://resend.com
Source URL: https://attio.com
Source URL: https://linear.app
Source URL: https://mercury.com
Source URL: https://stripe.com/billing
Researched: 2026-10-20 (`docs/research/website-slice-aa.md`). Confidence: medium (header classes read
from the pages' HTML; section padding not measurable without screenshots).

## Hierarchy
1. A "Skip to content" link, visible only when focused (Linear).
2. The header: sticky, 60px tall, in a 1280px container with 24px sides (Resend). Transparent at the
   top; after 8px of scroll the page background at 95% with a medium backdrop blur and a 1px bottom
   border fade in (Attio `bg-…/95 border-b`, Resend's blur layer).
   - Left: the Tabulado logo (mark and wordmark), to the home page.
   - Centre-left: Product (to the home page's how-it-works), Pricing, Security, Free tools.
   - Right: the language (English / Español, to the same page in the other language — USWDS, Stripe),
     "Log in" as a text link, "Try the demo" as a text link when a demo address is set (Mercury), and
     "Start free" as the one filled button.
   - Below 768px: the logo, "Start free", and a labelled menu button (two bars that become an X) that
     opens a full-width panel with every link (Linear, Resend `aria-expanded`).
3. The page.
4. The footer (Linear): the logo and one line about the product; columns Product (Overview, Pricing,
   Security), Free tools (Illinois 720-hour checker, the demo when set), Account (Log in, Start free,
   Contact when an address is set); the language choice (Stripe's footer picker); then the footnotes
   (Mercury): Tabulado never moves money, and nothing on the site is legal advice.

## Interactions
- Links change colour on hover over Primer's micro duration; every link and button shows the focus ring.
- The header's background and border fade with Primer's short duration and hover easing.
- The mobile panel opens with the enter motion and closes with the exit motion; Escape and a link press
  close it; focus returns to the menu button.
- On the website's own host, sign-in and sign-up go to the app's address (SHIFTBOOK_APP_URL).

## States
- No session needed; a signed-in person sees the same pages.
- No demo address set: "Try the demo" and the footer's demo link are not shown.
- No contact address set: the footer's Contact link is not shown.

Deviations allowed: none
