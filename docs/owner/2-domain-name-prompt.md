# Prompt: thousands of domain names to check

Copy everything inside the box below into a new chat with Claude (claude.ai, with "Code execution"
or "Analysis" turned on, so it can make a zip file). Before sending it, change the line marked
"EDIT ME" if you want to.

Good to know:
- Claude can't check which names are free. That's what Namecheap is for.
- Namecheap's bulk checker ("Beast Mode") takes up to 5,000 names at a time. That's why the prompt
  asks for files of 5,000.
- Almost every short, real-word .com is already taken. The prompt therefore leans on two-word
  combinations and made-up-but-sayable words, which is where the free, good names are.

```
I'm naming a software company and need a very large list of possible .com domain names so I can
bulk-check availability on Namecheap. You can't check availability; just generate.

WHAT THE PRODUCT IS
A back-office web app for small temporary staffing agencies (warehouse, light industrial, events,
hospitality, janitorial, clerical; 20–500 temp workers). Every week it reads messy timesheets (phone
photos, PDFs, spreadsheets), applies the correct wage and overtime laws, and produces the payroll
file and one invoice per client. It also does client approval of hours, collections, profit
margins, compliance deadlines, worker onboarding, a worker phone app and shift scheduling. Its pitch
is "the pay-and-bill operating system for staffing agencies". The working name is Granite (solid,
dependable, foundational). Customers are agency owners and payroll clerks: practical, busy,
non-technical people who want something trustworthy, not trendy.

THE FEELING THE NAME SHOULD GIVE
Solid, trustworthy, calm, precise, "the numbers are right", quietly confident. Think of names like
Gusto, Rippling, Ramp, Brex, Mercury, Linear, Stripe, Plaid and Deel: short, easy to say on a phone
call, easy to spell after hearing it once. (Don't use those names or anything close to them.)

THEMES TO DRAW FROM (mix and combine them)
- Solid foundations: stone, rock, granite, slate, basalt, quarry, bedrock, keystone, cornerstone,
  ledger stone, anchor, pillar, beam, frame, footing, mason
- Work and shifts: shift, crew, roster, dayshift, punch, clock, timecard, hours,
  week, labor, hand, staff, bench, floor, dock, yard
- Pay and books: pay, wage, ledger, tally, payroll, bill, invoice, books, sum, balance, count, cent,
  coin, reckon, settle, net, gross, run
- Clarity and correctness: true, plumb, level, square, true north, exact, clear, proof, check
- Movement and flow: flow, run, line, relay, bridge, cycle, loop, beat, rhythm, cadence, tempo
- Short invented words that sound like real companies (2–3 syllables, easy to pronounce in English
  and Spanish), e.g. built from the roots above with endings like -ly, -io, -a, -o, -er, -en, -ra, -va

STYLES TO PRODUCE (spread the names across all of them)
1. Single real words
2. Two-word compounds (e.g. "shiftledger", "stonepay")
3. Real word + action or helper word: get___, use___, try___, ___app, ___hq, ___pay, ___works,
   ___labs, ___co, ___ops, ___desk, ___hub, ___base, ___books
4. Invented brandable words (pronounceable, no awkward letter clusters)
5. Variations on "granite" specifically (granitepay, granitehq, usegranite, granitebooks, ...)
6. Short Spanish-friendly names (the customers' workers are often Spanish speakers)

RULES FOR EVERY NAME
- Ends in .com
- Letters only: no hyphens, no numbers
- 4 to 14 letters before ".com" (shorter is better)
- Easy to spell after hearing it once; nothing that can be misheard as two spellings
- Not a real company or trademark in payroll, HR, staffing or fintech (avoid Gusto, ADP,
  Paychex, Paylocity, Rippling, Deel, Bullhorn, Indeed, Workday, etc. and close variants)
- Nothing that reads badly when the words run together (check for accidental words)
- Nothing negative, cheap-sounding or slangy; nothing about "temp" in a way that feels disposable
- No duplicates

HOW MANY
Generate at least 20,000 unique names. Use code to combine the word lists systematically, then
filter with the rules above (length, letters only, no doubled awkward letters at the joins, no
banned words or trademarks, no duplicates). Also write a few hundred hand-picked favorites yourself.

WHAT TO GIVE ME
One zip file named domain-ideas.zip containing:
1. favorites.txt — your best 300, one per line, best first
2. all-names-part-01.txt, all-names-part-02.txt, ... — every name, one per line, at most 5,000
   lines per file (Namecheap's bulk checker takes up to 5,000 at a time), shortest names first
3. all-names.csv — columns: domain, length, style (1–6 from the list above), root words used,
   a 1–10 score for how good it sounds, how easy it is to spell, and how well it fits the product
4. README.txt — how the list was made, in plain words

Then, in the chat, show me your top 30 with one short line each on why it fits.
```

## Checking the names

1. Go to **namecheap.com** → **Domains** → **Bulk Domain Search** (also called **Beast Mode**).
2. Open `favorites.txt` first, copy everything, paste it into the box and search. Untick every ending
   except **.com**.
3. Sort by **available**. Write down any you like.
4. Then do the same with each `all-names-part-NN.txt` file.
5. Before buying, say the name out loud to someone over the phone and have them type it. If they
   spell it right first time, it's a keeper. Also search the name on Google and on the US trademark
   site (**tmsearch.uspto.gov**) to make sure no staffing or payroll company already uses it.

You can buy the name at Namecheap, or at IONOS if you follow the IONOS guide
(`docs/owner/3-go-live-with-ionos.md`). Buy it in one place only.
