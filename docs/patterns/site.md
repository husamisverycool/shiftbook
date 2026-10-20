# Pattern: Website home (tabulado.com)

Status: adopted — slice aa (2026-10-20)
Reference product and screen: Linear's home (a short heavy headline whose lines reveal once, a real
product view as the hero picture, feature chapters with two-tone headings), Mercury's home (a no-signup
demo beside the main button, a quiet legal line under the buttons), Stripe Billing (chapters as a list
whose open item swaps the picture beside it; the product shown inside a window frame), Ramp's "Systems
that never spoke" before-and-after, Resend's code-beside-result section and nine-item grid, Column's
checkable facts in place of customer logos, Plain's and Warp's security band, Check's "what you do /
what we handle" split, Gusto's numbered steps, and Linear's and Resend's closing call to action.
Source URL: https://linear.app
Source URL: https://mercury.com
Source URL: https://stripe.com/billing
Source URL: https://ramp.com
Source URL: https://resend.com
Source URL: https://column.com
Source URL: https://www.plain.com
Source URL: https://www.checkhq.com/platform
Source URL: https://gusto.com/product/how-gusto-works
Researched: 2026-10-20 (`docs/research/website-slice-aa.md`, `docs/research/website-content-slice-aa.md`).
Confidence: medium.

## Hierarchy
1. Hero (Linear, Mercury): one h1 of at most 18 characters per line (`max-width: 18ch`), 48–72px,
   weight 600, line height 1, letter spacing −0.03em, balanced; one muted sentence under it (at most
   60ch); "Start free" (filled) and "Try the demo" (outline) when a demo address is set, otherwise "See
   how a week works"; a small muted line: Tabulado never moves money.
2. The product view (Linear's real elements in Stripe's and Resend's window frame): a window with a
   neutral address bar; inside, a photographed sign-in sheet beside the hours read from it — names
   matched to the roster, one cell held for a person because two readings disagree. Built from the
   app's own components, sample data from the demo agency, labelled as sample data.
3. Checkable facts (Column), in place of a logo row: four short facts in a row of four (two on phones).
4. Before and after (Ramp): two columns — the week today, the week with Tabulado — each a short list.
5. One week, start to finish (Stripe Billing chapters, Gusto's numbered steps): a numbered list of four
   steps at the left; the open step shows its picture at the right; on phones each step shows its
   picture under it. Keyboard: arrow keys move between steps (tabs, vertical).
6. Every pay line says why (Resend's code beside its result): the inputs at the left (worker, state,
   hours in the week, rate), the line's explanation at the right exactly as Tabulado writes it, in
   tabular figures, labelled as a sample line from the demo agency.
7. The rules (Linear's feature rows): a list — each rule's name at the left, the law it comes from at
   the right, a hairline between rows.
8. Your payroll provider stays (Linear's chapter layout): a two-tone heading; the export targets as
   plain words (never logos); the control totals as a small picture.
9. Getting paid and margin (Linear's feature chapters, two pictures side by side): client approval,
   collections and margin.
10. Everything else (Resend's nine-item grid): nine short heading-and-sentence pairs, no icon tiles.
11. What Tabulado does and what it does not (Check): three columns — Tabulado does / your payroll
    provider still does / you decide.
12. Security band (Plain, Warp): three facts and "How we protect your workers' information →".
13. The free Illinois tool (Gusto's free calculators): one line and a link.
14. Closing call to action (Linear, Resend): a centred heading of at most 16ch, 36–56px, the hero's
    buttons again.

## Interactions
- Only the hero's heading animates on load: each line from transparent, 4px blur and 8px lower, over
  Primer's medium duration with the enter easing, 60ms apart; with reduced motion, opacity only.
  Nothing else reveals on scroll (Vercel's design guidance).
- The steps list: the open step's picture cross-fades over Primer's short duration.
- Section headings are two-tone: the first sentence in the foreground colour, the rest muted (Attio,
  Linear).

## States
- No demo address: the second button reads "See how a week works" and scrolls to step 5.
- Spanish: every word on the page in Spanish (formal usted); sample names and figures stay as they are.

Deviations allowed: none
