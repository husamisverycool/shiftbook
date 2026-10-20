# Plan: website, sixth design — one system, every part from its best reference

Date: 2026-10-20. Status: approved 2026-10-20 ("go but dont change opening"): the hero stays exactly as it is.

## Why
The owner: the mid-page sections (Monday before/after, the bento, Same week four states, Where the week
goes) look cheap and repeat what the hero and tour already show; everything else should be raised too.
Four research passes (2026-10-20; Linear, Vercel, Raycast, Cursor · Stripe, Stripe Tax, Ramp, Mercury,
Rippling, Brex · Apple, Attio, Notion, Framer, Clay, Gusto, Deel · nav, hero, footer, pricing and
security pages across them) agree on three things:
1. The page mixes four visual systems (Mercury, Attio, Linear, Stripe), each with its own tracking,
   radii and colour mood. Expensive pages run one system.
2. Between product shots, the best pages do not show more product. They use type (scroll-lit
   statements, stat rows, rules written as sentences), diagrams (an integration hub, an exploded
   figure), or one precise artefact (a file, a single pay line taken apart).
3. Restraint: hairlines instead of shadows, one accent colour, two-tone headlines, mono micro-labels,
   footnotes on every claim.

## One system for the whole site
- Linear's measured tokens: the dark band #08090a-range; text, secondary and tertiary greys; 8% white
  hairlines; 9999px pill buttons (light primary, dark secondary with an inset ring); 8px windows and
  12–14px cards; Geist (already ours) and Geist Mono for 11px uppercase labels; display tracking -0.022em.
- Light bands use Attio's ruled sheet: 1px side rails, a hairline closing every section, no floating
  cards.
- One accent (our indigo). Two-tone headlines everywhere. Entrances: blur-in (Attio). Section rhythm
  128–160px.
- The colour flow and arrivals from the fifth design stay.

## The home page, part by part (reference → Tabulado)
1. **Header** — Stripe's morphing menu (one panel that changes size and slides between "Product" and
   "How it works"), drawn as Linear's bar: clear over the photo, frosted with a hairline once scrolled,
   hidden on scroll down and back on scroll up. Full keyboard support. Phone: a full-screen sheet.
2. **Hero** — unchanged (owner, 2026-10-20: "dont change opening").
3. **Payroll systems** — Attio's "whole stack, connected": two rows of tiles drifting opposite ways, each
   the system's name in text plus its file type in mono (never their logos). Replaces the bordered grid.
4. **Statement** — Attio's scroll-lit paragraph: one large paragraph whose words light up one by one as
   you scroll. Replaces the FIG drawings, which copy Linear too literally.
5. **Product tour** — kept (Attio), restyled into the one system.
6. **Read twice** (replaces "Monday") — Linear /build's two plates: two abstract isometric plates,
   "Reading A" and "Reading B", joined by dashed lines, with four mono captions on either side
   (two independent readings · compared field by field · agree → straight through · differ → a person
   decides). No timesheet drawn (owner's rule).
7. **One pay line, taken apart** (replaces "Same week, four states") — Apple's "Take a closer look": a
   pinned dark stage with one real pay line set in large type, made by the engine. Pills down the left
   (Hours, Rule, Rate, Arithmetic, Rounding, Citation, Effective date) open one at a time; the matching
   part of the line lights up. Scrolling steps through them.
8. **The rules** — Ramp's dot map (the US in fine dots, the four states lit, mono pins such as
   "CALIFORNIA · MIN WAGE $17.40 FROM JAN 1 2027") beside Linear /method's table of contents: every rule
   by state with its citation and effective date, generated from the rule tables. The dated changelog
   line stays under it.
9. **Highlights** (replaces the bento) — Apple's "Get the highlights": large rounded cards sliding
   sideways, the next one peeking, a pill of progress dots and a pause button. Six cards, each one big
   statement plus a typographic visual, not a screenshot: Two readings, one answer · Every line explains
   itself · Approve by link · English y Español · SSNs, sealed · Checked to the cent.
10. **Where the files go** (replaces "Where the week goes") — Stripe's integration hub on a dark dot
    grid: Tabulado in the centre; dotted lines with label pills to the ways hours arrive, the four state
    rule books, the eight payroll formats, and one invoice per client; a light pulse along the lines;
    hover lights one path. Then Stripe Tax's file artefact: a spreadsheet card of the real exported file,
    an "Export" dialog overlapping it (format list with the real eight), and a numbered control-totals
    card ending "Difference explained: $0.09".
11. **Numbers** — Mercury's row of large figures straddling the seam between two bands, the top half of
    each numeral dark-on-light and the bottom half light-on-dark, with footnote marks. Replaces the
    indigo ray band, which copies Stripe.
12. **Security** — Mercury's three softly lit objects: four tiles turning into a lock (with Linear's
    decode effect on a 9xx test number), a black bar sweeping over a generic document, log rows sliding
    in. Then Vercel's bordered row of plain facts. No badges we do not hold.
13. **Tech specs** — Linear /insights' sticky title beside an accordion: states, inputs, readings, pay
    lines, payroll formats, invoicing, worker app, security, and what Tabulado never does.
14. **Close** — Linear's centred two-line statement with two pills, on Attio's faint line texture; under
    it Stripe's two icon columns (pricing; the free checker). Replaces the skewed colour band.
15. **Footer** — Mercury's: link columns, then "Disclaimers and footnotes" as a numbered list matched to
    superscripts across the page.

## Other pages
- **Pricing** — Ramp /pricing in our system: cards with a fit label on the top edge, the recommended
  one outlined, a compare table with a sticky header and a tooltip on every row; Stripe's floating pill
  bar (Plans · Compare · FAQ); Vercel's two-column FAQ ("Does Tabulado move money? No.").
- **Security** — Linear /security: centred title, then sections of "lead sentence on the left, a grid
  of real measures on the right", and Vercel's FAQ.

## Honesty rules
No customers, testimonials, customer logos or invented figures. Payroll systems are named in text only.
Every rule, rate, date and citation shown is generated from the rule tables or the engine; counts come
from the export registry. Test numbers are 9xx. No timesheet or sign-in sheet pictured.

## Order of work (each part usable before the next)
A. The system (tokens, buttons, headings, labels) and header/footer · B. Home parts 2–8 · C. Home parts
9–15 · D. Pricing and Security pages. Each: pattern file first, tests where data is shown, typecheck,
lint, build, desktop/phone/Spanish screenshots compared with the reference, then commit and push.
