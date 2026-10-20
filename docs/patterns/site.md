# Pattern: Website home (tabulado.com)

Status: adopted — slice aa, second design (2026-10-20; the owner rejected the first as "basic" and
"like the app" and asked for Mercury, Stripe and Ramp)
Reference product and screen: Mercury's home, section for section (full-bleed photograph hero with a
centred headline, a frosted email field with the button inside it and a frosted "Launch demo"; a frosted
legal note at the photograph's foot; a dark band with a heading over an accordion beside floating product
panels; a centred heading and a photo carousel straddling the dark and light bands; a 2×2 grid of grainy
cards with sparkle chips; a dark row of four figures; a dark security trio with abstract renders; a
centred close with two pills; footnotes). Campfire's line-mask headline reveal, flooding pill and
cycling feature list; Check's scroll-lit statement; Stripe's and Ramp's moving name strip; Ramp's
floating product card over a photograph; Deel's warm bento with white product pieces; Warp's rows that
resolve from "Checking" to a result.
Source URL: https://mercury.com
Source URL: https://stripe.com
Source URL: https://ramp.com
Source URL: https://www.campfire.ai
Source URL: https://www.checkhq.com
Source URL: https://www.deel.com
Source URL: https://www.warp.dev
Source URL: https://www.apple.com/macbook-pro/
Researched: 2026-10-20 (`docs/research/website-visual-slice-aa.md`; Mercury's home captured frame by
frame). Confidence: high for Mercury's structure, medium for the borrowed details.

## Hierarchy
1. Hero (Mercury): a full-bleed photograph of temp work (warehouse), darkened top and bottom; centred
   two-line h1 at regular weight (450), tight tracking, revealed line by line (Campfire); one lead
   sentence; a frosted pill holding the email field and the accent "Start free" button (submits to
   sign-up with the email filled in); a frosted "Try the demo" pill (or "See how it works" when no demo
   address is set); a frosted dark note at the foot: Tabulado never moves money, with footnote 1.
2. Dark band (Mercury): a two-tone heading; at the left an accordion of four steps (the open one with a
   dot and its sentence, the others as titles between hairlines) and a "Try the demo" link; at the right
   the open step's floating dark panel (files read twice; the sign-in sheet with the disagreeing cell and
   a pointer moving to "Keep 8"; client approvals; the payroll file with control totals and superscript
   cents), cross-fading; a "sample data" label under it. Arrow keys move between steps.
3. Carousel (Mercury): a centred heading on the dark band; a wide rounded photograph carousel across the
   dark-to-light edge — a tag at the top-left, white words at the bottom-left, Ramp's floating white card,
   a pause button, three progress segments (the open one fills over six seconds). No customer quotes.
4. Payroll systems (Stripe, Ramp): a two-tone heading and an endless strip of the systems' names as words
   (never logos), faded at both edges, pausing on hover; "any other system" under it.
5. Scroll-pinned story (Apple's and Stripe's pinned product scenes; Ramp's receipt matching; Mercury's
   grainy card and sparkle chips): four screens of scrolling with the picture pinned. At the left the
   heading and four captions on a rail that fills as you scroll (the current one ink, the rest grey). At
   the right one grainy card: the photographed sign-in sheet is scanned by a line; it moves aside as its
   rows lift into a table and the handwritten names turn into the roster's names, the doubtful cell
   resolving to "Kept 8"; the client's approval card rises and its button turns to "Approved"; the
   payroll file and three invoices fan out and "Balanced" appears. Phones and reduced motion: the four
   states as still pictures in a 2×2 grid, each with its caption (Mercury's grid).
6. Statement (Check): one large sentence that lights word by word as it is scrolled; a sample pay line in
   monospace under it.
7. Cycling list (Campfire): heading and the flooding pill to Pricing at the left; ten names at the right,
   a light moving down them, faded at the edges.
8. Rules bento (Deel, Warp): one large warm card with the five rule books whose rows turn from "Checking"
   to "Applied" when seen; two small cards — the city minimum wage, and the state it holds instead of
   guessing.
9. Dark band (Mercury): four figures with dividers; a hairline; the security heading and three cards with
   abstract renders (rings round a last-four pill; a glowing page with lines blacked out; glossy pills as
   log entries); a link to the security page.
10. Close (Mercury) over Stripe's skewed band of slowly drifting colour (Tabulado's blue, amber and
    mint, with grain): centred two-line heading, accent and frosted pills; then two dark cards with a
    round arrow (start free; the free Illinois checker).
11. Footer (layout pattern).

## Interactions
- Hero lines rise once on load; the lead and form fade in after them. Reduced motion: no rise.
- Carousel advances every six seconds, pauses on the button; segment buttons jump. Reduced motion:
  it does not advance.
- Statement and cycling list hold still with reduced motion. Marquee, float, pointer, rings and the
  drifting colour stop; the scroll story shows its four states as still pictures.
- Header is see-through over the hero and turns light on scroll (layout pattern).

## States
- No demo address: the second hero pill reads "See how it works" and scrolls to the dark band; the
  band's demo link is hidden.
- Spanish: every word in Spanish (usted); sample names and figures stay as they are.
- The site keeps its own palette under a dark system setting.

Deviations allowed: none
