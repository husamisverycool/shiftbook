# Pattern: Website home (tabulado.com)

Status: adopted — slice aa, third design (2026-10-20). The owner found the second design too basic; four
research passes over about thirty sites (scratchpad research2: stripe-vercel-linear.md, fintech.md,
craft.md, awards.md; summary in `docs/research/website-visual-slice-aa.md`) agreed that the best pages
make the product do the work on screen, on sample data, and let the visitor set it off. The owner chose
the research plan over keeping the second design's sections (`.claude/plans/website-v3.md`).
Reference product and screen: Mercury (photo hero, frosted email field, disclosure docked on the
product, dark figures, security trio, close, footnotes); Cursor and Granola (a self-playing product
window with a stage switch; the source highlighted when a row is hovered); Check (the product leaning
back and flattening as the page scrolls); Linear (lit floor under the product, headline lines arriving
from a blur, the method diagram's two circles with a traced arc); Ramp ("Systems that never spoke": a
pinned scroll pulling a tangle into order); Increase (a checking card that ticks fields and leaves one
for a person); Stripe (country tabs re-rendering one card, the odometer, Connect's flow diagram with a
code panel, the bento's pointer-following border light, page rails, the drifting colour band); Resend
(a button whose presses add to a timeline); Apple (fanned phones with a switch that turns all three);
Column (a map with only the covered places lit); Rippling (a guardrail shown as a feature, with its log);
Deel (status chips floating over the hero photograph); Linear's FIG drawings.
Source URL: https://mercury.com
Source URL: https://cursor.com
Source URL: https://www.granola.ai
Source URL: https://www.checkhq.com
Source URL: https://linear.app
Source URL: https://linear.app/method
Source URL: https://ramp.com
Source URL: https://increase.com
Source URL: https://stripe.com/payments
Source URL: https://stripe.com/connect
Source URL: https://stripe.com
Source URL: https://resend.com
Source URL: https://www.apple.com/iphone-18-pro/
Source URL: https://column.com
Source URL: https://www.rippling.com
Source URL: https://www.deel.com
Researched: 2026-10-20. Confidence: high for structure; motion timings are typical values (screenshots
are still images; HTML and CSS were read where available).

## Hierarchy
1. Hero: Mercury's photograph (darkening into the ink band), the two headline lines arriving from a blur
   (Linear), one lead sentence, the frosted email field with "Start free" inside it (submits to sign-up
   with the email filled in) and a frosted "Try the demo". Under it Linear's app frame: a sidebar of
   sections (Inbox, To check, This week, Clients, Payroll files, Invoices) beside the week's work, with an
   Hours / Pay lines / Payroll file switch and a play/pause button (Cursor, Granola). The play: the week by
   worker and day fills row by row (where each came from beside it), the one total the two readings
   disagree on waits with "Keep 8" and is decided; the Illinois week's pay lines from the real rules
   engine with their explanations and the total rolling in (Stripe's odometer); the Gusto file the real
   exporter writes, line by line, "Ready to import". The frame leans back and flattens as the page scrolls
   (Check) on a lit floor (Linear); Deel's status chips float over the photograph at different depths
   (wide screens); Mercury's disclosure docked on the frame's foot: Tabulado never moves money.
2. Linear's statement and FIG 0.1–0.3, on the same dark band: a two-tone sentence, then three columns
   split by hairlines, each with its figure label, a fine isometric line drawing whose layers lift apart
   on hover (two readings over the sheet's grid with the disagreeing cell lit; the stacked rule books with
   their tabs; one file per payroll system, fanned), and a title with a sentence.
3. Monday at a staffing agency (Ramp): pinned for about two and a half screens; a tangle of the week's
   loose ends (a missed call with its voicemail, a supervisor's text, a spreadsheet with a doubtful cell,
   a sticky note, a time-clock export, an email disputing hours, the wage poster, the payroll deadline)
   joined by dashed lines draws together and gives way to one week by worker and day, the changed and
   disputed cells marked, with where each came from; a Before / After marker follows the scroll. Phones and
   reduced motion: the two states stacked.
4. Read twice (Linear's method diagram, Increase's checking card): two dashed circles, the shared part
   hatched with an arc travelling its edge; beside it the sheet's fields with both readings, checked in
   turn, ticked where they agree, the total left "Needs a person"; "Check again" replays it.
5. Same week, four states (Stripe's country tabs): California, Illinois, Massachusetts, New Jersey. One
   sample week (Mon 10h, Tue 8h, Wed 9h, Thu 8h, Fri 13h, Saturday sent home) paid by the real rules
   engine on the reference rule data (`src/server/site/state-week.ts`, tested by hand arithmetic). Left:
   hours by day, stacked regular / overtime / double time / sent-home pay, California's 8 h and 12 h lines
   drawn across; right: the pay lines, each with its explanation (open for the whole), and the week's
   total rolling (Stripe's odometer). Then: any other state holds the week for a person.
6. Where the week goes (Stripe Connect), dark band: sheets → Tabulado (badge: no money passes through
   Tabulado) → payroll file → your payroll provider pays; Tabulado → one invoice per client → client
   approves → clients pay your bank; dashes travel along the lines. Under it a dark file panel with a tab
   per payroll system showing the file the real exporters write for a sample week
   (`src/server/site/sample-files.ts`), its control totals (Tabulado's gross, what the system will pay,
   the difference) and the clerk's note (English page only).
7. Try the rest (Stripe's bento with the border light): a client approving from a link — pressing
   Approve adds to a timeline that ends "Nothing paid by Tabulado" (Resend); rule changes before they
   happen, from the dated rule tables with days to go and each law (Linear's changelog, Ramp's counters);
   the worker app on three fanned phones with an English / Español switch (Apple); the covered states lit
   on a tile map (Column); a Social Security number shown only with a reason, with the activity log
   (Rippling). Numbers in it are test numbers (9xx).
8. Dark band (Mercury): four product facts as figures; the security trio with abstract renders and a link
   to the security page; the close on Stripe's drifting colour band with the two pills; two cards (start
   free; the free Illinois checker).
9. Footer (layout pattern). Stripe's page rails frame the light bands.

## Interactions
- Plays and loops run only while on screen; every one holds still under reduced motion (the hero window
  shows its last stage; the pinned pieces become still pictures).
- Tabs (window stages, states, payroll systems) are Base UI tabs: arrow keys move between them.
- The bento's border light follows a mouse pointer only.

## States
- No demo address: "Try the demo" becomes "See how it works" and scrolls to Monday.
- Owner, 2026-10-20: no photographed or drawn timesheets anywhere on the site.
- Spanish: every word in Spanish (usted); the exporters' clerk notes are not shown; sample names and
  figures stay; the worker-app phones open in Spanish.
- The site keeps its own palette under a dark system setting.

Deviations allowed: none
