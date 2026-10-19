# Deep research prompt — who to reach, how, and in what order (Tabulado go-to-market)

Paste everything below the line into Claude with Research turned on. Fill in the three
`[brackets]` first (your names and school, how many hours a week you can give this, and your city).

---

You are my go-to-market research team. I am a non-technical founder with a working product and
almost no network in this industry. I need a concrete, verified, step-by-step plan for exactly who to
contact, in what order, through which channel, with what message and what offer — so that within the
next 14 days at least one real staffing agency runs a real pay week through my product (ideally paying
for it), and within 90 days I have paying customers, referral partners and a repeatable way to find
more. Think like a founder-led-sales operator who has sold vertical SaaS into small, traditional,
cash-strapped businesses, and like a researcher who refuses to state anything unverified.

## 1. What I have built (facts — do not research these, use them)

**Tabulado** is back-office software for small US temporary staffing agencies (roughly 20–500 workers on
assignment; light industrial, warehouse, manufacturing, events, hospitality, janitorial, clerical).
Everything hangs off the *assignment* (a worker placed at a client's worksite at a pay rate and a bill
rate). It is built, tested and about to go online, in English and Spanish:

- Reads the week's messy timesheets (phone photos of paper sign-in sheets, client PDFs, time-clock
  CSV/XLSX, VMS exports from SAP Fieldglass, Beeline, Coupa, Magnit, and emails forwarded to the
  agency's own address), with two independent reading passes, confidence, and click-to-source.
- Applies the wage rules: federal FLSA weekly overtime with the weighted regular rate, California daily
  and seventh-day overtime and meal/rest premiums, Illinois and Massachusetts weekly overtime, New
  Jersey overtime and minimum wage, Illinois Day and Temporary Labor Services Act 4-hour minimum and
  the Section 42 720-hour equal-pay counter, New Jersey Temporary Workers' Bill of Rights minimums and
  notices, minimum-wage top-ups, shift differentials, holiday pay, contractual minimums, per-client
  overtime *billing* rules — every line with a plain-English explanation of its arithmetic.
- Produces the payroll import file for Gusto, ADP Workforce Now, ADP RUN, QuickBooks Online,
  QuickBooks Desktop (IIF), Paychex Flex, Paylocity or a mapped CSV, reconciled to the cent; one
  invoice per client with timesheet backup (PDF/CSV, VMS upload files, consolidated statements);
  emailed invoices, credit notes, collection reminders, bank-file cash matching, aging and
  days-to-pay; a factor "schedule of accounts" export.
- Margin by client, worker, recruiter, branch and week; overtime billed vs paid leakage; "cash you
  are floating".
- Compliance calendar: Illinois registration and client verification dates (March 1 / September 1)
  with a printable proof page, Section 42 triggers, New Jersey and Massachusetts notices and renewals,
  workers' comp audit packet, I-9 dates, ACA look-back.
- Client approval links and a client portal (approve hours, see invoices, request workers); a worker
  phone app (text-code sign-in, onboarding with W-4/I-9/direct deposit, hours, clock in/out, shifts,
  pay stubs, translated messages with the agency); scheduling and shift fill; partner-ready packets for
  embedded payroll, earned wage access and invoice funding (computed and recorded; no money moves —
  that needs licensed partners later).
- A live demo agency anyone can click through in about ten minutes, and a **free public Illinois
  720-hour checker** (upload hours, see who is near or over 720 hours at one client in 12 months;
  nothing stored) built as a cold-outreach hook.
- Self-serve sign-up with a monthly subscription; nothing about price is fixed yet (working
  hypothesis: about $3 per worker paid per week with a floor).

**Me:** [names, school, and that we are students who would take leave if accepted to YC]. I grew up
in Fresno, California. I can give this [N] hours a week. I am based in [city]. I do not speak Spanish
fluently. I am applying to Y Combinator; the deadline I am working toward is early November 2026, so
the first 14 days matter most.

**What earlier research concluded (verify and update, do not just repeat):** the best-fit customers
are light-industrial agencies that run their own payroll — agencies that use a factor only for funding,
or self-fund — because agencies on a full back-office funder (for example Advance Partners, a Paychex
company, or similar "payroll + funding" providers) get payroll and invoicing bundled "free". Public lead
sources: the Illinois Department of Labor's registered day-and-temporary-labor agency list, New
Jersey Division of Consumer Affairs registration lookups (temporary help service firms and the
designated-classification certification), the Massachusetts DLS licensed/registered placement agency
list, Google Places for California's Central Valley and Inland Empire, ASA and state association
member directories, job postings, and UCC filings naming staffing factors as secured parties. Close
competitors/adjacents: Jombone (AI timesheets), Avionté (with embedded invoice financing), TempWorks,
Bullhorn, NextCrew, Spott (ATS, raised a Series A in 2026), Deelo, BOSS. The single most important
test: one agency that runs its own payroll gives us a closed past week, we reconcile to the cent, and
they pay for the next live week.

## 2. What I need you to research and decide

Research live and cite a source (URL, with the date you read it) for every factual claim. Mark anything
you could not verify as **unverified**. Label your own estimates as estimates with the reasoning. Do not
invent people, phone numbers, emails, events, prices or statistics. Name organisations freely; for
individual people, give only roles, titles and where a public business contact is published (an
association staff page, a company "About" page, a state registry's listed contact) — never scrape or
guess personal data, and never list a private person's personal phone or home address.

### A. Who exactly — the target map
1. Rank the customer segments by likelihood to buy in the next 90 days, and say why: by state
   (Illinois, New Jersey, Massachusetts, California, and any other state where the regulatory pain or
   density is higher — check Texas, Georgia, Ohio, Pennsylvania, Indiana, Wisconsin), by vertical, by
   size (workers on assignment, branches), by how they fund payroll (self-funded, factor-only, full
   back-office funder, PEO/EOR), by payroll system, by ATS, by whether their clients use a VMS.
   Estimate how many agencies are in each top segment, with method.
2. For each segment, the buying committee in a small agency (owner/president, operations or branch
   manager, payroll/billing coordinator, outside bookkeeper or CPA): who feels the pain, who signs, who
   can block, what each one fears, what each one is measured on.
3. Signals that an agency is a good target *this month*, and exactly how to detect each one from
   public data (registrations, job-post volume and posted pay rates, "weekly pay" language, new
   branches, UCC filings and which factor, Google reviews mentioning late or wrong pay, recent IDOL or
   NJ enforcement, hiring for a payroll clerk, using QuickBooks/Gusto vs ADP/Paychex).
4. Step-by-step, reproducible instructions to build a list of the first 300 target agencies from the
   public sources above: the exact URLs, what each file or search contains today (check the current
   Illinois list's layout, the New Jersey lookup's filters and export options, the Massachusetts list's
   format), the search queries, the fields to capture, how to de-duplicate, and how to score each row.
   Include a table schema I can paste into a spreadsheet.

### B. Partners and affiliations — who else can bring me agencies
For each type below: whether it is worth pursuing in the first 90 days, what they gain, what to offer,
who to contact (role and organisation), the risks, and whether money can change hands legally.
1. Factoring companies that fund staffing agencies but do NOT run their payroll (factor-only), and
   those that do (as a threat and as a possible white-label customer). Name the active staffing factors
   and say which model each uses, with sources.
2. Staffing-focused CPA firms, bookkeepers and payroll service bureaus.
3. State staffing associations (Illinois, New Jersey, Massachusetts, California, plus others you rank
   highly) and the American Staffing Association: membership rules for vendors, events between
   November 2026 and March 2027 with dates and costs, speaking or sponsorship options, student or
   startup passes.
4. Payroll platforms (Gusto, ADP, Paychex, QuickBooks) partner/app-marketplace programs: what it takes
   to be listed, and whether that brings agency leads.
5. ATS vendors and their marketplaces (Bullhorn Marketplace, Spott, JobAdder, Avionté, TempWorks):
   integration partner programs; whether being "the back office for Spott users" is realistic.
6. Workers' comp insurers and brokers specialising in staffing (the audit packet is a hook), PEOs and
   employers of record, embedded-payroll and earned-wage-access providers (Check, Zeal and others) as
   future partners — what to say to them now versus after first customers.
7. Employment-law firms that advise Illinois and New Jersey staffing agencies (the 720-hour counter
   and the Temporary Workers' Bill of Rights notices are their clients' pain): co-hosted webinars,
   checklists.
8. Hispanic chambers of commerce, workforce boards, and community organisations in light-industrial
   corridors — only if you find evidence they reach agency owners.
9. VMS/MSP programmes and the large manufacturers that use small agencies: can I create pull from the
   client side (for example "your agencies must give you approved-hours backup and Illinois
   verification proof")?
Give each partner type a priority, a first message, and a realistic timeline to the first referral.

### C. How — channels, messages and offers
1. For each channel — cold email, cold phone, LinkedIn, in-person walk-ins at agency branches, text
   message, direct mail, association events, online communities (verify which Facebook, LinkedIn and
   Reddit groups for staffing owners actually exist and are active), referrals, content (the free
   720-hour checker; a free payroll-file checker; an Illinois/New Jersey compliance calendar), and the
   live demo link — say expected response rates for this audience (cite benchmarks, flag estimates),
   cost, time per contact, and when to use it.
2. Exact legal rules for each channel in the US as of today: CAN-SPAM for cold email, TCPA and state
   rules for calls and especially text messages to businesses, LinkedIn's terms on automation, and
   state rules on referral fees and arranging financing (California's commercial financing broker and
   disclosure laws in particular). Tell me what I must not do.
3. Messaging: for each persona and segment, a first-touch email (under 90 words), two follow-ups, a
   cold-call opener and three-question discovery script, a voicemail, a LinkedIn note under 300
   characters, a walk-in script and a one-page leave-behind outline. Each first touch must include one
   true, specific fact about *that* agency taken from public data (show how to find it), and must lead
   with their money and risk (hours of Monday retyping, overtime billed wrong, Illinois 720-hour
   exposure, New Jersey notice duties, late invoices), not with "AI". Spanish versions where an owner
   is likely to prefer Spanish.
4. The offer ladder: free 720-hour check → 20-minute look at their Monday → "send me last week's
   timesheets and payroll register (SSNs removed) and I'll reconcile it side by side" → paid live week
   → monthly subscription. For each step: what I send, what they send, what success looks like, and
   how to ask for the next step. Recommend a price for the first paying week and the first month, with
   reasoning from competitor and benchmark pricing (verify current published prices).
5. The demo: how to run a 15-minute demo for an agency owner using my live demo agency, in what
   order, what to show first, what to skip, the questions to ask during it, and how to close for the
   side-by-side week. Also how to run it by phone/screen-share and in person on a laptop.
6. Objections and answers, with evidence: "my factor does my payroll free", "we're fine with Excel",
   "we already have Avionté/TempWorks/Bullhorn", "you're students", "what if a paycheck is wrong",
   "where is my data and SSNs", "what if you shut down", "Jombone already does this".
7. Trust assets I should have before the first call (security one-pager, sample reconciliation,
   references, insurance — say which insurance and roughly what it costs for a tiny startup, verify).

### D. When — the calendar
1. A day-by-day plan for the next 14 days (starting today), sized to [N] hours a week: list-building,
   number of touches per day by channel, follow-up timing, which partners to contact which day, when to
   send the free tool, when to ask for files, and the target numbers by day 7 and day 14.
2. A week-by-week plan for days 15–90 with the gates from section E.
3. Industry timing: which weeks and weekdays to avoid (payroll days, month-end, quarter-end, holiday
   season), when Illinois verification (March 1) and other deadlines create urgency, and which events
   to attend or watch between now and March 2027.

### E. Measurement and kill gates
Define the numbers to track weekly (contacts, replies, calls, files received, side-by-side weeks
reconciled, paid weeks, partner referrals) with target ranges, and the evidence that should make me
change segment, change channel, change price or pivot (for example: nearly every agency I reach gets
payroll bundled by its funder → sell to the funders as a white-label tool instead). Include the
questions that best predict a purchase.

### F. For the Y Combinator application
What traction evidence matters most in the next 14 days, how to present 1–3 design partners honestly,
and which numbers from this plan to report.

## 3. Output format
- Start with a one-page summary: the single best segment, the single best first channel, the first 10
  actions in order, and what "good" looks like at day 14.
- Then sections A–F with tables (segment ranking, partner ranking, channel matrix, the 14-day
  calendar, the metrics sheet), the list-building recipe with exact URLs, and all scripts and
  templates ready to copy, each marked with where to personalise.
- Then "Sources" with every URL and the date read, and "Unverified" listing what you could not
  confirm.
- Be specific and practical. Where a choice depends on something only I know, give the default you
  recommend and say what would change it. Do not pad; do not give generic sales advice that is not
  tied to this industry and this product.
