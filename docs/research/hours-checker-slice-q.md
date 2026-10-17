# Free Illinois 720-hour checker — research for slice q

Fetched 2026-10-17 with a scraper. Purpose: the public page's hierarchy comes from the free calculator
pages of payroll products, not from taste. Copy structure and interactions only — never names,
wording, illustrations or colours.

## 1. Gusto — Employer tax calculator (structure reference)
Source URL: https://gusto.com/resources/calculators/employer-tax-calculator (scraped 2026-10-17)

Top to bottom, as read:
1. A small eyebrow label naming the tool ("Employer tax calculator").
2. The H1 states the job the tool does, as a promise ("Calculate hiring costs for your new employee.").
3. One intro paragraph: the problem in plain words, then what the tool gives ("quickly gives you a
   clearer picture …").
4. The tool section: an H2, one sentence defining the subject, then the inputs — each a label, a
   one-line help sentence under it, and the field.
5. The results right after the inputs: each figure labelled, then a total.
6. One soft line offering the product for doing this every time, with one button ("See plans and
   pricing").
7. An explanation section ("The ins and outs …") with H3s, plain-language paragraphs and bullet
   lists, linking the primary sources (IRS pages).
8. A closing band with one button ("Create account").
9. An italic disclaimer: general information and estimation, no guarantee.

## 2. Rippling — Free HR, payroll and hiring calculators (privacy and FAQ reference)
Source URL: https://www.rippling.com/calculators (scraped 2026-10-17)

- H1 "Free … calculators", one line, then the list of tools.
- An FAQ answers: free to use, "no account or sign-up required"; accuracy — "treat the result as a
  close estimate"; "Nothing you enter is saved or tied to an account. Enter your numbers, see your
  result, and that's it."
- A closing band: "See how Rippling can simplify payroll" with two buttons.

## 3. The law the tool counts
- 820 ILCS 175/42 (P.A. 103-1030): equal pay after "more than 720 hours within a 12-month period"
  at the same third party client, counting work on or after April 1, 2024; § 42(a)(2)(B), (c): more
  than 4,160 hours within 48 months. The counting is the app's own (packages/rules
  `equalPayCounter`, src/server/compliance/counters.ts) on the rule row the app holds
  (REFERENCE_EQUAL_PAY_RULES, proven equal to the database by an integration test).
- The 600-hour heads-up is Granite's (SPEC §9), not law; the page says so.

## 4. What Granite takes
| Piece | From |
|---|---|
| Eyebrow, promise H1, one intro paragraph | Gusto §1 items 1–3 |
| Inputs with label + help line; results right under them | Gusto §1 items 4–5 |
| One soft line + one button to the product (the demo) | Gusto §1 item 6; Rippling's closing band |
| Plain-language explanation with H3s, the primary source linked | Gusto §1 item 7 |
| FAQ-style "nothing is saved, no account" | Rippling §2 |
| Disclaimer: an estimate, not legal advice | Gusto §1 item 9; Rippling "close estimate" |
| Results as a table with status badges and a CSV download | Granite's own table and status patterns (`_components/table.md`, `status.md`) |
