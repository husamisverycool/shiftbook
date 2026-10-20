# Pattern: Website layout (public, tabulado.com)

Status: adopted — slice aa, second design (2026-10-20)
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
2. Header, fixed, 64px: logo; Product, Pricing, Security, Free tools in the centre; the other language,
   Log in and the accent "Start free" pill at the right. Over the dark opening band of every page it is
   see-through with white text; after 24px of scroll a light bar (paper at 85%, blur, hairline) fades in
   and the text turns dark. Below 1024px: logo, "Start free" and a two-bar menu button opening a
   full-width light panel with every link.
3. The page (each page opens with a dark band).
4. Footer, dark (Mercury): logo and one line; columns Product, Free tools, Account; a hairline; at the
   left "Disclaimers and footnotes" and the language choice, at the right the numbered notes (never moves
   money; not legal advice; sample data), the photographers' credits (with Adrian Sulyok's requested
   link) and the copyright.

## Interactions
- Colours change over the slow hover timing; every link shows a focus ring.
- The mobile panel closes on Escape or a link press; focus returns to the button.
- On the website's own host, sign-in and sign-up go to the app's address.

## States
- No demo address: the demo links are hidden. No contact address: Contact is hidden.
- A dark system setting does not change the website's palette.

Deviations allowed: none
