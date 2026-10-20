# Pattern: Website layout (public, tabulado.com)

Status: adopted — slice aa, seventh design (2026-10-20). Header and footer in Linear's type, sizes and
colours (decision 0048); the menu keeps Stripe's single morphing panel, drawn with Linear's popup styling.
Reference product and screen: Linear's header (32px-tall links in 13px grey that brighten on a faint
rounded hover, a light "Sign up" pill; its menus a blurred near-black panel, 14px radius, one hairline,
items on a faint raised fill with 10px radius) with Stripe's one panel that slides and resizes between
triggers; Linear's footer (logo, columns of 13px links, a top hairline) with Mercury's "Disclaimers and
footnotes" block and Stripe's footer language choice.
Source URL: https://linear.app
Source URL: https://stripe.com
Source URL: https://mercury.com
Researched: 2026-10-20 (linear.app's markup and layout stylesheet read directly). Confidence: high.

## Hierarchy
1. "Skip to content", visible only when focused.
2. Header, fixed, 64px: logo; "Product ▾", "How it works ▾", Pricing, Security, Free tools in the centre
   (13px, #8a8f98, 32px tall, 12px sides, white on a faint rounded fill when hovered or open); the other
   language, Log in and the light "Start free" pill (#e5e5e6 on #08090a, 13px, weight 510) at the right.
   Over the opening photograph it is see-through; after 24px of scroll a frosted bar with a hairline fades
   in, its colours following the part of the page under it. It slides up out of view while the reader
   scrolls down past the first screen and returns on any scroll up. "Product" and "How it works" open one
   floating panel (#08090a at 90%, 32px blur, 14px radius, one 8% white hairline, shadow 0 8px 32px): items
   on a faint fill (10px radius, 16px padding), each an icon, a 13px title and a 13px grey line (two
   columns for Product, one for How it works), and a footer link. Moving between the triggers slides the
   panel and changes its size over 0.22s while the contents crossfade. Below 1024px: logo, "Start free" and
   a menu button opening a full-width panel with every link.
3. The page (each page opens on #08090a).
4. Footer (Linear): a top hairline; the logo and one 13px grey line; columns Product, Free tools, Account
   (13px headings in white, weight 510; 13px grey links); then "Disclaimers and footnotes" and the
   language choice at the left, the numbered notes at the right (1 never moves money; 2 not legal advice;
   3 sample data), the payroll systems' trademark line, the photographer's credit (with Adrian Sulyok's
   requested link) and the copyright.

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
