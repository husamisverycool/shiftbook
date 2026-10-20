# Pattern: Website layout (public, tabulado.com)

Status: adopted — slice aa, second design (2026-10-20); header raised in the sixth design (Linear's bar with
Stripe's menu, `.claude/plans/website-v6.md`).
Reference product and screen: Mercury's header (fixed over a dark photograph, see-through with white
text, the logo at the left, plain links in the centre, "Log in" and one accent pill at the right) with
Ramp's and Stripe's light blurred bar once the page scrolls; Linear's mobile menu; Mercury's dark footer
with its "Disclaimers and footnotes" block (label at the left, numbered notes at the right) and Stripe's
footer language choice.
Source URL: https://mercury.com
Source URL: https://ramp.com
Source URL: https://stripe.com
Source URL: https://linear.app
Researched: 2026-10-20 (`docs/research/website-visual-slice-aa.md`). Confidence: high.

## Hierarchy
1. "Skip to content", visible only when focused.
2. Header, fixed, 64px: logo; "Product ▾", "How it works ▾", Pricing, Security, Free tools in the centre;
   the other language, Log in and the accent "Start free" pill at the right. Over the opening photograph it
   is see-through with white text; after 24px of scroll a frosted bar with a hairline fades in, dark with
   white text over the page's dark bands and paper with dark text over its light ones (the band under
   the bar decides). It slides up out of view while the reader scrolls down past the first screen and
   returns on any scroll up. "Product" and "How it works" open Stripe's one floating panel (dark, 12px
   radius, hairline ring, a caret under the open trigger): a mono title, items each with an icon tile, a
   title and a grey line (two columns for Product, one for How it works), and a footer strip with an arrow
   link. Moving between the two triggers slides the panel and changes its width and height while the
   contents crossfade. Below 1024px: logo, "Start free" and a two-bar menu button opening a full-width
   light panel with every link.
3. The page (each page opens with a dark band).
4. Footer, dark (Mercury): logo and one line; columns Product, Free tools, Account; a hairline; at the
   left "Disclaimers and footnotes" and the language choice, at the right the numbered notes (1 never
   moves money; 2 not legal advice; 3 sample data; 4 encryption; 5 blacked out before reading; 6 the
   look-up log; 7 the dated rule books), each the target of a footnote mark on the page, the
   photographer's credit (with Adrian Sulyok's requested link) and the copyright.

## Interactions
- Colours change over the slow hover timing; every link shows a focus ring.
- Menus: hover opens after a short pause and closes a moment after the pointer leaves the header; click,
  Enter, Space or ↓ open (↓ moves focus into the panel); Escape closes and returns focus to the trigger.
- The mobile panel closes on Escape or a link press; focus returns to the button.
- On the website's own host, sign-in and sign-up go to the app's address.

## States
- No demo address: the demo links are hidden. No contact address: Contact is hidden.
- A dark system setting does not change the website's palette.

Deviations allowed: none
