# Pattern: Website home (tabulado.com)

Status: adopted — slice aa, sixth design (2026-10-20; `.claude/plans/website-v6.md`). The owner found the
mid-page sections cheap and repetitive and asked for every part to be raised, drawn faithfully from the
best software companies; the hero stays exactly as it was (owner: "dont change opening"). Four research
passes (Linear, Vercel, Raycast, Cursor · Stripe, Stripe Tax, Ramp, Mercury, Rippling, Brex · Apple,
Attio, Notion, Framer, Clay, Gusto, Deel · nav, hero, footer, pricing and security pages across them)
agreed: run one visual system; between product shots use type, diagrams or one precise artefact rather
than more product; hairlines, one accent, two-tone headings, mono micro-labels, footnotes on claims.
Reference product and screen, part by part: Linear (hero app frame, lit floor, headline from a blur;
/build's two plates; /method's contents; changelog; /insights' tech specs; the close); Cursor and Granola
(the self-playing window's step bar); Check (the frame flattening on scroll); Mercury (photo hero, frosted
email field, docked disclosure; figures across the seam; security objects; footer with numbered notes);
Attio (tiles of connected systems; scroll-lit statement; pinned product tour; eyebrow pills; barcode
texture); Apple ("Take a closer look"; "Get the highlights"; footnote marks); Ramp (stippled dot map with
mono pins); Stripe (integration hub on a dot grid; the close's icon columns; colour behind the product);
Stripe Tax (the file as a spreadsheet with its export dialog and numbered summary); Vercel /security
(bordered facts row).
Source URL: https://linear.app
Source URL: https://linear.app/build
Source URL: https://linear.app/method
Source URL: https://linear.app/insights
Source URL: https://attio.com
Source URL: https://www.apple.com/macbook-pro/
Source URL: https://ramp.com
Source URL: https://stripe.com
Source URL: https://stripe.com/tax
Source URL: https://mercury.com
Source URL: https://vercel.com/security
Source URL: https://cursor.com
Source URL: https://www.granola.ai
Source URL: https://www.checkhq.com
Researched: 2026-10-20 (four research reports; screenshots measured at 1440px). Confidence: high for
layout and type; motion timings are typical values where the markup did not state them.

## One system
- Linear's tokens: dark bands near #08090c–#14151c; white text, greys at 45% and the muted token; 8%
  white hairlines; pills (light primary, dark secondary with an inset ring); 28px stage radius, 12–16px
  cards; Geist with Geist Mono 11px upper-case labels; display tracking about -0.03em.
- Attio's eyebrow pill above each heading; two-tone headings (the second clause grey); one accent.
- Light bands are warm paper with hairlines, no floating shadows except the file artefact's (Stripe Tax).
- The app drawings (`src/components/site/app/`, "The app on the page" below) are unchanged from the
  fifth design.

## The app on the page (`src/components/site/app/`)
As in the fifth design: one kit at Linear's density (frame, sidebar with grouped areas and counts, ⌘K,
status circles, labels, avatars, record panel) in light and dark themes, and the screens Inbox, Week, Pay
run, Client approvals, Invoices, Payroll file and the ⌘K menu, on sample data with the engine's pay lines
and the exporters' files.

## Hierarchy
1. Hero (unchanged): Mercury's photograph darkening into ink; the two headline lines from a blur; the
   lead; the frosted email field and "Try the demo"; the app in its dark theme playing a Monday (inbox,
   ⌘K, the doubtful cell kept, pay run, payroll file) with keystroke chips, Cursor's step bar and pause;
   Mercury's disclosure docked on the frame.
2. Payroll systems (Attio's "whole stack, connected"): eyebrow, two-tone heading, two rows of tiles
   drifting opposite ways (still under the pointer, faded at the edges), each a system's name and its
   file type in mono — from the export registry; a mono caption.
3. Statement (Attio): one large centred paragraph whose words light from grey to ink as it crosses the
   screen, four words lighting to the accent; the barcode texture under it.
4. Product tour (Attio, fifth design) with an eyebrow.
5. Read twice (Linear /build): split heading; a dotted panel with two isometric plates ("Reading A",
   "Reading B") joined by dashed verticals, their fields lighting in turn, the one differing field amber on
   both with "8" and "6", a dark chip "Differs · a person decides", chevrons climbing and falling at the
   sides, four mono captions two by two. No timesheet drawn.
6. One pay line (Apple's "Take a closer look"): pinned dark stage; at the left the heading and seven pills
   (Hours, Rule, Rate, Arithmetic, Rounding, Law, Checked), one open at a time into its caption; on the
   stage California's daily-overtime line from the engine as an equation (7:00 × $27.375/h = 19,162.5¢ →
   $191.63), its rule, law and "read twice" tags, the week's days with the hours past 8 lit; the part the
   open pill names lights and underlines, the rest dims. Under the stage, the engine's own explanation.
   Phones: not pinned, every caption listed.
7. The rules (Ramp, Linear): split heading; the country as a dot field, the four states lit with pulsing
   pins and mono chips (each state's minimum wage now and next, Chicago's); every rule by rule book in
   five columns — name, law, since when, the next dated version — and the places held for a person; the
   dated changes on one line, the next lit. All from the rule tables.
8. Highlights (Apple): heading; six large cards in a sideways track (the next peeking), each two lines
   and one typographic visual (two outlined "8:00"s becoming one; the engine's explanation with its money
   and law lit; a link chip and Approve; Clock in / Registrar entrada; 9••-••-•••• with a lock; the file's
   three totals); a pill of dots with the current one filling over six seconds, and pause.
9. Where the files go (Stripe's hub): on a dot grid, Tabulado's tile in the middle; dotted lines with a
   travelling light to label pills and on to: the ways hours arrive (left tray), the five rule books (ghost
   boxes above), the eight payroll systems (right tray), one invoice per client (ghost boxes below); "never
   moves money" under it. Phones: the four as cards.
10. The file (Stripe Tax): eyebrow, two-tone heading, paragraph and three ticks at the left; at the right
    the real exported file as a spreadsheet running off the edge, an "Export payroll file" dialog over its
    corner whose format list switches the file, and a numbered "Control totals" card (workers, Tabulado's
    gross, what the system will pay, the difference, the clerk's note in English).
11. Figures across the seam (Mercury): a centred line on paper; $0, 2, 5, 8 standing on the line where
    paper meets ink, dark above and light below, with dividers that change at the line; captions with
    footnote marks.
12. Security (Mercury, Vercel): two-tone line over a hairline; three slate cards with soft clay objects
    (number tiles closing into dots and a lit lock; a black bar sweeping over a generic page's lines; log
    rows dropping in); titles with footnote marks; a bordered row of four plain facts; the link.
13. What's inside (Linear /insights): the heading held at the left; an accordion of ten rows opening onto
    chips or a sentence (states, inputs, readings, pay lines, payroll formats, invoices, approvals, worker
    app, security, what it never does).
14. Close (Linear, Stripe): centred two-line statement, light and dark pills, on a faint field of vertical
    lines with one breathing glow; a hairline; two icon columns (pricing; the free checker).
15. Footer (layout pattern): numbered notes 1–7 matched to the marks on the page.

## Scroll
- Colour that flows: five groups, each of one lightness, each with one background that fades to the colour
  of the part in the middle of the screen — ink; paper → lavender → paper; night → deep navy → black →
  teal-black; paper; ink. The seam figures stand between the last two.
- Arrivals from a blur (Linear, Attio) on headings, panels and cards; pinned parts: the tour and the pay
  line.

## Interactions
- Plays and loops run only while on screen and hold still under reduced motion: the hero, the plates'
  fields and chevrons, the hub's lights, the highlights, the security objects.
- The pay line's pills and the tour's steps scroll to their place; the highlights move by dots, arrow
  keys and swipe; the file's format list is a radio group; the specs are native disclosures.

## States
- No demo address: "Try the demo" becomes "See how it works" and goes to the tour.
- Owner, 2026-10-20: no photographed or drawn timesheets anywhere on the site.
- Spanish: every word in Spanish (usted); the clerk's notes are not shown; sample names and figures stay.
- The site keeps its own palette under a dark system setting.
- Without the page's script everything shows, on each group's first colour.

Deviations allowed: none
