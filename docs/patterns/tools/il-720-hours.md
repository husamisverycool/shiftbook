# Pattern: Free Illinois 720-hour checker (public)

Status: adopted — slice q (2026-10-17; SPEC §27 item 2)
Reference product and screen: Gusto's free employer tax calculator page (hierarchy); Rippling's free
calculators page (no account, nothing saved, FAQ); Granite's own table and status badges for results
Source URL: https://gusto.com/resources/calculators/employer-tax-calculator
Source URL: https://www.rippling.com/calculators
Source URL: https://www.ilga.gov/legislation/ilcs/ilcs3.asp?ActID=2417&ChapterID=68
Researched: 2026-10-17 (`docs/research/hours-checker-slice-q.md`). Confidence: high.

## Hierarchy
1. Eyebrow: the tool's name ("Illinois 720-hour checker"), small and muted.
2. H1: the job, as a promise. One intro paragraph: the rule in one sentence and what the tool shows.
3. **The tool** (one column):
   - an H2 and one defining sentence;
   - the file input: drop a CSV or Excel file, or choose one — with its help line (the four columns
     it needs, in any order, and the date formats it reads); "Try a sample file" beside it;
   - or paste rows (a textarea with the same help line);
   - "Count as of" a date (today by default), with its help line;
   - the primary button "Check hours".
4. **Results**, right under the tool, once counted:
   - a row of three figures (Stripe/Mercury figure style, `_components/key-figures.md`): past 720
     hours, near (past 600), pairs checked;
   - the table — worker, client, hours in the last 12 months, hours in 48 months, status badge (past
     720 · near · under), the day 720 was passed (or "about <date> at this pace"), the day 4,160 was
     passed; past first, then near, then the rest, most hours first;
   - rows that could not be read, by row number and what was wrong;
   - "Download results (CSV)".
5. One soft line and one button: see the same counter run every week inside Granite with a demo
   agency (Gusto's "See plans and pricing"; Rippling's closing band).
6. **How the count works** (Gusto's explanation section): H3s — the rule (with its citation and a
   link to the statute), what counts (hours worked at one client, from April 1, 2024; each client
   apart), the 4,160-hour rule, the 600-hour heads-up (Granite's, not law), what to do after a
   crossing (equal pay or its hourly value, the client's data due before the next pay period).
7. **Your data** (Rippling's FAQ): no account; nothing is saved or kept — the file is read and
   forgotten.
8. Disclaimer in small muted text: an estimate from the hours given, not legal advice.

## Interactions
- Drop or choose a file (.csv, .xlsx), or paste rows; "Try a sample file" fills the paste box with
  invented rows.
- "Check hours" reads and counts; the results replace any earlier ones; the button shows it is
  working (`_components/loading.md`).
- "Download results (CSV)" saves the table as shown.
- The language switch at the foot keeps the page (Notion, as the sign-in pages).

## States
- Nothing checked yet: only the tool.
- A file without the four columns: says which are missing, in one line.
- Rows that cannot be read: counted apart and listed; the rest are counted.
- Nobody near: the table still shows every pair, all under.
- Too large (over 50,000 rows or 5 MB): says so.
- Loading: the page's outline (`_components/loading.md`); a failure keeps the page with "Try again"
  (`_components/error.md`).

Deviations allowed: none
