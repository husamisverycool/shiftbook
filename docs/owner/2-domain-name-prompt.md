# Prompt: thousands of domain names to check

Copy everything inside the box below into a new chat with Claude (claude.ai, with "Code execution"
or "Analysis" turned on, so it can make a zip file).

Good to know:
- Claude can't check which names are free. That's what Namecheap is for.
- Namecheap's bulk checker ("Beast Mode") takes up to 5,000 names at a time, which is why the prompt
  asks for files of 5,000.

```
I'm naming a new software company and need a very large list of possible .com domain names so I
can bulk-check which are available. You can't check availability; just generate.

THE IDEA
Small temporary staffing agencies — the kind that place warehouse, factory, event, hospitality,
cleaning and office workers into short-term jobs — run their whole back office by hand. Every week
a pile of timesheets arrives in every possible form: phone photos of handwritten sign-in sheets,
PDFs, spreadsheets, exports from client systems. Someone retypes it all, works out each worker's
pay under a tangle of wage and overtime laws that differ by state, sends it to payroll, then bills
every client. Mistakes cost real money, workers get paid wrong, clients dispute invoices, cash runs
short between paying workers and getting paid, and legal deadlines slip.

This software takes over that whole weekly cycle. It reads every timesheet, gets the hours right,
applies the right pay rules and explains every number, produces the payroll file and one invoice
per client, gets clients to approve hours, chases unpaid invoices, shows the agency where it makes
and loses money, keeps it on the right side of labor law, and gives workers a phone app for their
shifts, hours and pay stubs. The agency goes from days of retyping to minutes of checking.

The customers are agency owners and payroll clerks: practical, busy, not technical, often bilingual
(English and Spanish). They want something that feels dependable and that "just gets it right" —
not flashy, not trendy, not cute.

ANGLES THE NAME COULD TAKE (explore every one; this list is a starting point, add your own)
1. The outcome — what life feels like after: calm, done, clear, caught up, Friday afternoon off,
   books balanced, everyone paid right.
2. The weekly rhythm — the cycle of a work week, the beat of shifts, the turn from hours to pay to
   cash.
3. Correctness and trust — exactness, proof, the numbers adding up, something you can rely on.
4. Strength and foundation — what the business stands on; solid, steady, load-bearing things.
5. The people — the crew, the workforce, the hands that do the work; the agency as matchmaker.
6. The flow of money — from hours worked, to wages paid, to invoices billed, to cash collected.
7. Turning chaos into order — messy paper becoming clean data; sorting, straightening, settling.
8. The back office itself — the desk, the counter, the ledger, the command post behind the scenes.
9. Speed and lightness — what used to take days now takes minutes.
10. Metaphors from other worlds — nature, building, navigation, music, craft, sport, maps, tools —
    anything that captures "keeps a busy operation running right".
11. Invented, brandable words — short, pronounceable, made-up names with no fixed meaning that can
    become the brand (2–3 syllables, easy to say in English and Spanish).
12. Spanish or Spanish-friendly words and blends that feel natural to bilingual customers.

STYLES (use all of them, across all the angles)
- Single real words
- Two-word combinations run together
- A word plus a short helper (get-, use-, try-, my-, -hq, -app, -works, -co, -labs, -desk, -base)
- Invented words and blends
- Short phrases (two or three short words) that are still easy to say

RULES FOR EVERY NAME
- Ends in .com
- Letters only: no hyphens, no numbers
- 4 to 14 letters before ".com" (shorter is better)
- Easy to spell after hearing it once on a phone call; no spellings that can be misheard
- Not the name of an existing well-known company, especially in payroll, HR, staffing, accounting
  or fintech, and not a close variant of one
- Nothing that reads as an accidental or awkward word when the parts run together
- Nothing negative, cheap-sounding, slangy, or that makes temporary work sound disposable
- No duplicates

HOW MANY
At least 20,000 unique names. First write rich word lists for each angle yourself (hundreds of
words per angle), then use code to combine them systematically and filter with the rules above.
Also hand-write a few hundred favorites across all angles.

WHAT TO GIVE ME
One zip file named domain-ideas.zip containing:
1. favorites.txt — your best 300, one per line, best first
2. all-names-part-01.txt, all-names-part-02.txt, ... — every name, one per line, at most 5,000
   lines per file, shortest first
3. all-names.csv — columns: domain, length, angle (1–12), style, the words it's built from, and
   1–10 scores for sound, ease of spelling, and fit with the idea
4. one file per angle (angle-01-outcome.txt, angle-02-rhythm.txt, ...) so I can browse by feel
5. README.txt — how the list was made, in plain words

Then, in the chat, show me your top 5 from each angle with one short line each on why it fits.
```

## Checking the names

1. Go to **namecheap.com** → **Domains** → **Bulk Domain Search** (also called **Beast Mode**).
2. Paste in everything from `favorites.txt`, untick every ending except **.com**, and search.
3. Sort by **available** and write down the ones you like.
4. Do the same with each `all-names-part-NN.txt` file, or browse the per-angle files for a feel you like.
5. Before you buy a name:
   - Say it out loud to someone over the phone and have them type it. If they spell it right first
     time, it's a keeper.
   - Search the name on Google and on the US trademark site (**tmsearch.uspto.gov**), to make sure
     no staffing or payroll company already uses it.

You can buy the name at Namecheap, or at IONOS if you're following the IONOS guide
(`docs/owner/3-go-live-with-ionos.md`). Buy it in one place only.
