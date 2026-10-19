# Tabulado — Product Contract (SPEC)

> Source of truth for what we build. Changes to this file need the owner's explicit approval.
> Stack changes need a decision record in `docs/decisions/`.

## 1. What it is

Tabulado is the complete back office for small temporary staffing agencies (20–500 workers on
assignment: warehouse, light industrial, manufacturing, events, hospitality, janitorial, clerical).

Every week an agency gets a pile of timesheets in messy forms, retypes them into payroll and
invoices, and loses money to mistakes. Tabulado reads every timesheet, applies the correct wage
rules, and produces the payroll file for the agency's existing payroll system and one invoice per
client, plus margin, cash, collections and compliance views.

**The spine is the ASSIGNMENT:** a worker placed at a client's worksite under a job order, at a pay
rate and a bill rate, with overtime rules and a workers' comp class, for a date range. Every hour
attaches to an assignment. Every feature either gets hours onto assignments or uses them.

**Version one is pure software:** it computes, exports and generates documents. It never moves
money, lends, runs payroll, files taxes, schedules shifts, or does recruiting.

## 2. Users and roles

| Role | Can do |
|---|---|
| Owner | Everything; approves runs; sees margin; can reveal one SSN with a logged reason |
| Coordinator | Intake and hours review |
| Billing | Invoices, accounts receivable, cash application |
| Client approver | Magic link only: sees and approves/disputes their own hours for one period |
| Read-only accountant | Read everything except SSNs; changes nothing |
| Recruiter | Job orders, placements, worker onboarding (§27) |
| Worker | Phone one-time-code login to the worker app only: their hours, pay stubs, documents, shifts, messages (§27) |

MFA is required for Owner and Coordinator.

## 3. Stack

Next.js App Router with strict TypeScript · Postgres with Drizzle · shadcn/ui + Tailwind (defaults
only) · next-intl (English, Spanish) · Vitest · Playwright · object storage for documents · the
Anthropic API for document extraction · envelope encryption for SSNs.
Change the stack only with a written decision record in `docs/decisions/`.

## 4. Data model

- **Agency**, **Branch**, **User**(role)
- **Client**; **Worksite**(state, county, city);
  **ClientBillingProfile**(invoice template, PO required, consolidate, VMS name, overtime billing rule)
- **Worker**(name, preferred language, encrypted SSN, last4, payroll file numbers per system,
  workers' comp state)
- **JobOrder**(client, worksite, position, SOC code, shift, headcount, pay range, prevailing-wage flag)
- **RateCard**(effective dates, pay rate, bill rate or markup, OT and DT multipliers, differentials,
  holiday rule, minimum-hours guarantee, WC class code)
- **Assignment**(worker, job order, rate card, start, end, status) — **the spine**
- **SourceDocument**(kind, hash, received via, storage key)
- **TimeEntry**(assignment, date, in, out, breaks, minutes, source document, page, bounding box,
  extraction pass A, pass B, confidence, status)
  - status: `extracted` / `needs_review` / `reviewed` / `client_approved` / `disputed` / `locked`
- **PayRun**(period, status) — status: `draft` / `validating` / `blocked` / `ready` / `exported` / `closed`
- **PayLine** and **BillLine**(time entry, type, minutes, rate, amount, rule id, explain)
- **Invoice**(client, lines, backup bundle, PDF, status, due date)
- **Payment** and **PaymentMatch**
- **Export**(run, format, mapping version, file hash, control totals)
- **Obligation**(type, jurisdiction, due date, subject, evidence)
- **HoursCounter**(worker, client, window, minutes)
- **AuditEvent**(actor, action, entity, before, after, time) — append-only

## 5. Hard rules for all money and time

1. Money is integer cents. Hours are integer minutes. No floating-point math anywhere in pay or billing.
2. Round once, at line level, and show the rounding in the explain string.
3. Every rate, threshold and multiplier lives in data tables with effective dates, never hard-coded.
4. Every computed pay or bill line carries an `explain` string a payroll clerk can read: the inputs,
   the rule, the arithmetic.
5. Rate changes never rewrite locked periods.

## 6. Intake

- Accept: phone photos and scans (JPG, PNG, HEIC, PDF), client-signed PDFs, time-clock CSV/XLSX
  exports, VMS exports (SAP Fieldglass, Beeline, Coupa, Magnit) through saved column-mapping
  profiles, a forwarding email address (body and attachments), and manual entry.
- Run **two independent extraction passes** with different prompts (and different crops or
  orientations for images).
- **Confidence** comes from: whether the passes agree; validators (date inside the period, in before
  out, daily minutes ≤ 24 hours, worker matches the roster, assignment active on that date); and
  arithmetic checks (row totals and column totals add up).
- Any disagreement or failed check sends the cell to `needs_review`.
- **Never auto-accept a handwritten value below the threshold.**
- Every value keeps its **provenance** (document, page, bounding box) so clicking a number
  highlights where it came from.
- Match names to the roster using accent folding, compound surnames and a per-agency nickname map.
  **Never auto-create a worker.**
- Before any model call, redact SSN-shaped and date-of-birth text from images.

## 7. Review grid

Spreadsheet-style grid of time entries for the period; filter by client, status and confidence;
inline edit with a reason; full keyboard navigation; side panel showing the source image with the
cell's bounding box highlighted; bulk-approve only high-confidence rows. Every edit is audited.

## 8. Job orders and rate cards

Full create/edit with effective dating; rate changes never rewrite locked periods; CSV import of
placements from Bullhorn, Spott and JobAdder exports via column mapping.

## 9. Pay rules engine

A pure, deterministic package: no I/O, integer math, **one file per rule with its legal citation and
golden tests**.

- **Federal FLSA:** overtime over 40 hours per workweek; regular rate is a weighted average that
  includes shift differentials and nondiscretionary pay.
- **California:** daily overtime over 8 hours at 1.5x and over 12 at 2x; seventh consecutive day:
  first 8 hours at 1.5x then 2x; meal and rest premiums of one hour at the regular rate when a
  violation is flagged (engine computes, human confirms).
- **Massachusetts:** weekly overtime over 40.
- **Illinois:** weekly overtime over 40; Day and Temporary Labor Services Act 4-hour minimum pay when
  a worker is sent and not used (flag input); Section 42 counter per worker per client: rolling
  12-month minutes, warn at 600 hours, trigger at over 720 hours, plus a 48-month 4,160-hour counter;
  on trigger, create an obligation.
- **Per-client overtime BILLING rules**, independent of pay rules: bill at multiplier, at straight
  time, or not billable.
- Holiday rules, minimum-hours guarantees, and a prevailing-wage flag (flag only).
- Minimum wage tables by state and locality with effective dates.
- **Unknown jurisdiction blocks the run.**
- **Calculation order per worker-week:** classify minutes → apply wage floor → straight pay →
  regular rate → daily/seventh-day/weekly overtime without double counting → confirmed premiums →
  allocate to clients.

## 10. Client approval

A magic-link page per client per period showing hours by worker and day; approve all or dispute a
line with a reason; reminders; approval stored as an audit event with the approver's identity;
disputes become adjustment proposals.

## 11. Weekly run

- Steps: **Hours complete → Exceptions resolved → Rules computed → Review totals → Export and invoices.**
- **Blocking checks:** unmatched entries; entries outside assignment dates; missing rate; unknown
  jurisdiction; negative or zero pay; missing payroll file number for the target system; pay below
  the applicable minimum wage; client approval missing where required; any mismatch between
  pay-line and bill-line minutes. A rate card below the minimum wage never pays below it: the engine
  tops every such hour up to that day's minimum on its own line and warns to fix the rate card (the
  approved golden "below-minimum-wage-topped-up"), which satisfies this check.
- **Warnings:** overtime spike versus prior week; worker approaching 720 hours.
- Approval snapshots inputs, rules version and outputs; corrections create a new run version.

## 12. Invoices

One per client per period (or per PO or worksite per profile); a backup bundle of approved timesheet
images plus line detail; templates (standard, per-worker detail, PO header, consolidated statement);
PDF and CSV; a VMS invoice-upload CSV per mapping profile.

## 13. Payroll exports

Each format declares the earning types it can carry and **fails if the run has a type it cannot**.

- **Gusto** hours CSV using Gusto's template columns.
- **QuickBooks Desktop IIF** time import (header-row quirk handled; name-match pre-flight).
- **QuickBooks Online** importer CSV.
- **ADP Workforce Now Paydata CSV:** Co Code, Batch ID, File # in the first three columns; Reg Hours,
  O/T Hours, Hours 3/4 Code and Amount, Temp Rate, Earnings 3–5 Code and Amount, Temp Dept,
  Temp Cost Number; file named `PRcccEPI.csv`.
- **ADP RUN** time import.
- **Generic mapped CSV** for factors and PEOs.
- Each agency sets an earning-code map: `REG`, `OT`, `DT`, `HOL`, `DIFF`, `MEAL_PREMIUM`,
  `REST_PREMIUM`, `MIN_GUARANTEE`.
- Every export writes **control totals** (workers, minutes by type, gross cents) and must reconcile
  exactly to the run or fail.
- Golden export files are byte-compared.

## 14. AR and cash application

Aging buckets (current, 1–30, 31–60, 61–90, 90+); days-to-pay by client; reminder templates
(copy-to-clipboard or mailto in version one); bank CSV import with suggested matches by amount,
reference and client that the user confirms; short-pay tracking.

## 15. Margin analytics

Gross margin by client, worker, recruiter, branch and week = bill − pay − estimated burden
(configurable employer tax percentage + workers' comp rate by class); overtime-leakage report
(overtime paid but not billed); "cash you are floating" (payroll paid − client cash collected for
that work) and a projection for the next payroll.

## 16. Compliance calendar

Illinois agency and branch registration renewals; Illinois client verification dates (March 1 and
September 1) with a printable proof page; Illinois Section 42 triggers; New Jersey Temporary
Workers' Bill of Rights certification renewal and a primary-language pay-statement flag;
Massachusetts DLS renewal and a Temporary Workers Right to Know job-order notice per assignment; a
workers' comp audit packet (payroll by class and state); I-9 status field; ACA hours look-back
report. List and calendar views; each obligation with evidence attachments.

## 17. Worker roster

Encrypted SSN with only last four shown; reveal requires Owner role plus a reason and is audited;
language preference; payroll file numbers per system; documents.

## 18. Demo mode

A seeded fictional agency with three clients (one in California, one in Illinois, one in
Massachusetts), 40 workers with realistic invented names, messy sample timesheet images we generate
(handwritten-style sign-in sheets, a client PDF, a time-clock CSV, a Fieldglass-style export), two
pay periods, a one-click reset, a banner on every page, and **no external calls**. The demo must use
**the exact same code paths as production**.

## 19. Audit log

Append-only events for every create, update, approve, export and reveal; viewable per entity and
globally.

## 20. Language

Every string in `messages/en.json` and `messages/es.json`; language toggle per user; dates and
currency localized.

## 21. Security

- SSNs encrypted at the application layer with a key outside the database; never in logs, prompts
  or exports except the audited reveal.
- Redact SSN-shaped and date-of-birth text from images before any model call.
- Tenant isolation, with tests proving one agency can never read another's data.
- MFA for Owner and Coordinator.

## 22. Out of scope for version one (even if asked in passing)

Owner, 2026-10-17: "all the stuff you said was out of scope i want everything to be built in full" —
scheduling, the worker app, onboarding and the partner-ready money flows moved into scope (§27).
What stays out, because it needs licences and partner contracts rather than software: actually
moving money, lending or funding, payroll processing or tax filing, E-Verify submission, live bank
connections, VMS API integrations (file-based only), native mobile apps (the worker app is mobile
web), and a full ATS or CRM (placements are imported).

## 23. Golden tests

- `tests/goldens/rules/` — input week → expected pay and bill lines: California daily and
  seventh-day overtime, multi-rate regular rate, Illinois 720-hour crossing mid-week, client
  overtime billing variants, minimum-hours guarantee, holiday, minimum-wage true-up.
- `tests/goldens/extract/` — sample documents → expected JSON, scored on field accuracy and on
  "silent errors" (a wrong value with high confidence), which **must be zero**.
- `tests/goldens/exports/` — run fixture → expected file bytes per format.
- The approved goldens folder is **read-only** to Claude. New cases are proposed in
  `tests/goldens/_proposed/` for the owner to approve.

## 24. Acceptance (the whole product is done only when this passes)

In demo mode, in English **and** Spanish, as a Playwright test:

1. Upload the sample folder.
2. Every field extracted with provenance.
3. Review grid shows only flagged rows.
4. Client approves via magic link.
5. Run passes validation.
6. Gusto CSV, ADP Paydata CSV, QuickBooks Online CSV and IIF are exported and reconciled.
7. Invoice PDFs with backup are generated.
8. Bank CSV is matched.
9. Margin and compliance pages reflect the run.
10. An Owner can reveal one SSN with a reason and the audit log shows it.

A stranger can open the demo URL and do all of that in under ten minutes without help.

## 25. Build order (vertical slices)

Each slice is usable end to end before the next starts.

| Slice | Scope |
|---|---|
| a | Project scaffold, database, demo data, one-page converter: upload last week's timesheets → review grid → payroll CSV + one invoice PDF |
| b | Assignments, job orders, rate cards |
| c | Full pay rules engine with golden tests |
| d | Client approval portal |
| e | Weekly run with blocking checks |
| f | All payroll export formats |
| g | Invoices with backup and client templates |
| h | AR, cash application |
| i | Margin analytics |
| j | Compliance calendar and counters |
| k | Worker roster with encrypted SSNs, audit log, Spanish/English |
| l | Polish every screen against its pattern file; full end-to-end acceptance test |
| m | Agencies sign themselves up and pay monthly through Stripe (decision 0036) — done |
| n | Motion, hover, press and focus from Primer's tokens (decision 0037) — done |
| o | Every state handled: page outlines while loading, errors with Try again, not found, buttons that spin — done |
| p | ⌘K command menu (decision 0038) — done |
| q | Free public Illinois 720-hour checker — done |
| r | Notifications, invoice email, credit notes, promises to pay, collection reminders — done |
| s | Connections; Paychex Flex, Paylocity and factor schedule of accounts (decision 0040) — done |
| t | Recruiter role, worker onboarding and the worker app — done |
| u | Scheduling and shift fill (decision 0039) — done |
| v | Client portal — done |
| w | Partner-ready money flows: compute everything, move nothing — done |
| x | New Jersey rules and duties; the slices joined; the acceptance test grown (§27 item 11) — done |

## 26. Design contract

Owner decisions (2026-10-15): "purely rely on inspiration from great products NOT your own idea of
what's best"; "take from ALL inspiration you can think of, not just the list I gave you". The table
below is the starting map; any excellent, publicly documented product may be the reference for a
screen or part of a screen, recorded in its pattern file with sources.

No design decisions of our own: no colors, fonts, spacing, layouts, animations, empty states, icons
or microcopy from taste. Every screen reproduces the information hierarchy and interactions of one
named reference screen, documented in `docs/patterns/`. shadcn/ui components with Tailwind defaults
are the neutral base. Reproduce patterns, never assets (no logos, brand names, icons,
illustrations, wording or brand colors from any reference).

| Screen | Reference |
|---|---|
| Setup/onboarding checklist | Stripe Dashboard setup checklist; Linear onboarding |
| Timesheet inbox | Ramp receipt-matching inbox; Expensify SmartScan list |
| Single document review | Rossum validation screen; Dext item review |
| Hours review grid | Airtable grid view; Rippling payroll hours grid |
| Job orders and assignments | Linear issues list with detail side panel |
| Rate cards | Airtable grid with linked records |
| Approvals and status timelines | Linear issue status chips; Stripe payment timeline |
| Weekly run | Gusto "Run payroll" flow; Rippling payroll run |
| Exports list | Stripe Dashboard reports/exports |
| Invoices list and detail | Stripe Dashboard invoices |
| Invoice PDF | Stripe invoice PDF; QuickBooks Online invoice PDF |
| Accounts receivable | Stripe Billing invoice statuses; Mercury AR view |
| Cash application / matching | Ramp Bill Pay transaction matching |
| Analytics dashboard | Mercury dashboard; Ramp spend insights; Brex home |
| Compliance list | Vanta Tests list; Drata controls |
| Calendar | Linear cycles; Notion Calendar week view |
| Workers directory and profile | Rippling People; Gusto People |
| Settings | Linear settings; Mercury settings |
| Command palette | Linear ⌘K; Raycast |
| Client portal | Stripe Customer Portal; Bill.com customer portal |
| Audit log | Stripe Dashboard events |
| Empty states | Linear empty states |
| Pay stub PDF | Gusto pay stub |
| Worker onboarding | Gusto employee self-onboarding; Rippling onboarding checklist |
| Worker app (mobile web) | Square Team app; Gusto Wallet; WhatsApp for messages |
| Scheduling and shift board | Deputy schedule view; When I Work scheduler |
| Shift offers (worker side) | Instawork shift list |
| Connections | Zapier connection setup; Stripe integrations page |
| Partner-ready money flows | Stripe Connect onboarding; Stripe Capital offer pages |
| Notifications and emails | Linear notification settings; Stripe email templates |
| Collections reminders | Stripe Billing dunning settings |
| Clients and worksites | Rippling company directory; Stripe customers list |

## 27. The whole product (owner, 2026-10-17)

Added to version one by the owner's explicit approval, built in slices after (m) (§25 order
continues: n motion, o every state, p command menu, q 720-hour checker, r notifications and
invoice email, s connections and more exports, t worker onboarding and app, u scheduling and shift
fill, v client portal, w partner-ready money flows, x New Jersey and the whole acceptance test).

1. **Command menu** (⌘K / Ctrl+K): jump to any page, record or action.
2. **Free Illinois 720-hour checker**: a public page an agency uses without an account — upload
   hours, see who is near or over 720 hours at one client in 12 months; nothing is stored.
3. **Notifications and email**: in-app and email notices for approvals needed, runs blocked,
   obligations due, disputes and shift confirmations, with per-user settings; invoices emailed with
   the PDF attached; scheduled collection reminders; credit notes; promise-to-pay notes.
4. **Connections and exports**: an integrations page (ATS imports by file from Bullhorn, Spott,
   JobAdder and Avionté; payroll export targets; VMS mapping profiles; the forwarding address;
   partner handoffs); Paychex Flex and Paylocity through a mapped CSV profile configured from a
   sample file; a factor "schedule of accounts" export with the timesheet backup bundle.
5. **Worker onboarding**: W-4 and I-9 Section 1 captured as data and PDF, direct-deposit details for
   the payroll handoff, policy acknowledgments, e-signature.
6. **Worker app** (mobile web, phone one-time-code login, English and Spanish, Spanish by default
   when that is the worker's preference): hours, pay stubs from locked runs (Gusto pay stub), documents,
   shift offers and confirmations, messages with the coordinator (translated), clock in and out with
   location when the client allows it.
7. **Scheduling and shift fill**: a shift board per client and worksite; shifts from job orders;
   offers to eligible workers; confirmations, no-shows and replacements; confirmed shifts attach to
   assignments; attendance feeds time intake. Fill rate and no-show rate per client in analytics.
8. **Client portal**: approve hours, see invoices and backup, download a remittance stub, download
   proof of the agency's state registration, request workers for a shift (a job-order draft).
9. **Partner-ready money flows — compute everything, move nothing**: an embedded-payroll payload per
   locked run; earned-wage-access availability per worker under a configurable cap; an invoice-funding
   underwriting packet and eligibility decision per approved invoice; a payroll-by-class export for
   insurance brokers. Each "send to partner" records a handoff and nothing else; every such screen
   says no money moves in this version.
10. **New Jersey**: weekly overtime over 40 and the minimum wage by year; the Temporary Workers'
    Bill of Rights notice per assignment, the four-hour (two when placed elsewhere) minimum for a
    laborer sent and not used, and a duty per designated-classification placement to confirm its pay
    against the client's comparable employees from the first day (N.J.S.A. 34:8D-7(b)) — Tabulado
    cannot know the client's averages, so a person confirms it. Not modelled: the one-hour reporting
    pay of N.J.A.C. 12:56-5.5 outside designated classifications; long-term-care direct care rates.
11. **Acceptance** (§24) grows to cover these: a worker signs in to the worker app in Spanish and sees
    hours and a pay stub; a shift is offered and confirmed; the handoff packets are generated and
    recorded; invoices are emailed.

