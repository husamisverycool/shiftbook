# Pattern: Website home (tabulado.com)

Status: adopted — slice aa, seventh design (2026-10-20). The owner rejected the sixth design as reading and
looking machine-made (its mono labels, dots, two-tone slogans, drawings and type) and asked that every font,
size, colour, proportion and section come from a reference, never from our own choices. The home page now
follows Linear's homepage part by part, with Linear's own type scale and colours read from its stylesheet
(decision 0048). The opening stays exactly as it was (owner: "dont change opening"); its lettering is now
the site's typeface.
Reference product and screen: Linear's homepage (logo row; statement with three figures; product sections
with a two-line title, a grey paragraph, a product scene and a "Features" row; changelog; pre-footer).
Between the product sections, three parts that are not the product (owner, 2026-10-20; plan
`.claude/plans/website-interludes.md`): Raycast's "What else can Raycast do?", Stripe's "Book of the week"
card and Stripe's "Connect to existing systems" diagram. The opening keeps Mercury's photograph and email field and the self-playing app (Cursor, Granola).
Source URL: https://linear.app
Source URL: https://www.raycast.com
Source URL: https://stripe.com
Source URL: https://mercury.com
Source URL: https://cursor.com
Researched: 2026-10-20 (linear.app's markup and layout stylesheet read directly; measured at 1440px).
Confidence: high.

## One system (Linear's, decision 0048)
- Inter with "cv01" and "ss03", optical size automatic; weights 400, 510, 590.
- Titles: 17, 20, 24, 32, 40, 48, 56, 64, 72px with Linear's line heights and tracking (`l-title-1`…`9`);
  text 17, 15, 14, 13, 12px (`l-text-large`, `-regular`, `-small`, `-mini`, `-micro`).
- Colours: page #08090a, panel #0f1011, raised #141516, border #23252a; text #f7f8f8, #d0d6e0, #8a8f98,
  #62666d.
- Inset 1440px wide with 80px sides; sections about 160px apart, separated by Linear's keyline.
- No monospace labels, no middle dots, no accent colour outside the app drawings.

## The app on the page (`src/components/site/app/`)
As in the fifth design: one kit at Linear's density in light and dark themes, and the screens Inbox, Week,
Pay run, Client approvals, Invoices, Payroll file and the ⌘K menu, on sample data with the engine's pay
lines and the exporters' files.

## Hierarchy
1. Opening (unchanged): Mercury's photograph darkening into the page; the two headline lines from a blur;
   the lead; the frosted email field and "Try the demo"; the app in its dark theme playing a Monday with
   its step bar and pause; the disclosure docked on the frame.
2. Logo row (Linear): the payroll systems Tabulado writes files for — Gusto, ADP, Paychex, QuickBooks,
   Paylocity — as their own wordmarks in white, spread across the inset; a 13px grey caption under them.
3. Statement (Linear): 48px, grey, its first sentence white; under it three columns split by hairlines,
   each a monochrome isometric line drawing (layers lift apart on hover), a 15px title and a 15px grey
   sentence.
4. Four product sections (Linear), each after a keyline: Intake and reading; Wage rules and pay; Approvals
   and invoices; Payroll files and exports. Each: the title in two lines at the left (48px), a 20px grey
   paragraph at the right; a wide scene — the app screen set back and dimmed, fading out at its right and
   bottom, with one brighter panel in front (a client's text thread; California's hours-by-day chart with
   the 8- and 12-hour lines; a client's approval email; the file's control totals); then "Features" at the
   left and the feature names in two columns split by a hairline, each with a "+" that opens one sentence.
   Between them, in this order:
   a. After Intake — "What else does Tabulado do?" (Raycast): left column about 400px, a 24px white
      question, then one paragraph of eight short true sentences at 24px on 38px lines, grey except the
      current one, white with a faint glow; under it a chip (icon and name) and a two-line 14px grey
      caption; at the right a window over a dim striped backdrop, its panel in front showing what the
      sentence does (two readings side by side, nicknames matched, pay lines with the engine's explanation,
      the Paychex file, approvals, reminders, last four digits only, Illinois' 720-hour counts). Moves on
      every 3.2s while on screen; pointing at or focusing a sentence holds it; arrow keys step.
   b. After Wage rules — "From the rule book" (Stripe's book card): one wide card about 590px tall; the
      left two-fifths a raised panel with a page of the law (the official text, verbatim, in English, on
      an off-white page with its heading and citation); the right the label, two arrows, the rule's name
      (32px), the citation (20px grey), a 17px paragraph on how Tabulado pays it, "Read" with links to the
      official text and to the pay lines; five short bars, one per rule book (federal, California,
      Illinois, Massachusetts, New Jersey).
   c. After Approvals — "One way in. One file out." (Stripe's diagram): a 32px heading and a 20px grey
      paragraph at the top left; a 1040 x 560 field of fine dots fading at its edges; Tabulado's dark
      square in the middle; dotted lines to pills ("Read twice", "Wage rules", "Dated changes", "Payroll
      file", "Invoices"); the six ways hours arrive as tiles at the left; the five rule books as slots
      above, filling in one by one; the five payroll systems' wordmarks in a tray at the right; three
      clients as dashed slots below; "Your bank, not connected" as a dashed box with no line. Phones: the
      same pieces as a list.
5. Changelog (Linear): "Rule changes"; one hairline with a dot over each of four entries, the newest lit;
   each entry a title, its citation (two lines at most) and its date — from the rule tables.
6. Pre-footer (Linear): centred 72px two-sentence title, at most 16 characters a line; Linear's light and
   dark pills.
7. Footer (layout pattern).

## Interactions
- Arrivals from a blur on headings, scenes and rows; the opening's player runs only while on screen and
  holds still under reduced motion.
- The rule book's arrows and bars are buttons; the diagram is a picture with its words also listed for
  phones and screen readers.
- Feature names are native disclosures (keyboard and screen readers work without script).

## States
- No demo address: "Try the demo" becomes "See how it works" and goes to the first product section.
- Owner, 2026-10-20: no photographed or drawn timesheets anywhere on the site.
- Spanish: every word in Spanish (usted); sample names and figures stay.
- Phones: one column; the scenes show the app screen only, the front panel hidden.
- Without the page's script everything shows.

Deviations allowed: none
