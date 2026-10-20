# Plan: three in-between sections on the home page (slice aa, seventh design)

Owner, 2026-10-20: add about three creative, non-product sections mingled between the product sections,
each drawn purely from a reference. Research (2026-10-20, live pages and 1440px screenshots) picked one
typographic, one editorial and one diagram section so they do not repeat each other.

## Order on the page
1. Opening, logos, statement (unchanged)
2. Product: Intake and reading
3. **New A — Raycast, "What else can Raycast do?"** (https://www.raycast.com/)
4. Product: Wage rules and pay
5. **New B — Stripe, "Book of the week"** (https://stripe.com/)
6. Product: Approvals and invoices
7. **New C — Stripe, "Connect to existing systems" diagram** (https://stripe.com/)
8. Product: Payroll files and exports
9. Changelog, pre-footer, footer (unchanged)

## A. "What else does Tabulado do?" (Raycast)
- Left column about 400px: a white 24px question, then one paragraph of short real sentences at 24px,
  all grey except the current one, which is white with a faint glow; the sentence moves on by itself while
  on screen and follows the pointer or arrow keys. Under it a small chip (icon and name) and a two-line
  grey caption for the current sentence.
- Right: a window about 500px wide that changes with the sentence, showing the app's real result for it
  (for example the engine's own explanation of a pay line, or the payroll file's first rows).
- Sentences only state things the product really does today.

## B. "From the rule book" (Stripe's book card)
- One wide card, about 1230 x 590: left 40% a dark panel with the real text of a law set like a page
  (e.g. Cal. Lab. Code § 510(a)); right a lighter panel with the title, the citation in grey, a plain
  paragraph on how Tabulado applies it, and two links (the official source; the pay line that uses it).
- Small arrows step through the five rule books (federal, California, Illinois, Massachusetts, New
  Jersey). Text comes from the rule tables' citations; no seal.

## C. "One path in, one file out" (Stripe's diagram)
- A dotted field about 870px wide; Tabulado's dark square in the middle; dotted lines to small pills
  (Read twice, Rules, Approval link, Invoice); at the left a group of tiles for how hours arrive (email,
  text, photo, spreadsheet, time clock); at the right the five payroll systems as name tiles; dashed
  empty slots above and below that fill in as it comes on screen; one dashed "Your bank" slot left
  unconnected, true to "Tabulado never moves money". Monochrome in Linear's colours.
- Phones: the same pieces as a plain vertical list.

## Rules
- Linear's type scale and colours only; no mono labels, no "·", no two-tone slogans, no timesheet
  drawings, no invented figures or customers. English and Spanish.
- Pattern file `docs/patterns/site.md` gains the three parts with their Source URLs before any code.
- Done = typecheck, lint, unit tests, build, desktop/phone/Spanish screenshots compared to the
  references with differences listed.
