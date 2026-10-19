# Everything Tabulado does

Tabulado is the back office for a small temp staffing agency. Each week it takes the agency's
timesheets in whatever messy form they arrive and turns them into:

- a payroll file for the payroll system the agency already uses
- one invoice per client

It also tracks:

- who owes the agency money
- how much the agency earns on each client
- which legal duties are due

It never moves money itself. It works it all out, creates the files and records what happened.

---

## 1. Getting timesheets in

- **Upload anything:** phone photos, scans, PDFs, client-signed PDFs, HEIC iPhone photos,
  time-clock spreadsheets (CSV/Excel) and staffing-portal exports. The portals are SAP Fieldglass,
  Beeline, Coupa and Magnit. Each one has a saved "column map", so the next file goes in with one click.
- **Forward by email:** each agency gets its own address. Anyone can forward a timesheet email to it
  and the attachments land in Tabulado automatically.
- **Typing by hand:** hours can be entered directly.
- **AI reading of photos:** every photo is read twice in two different ways. If the two readings
  disagree, or a number fails a check, a person is asked to look. Examples of failed checks:
  - a date outside the week
  - a time out before the time in
  - more than 24 hours in a day
  - totals that don't add up

  Handwriting that the AI isn't sure about is never accepted on its own.
- **Privacy before AI:** anything shaped like a Social Security number or a birth date is blacked out
  of the image before the AI sees it.
- **Names matched to the roster:**
  - Handles accents, double surnames and nicknames. The agency keeps its own nickname list, for
    example "Bobby = Robert".
  - Never invents a new worker.
- **Click a number, see where it came from:** each hour shows the exact spot on the original photo
  it was read from.

## 2. Checking the hours (review grid)

- A spreadsheet-style grid of the week's hours, fully usable from the keyboard.
- Filters by client, status and how sure the AI was.
- The original photo is shown beside the grid, with the cell's location highlighted.
- Changes need a reason, and every change is logged.
- Rows the AI was sure about can be approved in one click. Doubtful rows can't be bulk-approved.

## 3. Clients, job orders, pay and bill rates

- **Clients and worksites,** with each worksite's state, county and city.
- **Billing settings per client:**
  - which invoice style to use
  - whether a purchase order is required
  - whether invoices are combined
  - which staffing portal the client uses
  - how overtime is billed: at the overtime multiple, at straight time or not at all
- **Job orders:** position, job code, shift, headcount, pay range and a prevailing-wage flag.
- **Rate cards with start dates:**
  - pay rate, and bill rate or markup
  - overtime and double-time multiples
  - shift differentials and holiday rules
  - minimum-hours guarantees
  - workers' comp class

  A rate change never changes a week that is already closed.
- **Assignments** link a worker to a job order and rate card for a date range. Every hour hangs off
  an assignment.
- **Importing placements** from Bullhorn, Spott, JobAdder and Avionté files.

## 4. The pay rules (the "brain")

Every pay and bill line shows its working in plain words: the inputs, the rule and the arithmetic.
All money is calculated in exact cents.

- **Federal:**
  - overtime over 40 hours a week
  - the "regular rate" correctly includes shift differentials and bonuses
- **California:**
  - daily overtime over 8 hours (1.5×) and over 12 hours (2×)
  - the seventh-day-in-a-row rule
  - meal and rest break premiums, which the engine works out and a person confirms
- **Illinois:**
  - weekly overtime
  - the 4-hour minimum when a day laborer is sent but not used
  - equal pay for temps after 90 days
  - the 720-hour counter per worker per client: warns at 600 and triggers a duty over 720, plus
    a 4,160-hour, 48-month counter
- **New Jersey:**
  - weekly overtime and the minimum wage for each year
  - 4 hours of pay (2 if the worker is placed elsewhere) when a laborer is sent but not used
- **Massachusetts:** weekly overtime.
- **Minimum wage:**
  - kept per state and city with start dates
  - a rate below the minimum is automatically topped up on its own line, with a warning
- **Other pay:** holidays, minimum-hours guarantees and bonuses.
- **Unknown location:** if Tabulado doesn't know a worksite's state rules, it stops the payroll
  instead of guessing.
- **Billing overtime:** each client's overtime billing rule is applied separately from how the
  worker is paid.

## 5. Client approval of hours

- Each client gets a secure link each week. No account is needed.
- The client sees hours by worker and day. They approve everything, or dispute a line and give a
  reason.
- A dispute becomes a proposed correction for the agency to accept.
- Reminders are sent automatically, and every approval records who approved it and when.

## 6. The weekly payroll run

- **Five steps:**
  1. hours complete
  2. problems fixed
  3. pay worked out
  4. totals reviewed
  5. files and invoices made
- **Payroll is blocked until these are fixed:**
  - hours not matched to a worker or assignment
  - hours outside an assignment's dates
  - a missing rate
  - an unknown state
  - zero or negative pay
  - a missing payroll ID for the worker
  - pay below the minimum wage
  - client approval missing where it's required
  - pay hours and bill hours that don't match
- **Warnings:**
  - an overtime spike compared with last week
  - a worker nearing 720 hours
- **Corrections:**
  - Approving a run freezes a snapshot of everything.
  - A correction creates a new version; nothing is overwritten.
  - Holiday pay, bonuses and short days can be added as pay events.

## 7. Payroll files (for the payroll company the agency already uses)

- **Formats:**
  - Gusto
  - QuickBooks Desktop (IIF)
  - QuickBooks Online
  - ADP Workforce Now
  - ADP RUN
  - Paychex Flex
  - Paylocity
  - any other format, through a column map set up from a sample file
- **Earning codes:** each agency matches its own codes, such as regular, overtime, double time,
  holiday, differential, meal or rest premium and minimum guarantee.
- **Safety checks:**
  - A file refuses to build if the payroll system can't hold a type of pay the week contains.
  - Every file comes with control totals (workers, hours by type, gross pay), which must match
    the run exactly or the file fails.

## 8. Invoices

- One invoice per client per week. It can also be one per purchase order or per worksite.
- **Four styles:**
  - standard
  - per-worker detail
  - purchase-order header
  - combined statement
- **Formats:** PDF and CSV, plus an upload file for the client's staffing portal.
- **Backup bundle:** the approved timesheet photos and the line detail behind every invoice.
- **Sent by email** with the PDF attached.
- **Credit notes** for corrections. These check limits so you can't credit more than was billed.

## 9. Getting paid (receivables and cash)

- **Aging:** current, 1–30, 31–60, 61–90 and 90+ days.
- **Days-to-pay** for each client.
- **Collections:**
  - automatic reminder emails on a schedule, and clients can opt out
  - promise-to-pay notes
  - short-pay tracking
  - write-offs
- **Bank file import:** Tabulado suggests which invoice each deposit pays (by amount, reference and
  client), and a person confirms.

## 10. Profit and cash (margin analytics)

- **Gross margin** by client, worker, recruiter, branch and week. It's worked out as bill minus pay
  minus the estimated cost of employer taxes and workers' comp, and those settings can be changed.
- **Overtime leakage:** overtime the agency paid but didn't bill.
- **"Cash you are floating":** wages already paid minus money not yet collected for that work, plus
  a projection for next payroll.
- **Attendance:** fill rate and no-show rate per client.
- **Trend charts** with a comparison period, small trend lines and hover details.

## 11. Compliance (legal duties)

- **List and calendar views.** Each duty has a due date, a reminder and attached proof.
- **Illinois:**
  - registration renewals
  - the March 1 and September 1 client checks, with a printable proof page
  - 720-hour triggers
  - equal-pay duties
- **New Jersey:**
  - the temp workers' Bill of Rights certification
  - the assignment notice for each placement (English and Spanish)
  - a notice in the worker's own language when they speak something other than English or Spanish
  - the day-one equal-pay check, which a person confirms
- **Massachusetts:** the state registration renewal and the job-order notice for each assignment.
- **California:** the job-order and break rules feed in.
- **Reports and records:**
  - **workers' comp audit packet:** payroll by class and state
  - **ACA hours look-back:** who is nearing full-time status
  - **I-9 status** for each worker
- **Hour counters page** showing everyone near their limits.

## 12. Workers

- **Roster** with language preference, payroll IDs for each system, documents and history.
- **Social Security numbers:**
  - locked with encryption, and only the last 4 digits are ever shown
  - the full number can be seen only by the Owner, with a written reason, and that view is logged
- **Onboarding online:**
  - W-4 and I-9 Section 1 filled in as data and as a PDF
  - direct-deposit details collected for the payroll handoff
  - policy sign-offs and electronic signatures

## 13. The worker app (on the worker's phone, no download)

- **Sign-in** with a code texted to their phone.
- **Language:** English or Spanish, and Spanish by default if that's what they prefer.
- **What workers can do:**
  - see their hours and pay stubs from closed weeks
  - see their documents
  - accept or decline shifts and see what's confirmed
  - message their coordinator, with messages translated
  - clock in and out, with location if the client allows it
  - complete their onboarding

## 14. Scheduling and filling shifts

- **Shift board** for each client and worksite. Shifts are created from job orders.
- **Offers** go to eligible workers, who confirm.
- **No-shows** are tracked and replacements found.
- **Hours:** confirmed shifts attach to assignments, and attendance feeds into the hours.
- **Notice:** a published schedule texts the workers.

## 15. The client portal

- **One secure link per client.** The client can:
  - approve hours
  - see invoices and their backup
  - download a remittance slip
  - download proof of the agency's state registration
  - request workers for a shift, which arrives at the agency as a draft job order
- **Security:**
  - approval links made from the portal expire after 1 hour
  - links stop working when the agency removes access

## 16. Money partner packets ("works it all out, moves nothing")

Every one of these screens says that no money moves.

- **Embedded payroll:** a ready-to-send payroll file for each closed week.
- **Earned wage access:** how much each worker could draw early, under a cap the agency sets.
- **Invoice funding:** an underwriting packet and an eligible/not-eligible decision for each approved
  invoice, plus a "schedule of accounts" file with timesheet backup for factoring companies.
- **Insurance:** payroll by class for workers' comp brokers.
- **Handoff record:** "Send to partner" records the handoff, so you can show partners what's ready.

## 17. Notifications

- **In the app and by email.** People are told about:
  - approvals needed
  - payroll blocked
  - duties due
  - disputes
  - shift confirmations
- **Each person chooses** what they get.

## 18. Accounts, team and security

- **Agencies sign themselves up** and pay you monthly through Stripe, with optional free trial days.
  Stripe's own pages handle cards, invoices and canceling.
- **Roles:**

  | Role | What they can do |
  |---|---|
  | Owner | everything |
  | Coordinator | hours |
  | Billing | invoices and cash |
  | Read-only accountant | see everything except SSNs; changes nothing |
  | Recruiter | job orders, placements, onboarding |
  | Client approver | approve their own hours |
  | Worker | the worker app only |

- **Sign-in:**
  - password with an authenticator app, which Owners and Coordinators must use
  - passkeys (fingerprint or face)
  - an email link
  - "Continue with Google" and "Continue with Microsoft"
  - the agency's own single sign-on
- **Branches,** holidays, earning codes and collection settings all set per agency.
- **Data protection:**
  - each agency's data is walled off from every other agency's at the database level
  - an activity log records every create, change, approval, export and SSN view, both per record and
    for the whole agency

## 19. Feel and finish

- **Command menu:** press ⌘K (Ctrl+K on Windows) to jump to any page, record or action.
- **English and Spanish** throughout, with dates and money in local format.
- **Colours:** light and dark mode, and four accent colour styles. Each person picks their own in
  Settings › Account › Appearance or from ⌘K.
- **Smooth details:**
  - hover, press and page transitions modelled on GitHub's design system
  - loading outlines
  - friendly error and not-found pages with "Try again"
  - buttons that show a spinner while they work
- **Avatars:** people are round and companies square, each with a steady colour, and every client
  has a colour dot.

## 20. Free public tools

- **Illinois 720-hour checker:** any agency can upload hours without an account and see who is
  close to or over 720 hours at one client. Nothing is stored. It's a lead magnet that ends with
  "try the demo".

## 21. Demo mode

- **A complete fictional agency:**
  - three main clients in California, Illinois and Massachusetts, plus a New Jersey site
  - 40 invented workers
  - messy sample timesheets: handwritten-style sign-in sheets, a client PDF, a time-clock file and a
    portal export
  - two pay weeks
- **Sign-in:** "Continue as" buttons for each role, so anyone can click straight in.
- **Safety:**
  - a banner on every page and a one-click reset
  - no emails, texts or outside calls, ever
  - the same code as the real app
