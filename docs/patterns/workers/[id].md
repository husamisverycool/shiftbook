# Pattern: A worker's profile (`/workers/[id]`)

Status: adopted — slice (k) plan, step 2 (2026-10-16, under the owner's "just keep going")
Reference product and screen: Toast Payroll — employee profile (tabs **Profile** and **Employment**
at the top of the record; the Profile tab has separate sections, each with its own **Edit**: edit the
fields, save, and the section shows them at once; **Retrieve SSN**: confirm the look is for business
purposes, then the eye icon shows the number, and everyone who viewed or edited it is listed in the
same pop-up; a new SSN already on another profile does not save; profiles are never deleted —
employment ends and the record is kept); Square — a team member's profile sections in order, each
with Edit (personal information first)
Source URL: https://intercom.help/toast-central/en/articles/15483757-toast-payroll-update-employee-profile-information
Source URL: https://squareup.com/help/us/en/article/6455
Researched: 2026-10-16 (`docs/research/roster-audit-language-slice-k.md` §1b, §1c). Confidence: high
for the tabs, the per-section Edit and the Retrieve SSN steps; the layout's spacing is not documented.

## Purpose in Granite
One worker (SPEC §17): who they are, their language, their SSN (the last four; the whole number
only for the Owner, with a reason, every look recorded), their payroll numbers per system, their
documents, and their employment (hire date, I-9 dates, assignments, end of employment).

## Hierarchy
1. **"Workers" above** the title; **H1** the worker's name with a status badge (Active / Ended).
2. **Tabs** (Toast): **Profile** · **Employment** · **Documents**.
3. **Profile** tab — sections in order, each with its heading and its own **Edit** on the right:
   1. **Personal** — first name, last name, preferred language (English, Spanish).
   2. **Social Security number** — "•••-••-1234" (or "Not on file"); **Edit** to enter or replace it
      (nine digits; refused when already on another worker, and the refused try is listed on that
      worker); **Retrieve SSN** (the Owner only): a dialog asks the business reason (required, with
      no SSN in it), then **Show** reveals the number in the dialog; the dialog lists everyone who
      viewed or changed it, opened a file holding it, or entered it on another worker — when, and
      why.
   3. **Payroll numbers** — one row per payroll system (Gusto, QuickBooks Desktop, QuickBooks
      Online, ADP Workforce Now, RUN, Spreadsheet), the number or "Not set".
4. **Employment** tab: **Status** (Active, or Ended on a date — **End employment** / **Rehire**,
   Toast's status change); **Hire date and Form I-9** (dates only, as the compliance duties use
   them; Edit); **Assignments** (job, client, dates; links to the job order).
5. **Documents** tab: the worker's files (name, kind, effective date, added by and when), **Add
   document** (a file, its kind — Form W-4, state withholding form, direct deposit form, other — and
   its effective date), **Remove** (it leaves the profile; the file is kept). No copies of Form I-9
   or identity documents (decision J4: the I-9 is dates only); a file name with an SSN in it is
   refused; the line under the form says so and asks for no date of birth either. A file holds the
   SSN (a W-4) or bank details, so it opens the way Retrieve SSN does: the Owner clicks its name, a
   dialog asks the business reason, **Open file** downloads it, and the opening is listed in the
   Retrieve SSN dialog's "who viewed or changed it".

## Interactions
- Edit → the section's fields become inputs with **Save** and **Cancel**; Escape cancels.
- Retrieve SSN → reason → Show; closing the dialog hides the number again. Entering or replacing an
  SSN and Show ask "Confirm it's you" first when nothing was confirmed in the last 15 minutes
  (`_components/confirm-access.md`).
- The tab is in the address (`?tab=employment`), so a link can open it.

## States
- Not the Owner: no Retrieve SSN (the last four only); the accountant and Billing see no Edit, no
  Add document and no Remove, and one line saying the Owner and coordinators change the profile.
- Not the Owner: the documents' list without opening, and the line saying the Owner opens a
  worker's files, with a reason (decision 0027).
- More than 30 SSNs entered by one person within an hour: "Too many…; try again later".
- Ending employment while assignments are current: the dialog says how many, to end them on their
  job orders.
- An SSN that breaks the rules or is already on another worker: a message under the field.
- No documents yet: one line and Add document.

## Never copy
Toast's or Square's wording, icons, colors or logos.

## Look (decision 0029, from the products' own screenshots)
Laid out as `_components/record-page.md`: "Workers" above the name with its status, and under them one muted line: the worker's number in the payroll system in use and when they were hired (Stripe's detail page description, "Pro plan customer since March 2022.", https://docs.stripe.com/stripe-apps/components/detailpage); the tabs and their sections on the left, each section a module with its own Edit; Details on the right (status, assignment linking to its job order — underlined, as the record pages' links are — hired, preferred language). Under Details, a second module **Earned wage access** (slice w,
`money/wage-access.md`; Stripe detail sidebar modules): what is available of what was earned from
unpaid hours, or that wage access is off, and a link to the Money › Wage access page.

## Onboarding and messages (slice t)
References: Gusto's admin onboarding (People › Onboarding › the person › Tasks; **Send and
continue** emails the person a link to enter their own details,
https://support.gusto.com/article/210728164125837/add-new-employees-to-gusto); WhatsApp's chat for
the thread (https://faq.whatsapp.com/).
- Two more tabs: **Onboarding** · **Messages** (after Documents).
- **Onboarding**: the mobile number (Edit, US numbers; the worker signs in to the worker app with
  it); **Send onboarding link** (a text message with the app's address; demo: kept in the demo
  outbox); the checklist — Personal information, Taxes (Form W-4), Work eligibility (Form I-9
  Section 1), Payment, Policies, Signed — each Done with its date or To do; the signed forms each
  open like a worker's file (the Owner, with a reason: they hold the SSN's last four and bank
  details' last four only, yet the rule is the same); the payment method as "Direct deposit ••••1234"
  or "Paper check". Who may send: the Owner, coordinators and recruiters.
- **Messages**: the thread with the worker (their messages on the left, the agency's on the right
  with who wrote them), a translation under each message in the other language, a field and **Send**
  at the bottom.
- Clients' **Worker app clock-in** setting (client page): Off, On, On with location.

## Loading and errors (slice o)
- Loading: the page's outline in the record shape (`_components/loading.md`); buttons that start
  work show a spinner in place of their icon (Primer Button `loading`).
- A failure: the frame stays; the failed content's place says so with "Try again"
  (`_components/error.md`).

Deviations allowed: none
