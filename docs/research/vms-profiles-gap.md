# Research — the last gaps: Beeline, Coupa and Magnit files, voiding a credit note, onboarding policies

Date: 2026-10-17. For decision 0043. Every name, id and amount in the samples is invented.

## 1. Beeline, Coupa and Magnit timesheet exports

What was asked: read each VMS's timesheet export through a saved column-mapping profile, as Granite
already does for SAP Fieldglass (`fieldglass-time-sheet-export`, slice b), with the mapping editable
by the agency.

What the public documents say:
- **Beeline.** The supplier training PDFs name the reports and fields a supplier sees — a "Supplier
  Timesheet Extract" report, list reports that "can be modified and exported" — but publish no column
  list for the export. The vocabulary used: timesheet, Beeline ID, resource (the worker), work date,
  pay code, location.
  - https://webapps.beeline.com/beelinetms/!_ProductTechnologyTraining/ContinuingEducation-WebImportTool.pdf
  - https://hub.beeline.com/suppliers-313/supplier-reporting-overview-2732
- **Coupa (Contingent Workforce).** The supplier portal guides describe entering a time sheet per
  worker by "CW Number" and its approval workflow; the flat-file documentation lists only custom
  fields. No export column list. Vocabulary: time sheet, worker number, time sheet lines, rate type,
  status values in lower case with underscores (`pending_approval`, `approved`).
  - https://docs.coupa.com/en/supplier-documentation/coupa-for-suppliers/the-coupa-supplier-portal-or-csp/features-and-processes-in-the-coupa-supplier-portal/coupa-contingent-workforce/timesheet/msp-or-supplier-timesheet-entry
  - https://compass.coupa.com/en-us/products/product-documentation/supplier-resources/for-suppliers/coupa-contingent-workforce/timesheet
- **Magnit.** No public supplier documentation of a timesheet export was found. Vocabulary from its
  public pages: contractor, timesheet, time type.

Confidence: **low** for every column name. Each buyer configures its own report in all three
systems, so even a documented layout would differ between clients. Hence the design:
1. Each system gets a built-in profile in the system's own words (`src/server/intake/profiles.ts`),
   with one row per worker per day per pay code, the statuses that count, and the date format.
2. The agency renames any column to match the file its buyer actually sends (Settings › Connections ›
   Edit columns); the change is a new version of the profile, and each file read records which
   version read it. Restore brings back the built-in names.
3. Regular and overtime rows for one day add into the day's total, as Fieldglass's do; Granite's rules
   engine decides overtime from the day's hours, never from the VMS's pay code.

The invented samples (`scripts/generate-vms-samples.ts`, `demo/samples/vms/`) hold three workers for
a week, one day split 8 h regular + 1 h overtime, and a fourth sheet in a status that does not count:
14 days, 6,750 minutes, checked by hand in `src/server/intake/vms-profiles.test.ts`.

Invoice upload to these systems stays the generic mapped CSV (slice g): none publishes an invoice
import layout either.

## 2. Voiding a credit note (Stripe)

Stripe Invoicing: a credit note can be voided while its invoice is open, "increasing the amount due on
the invoice"; the voided note keeps its number and reads Void; the API returns `status: "void"` and
`voided_at`.
- https://docs.stripe.com/invoicing/dashboard/credit-notes
- https://docs.stripe.com/api/credit_notes/void

Granite reads "open" as nothing paid, written off or applied against the invoice (its own money
records), and asks for a reason (Stripe takes none; Granite's audit rule asks one for every reversal).
A correction run's credit note is part of a payroll correction and is not voided by hand.
Confidence: high for the rule; the reason is Granite's own (listed in the pattern).

## 3. Onboarding policies with versions

- Rippling's handbook article: the handbook is sent to new hires to acknowledge, and when it is
  updated the new version is rolled out to everyone to acknowledge again.
  https://www.rippling.com/blog/employee-handbook-for-small-business
- Gusto's custom documents for admins (title, text, who must sign): the help page loads by script and
  could not be read.
  https://support.gusto.com/article/139521470100000/upload-and-share-custom-documents-with-your-team-for-admins
- General HR practice (Blissbook, Mosey): re-acknowledge after a material change.
  https://blissbook.com/blog/when-should-employees-re-sign-the-handbook/

Design: every policy change is a new version from a date (today or later); a worker who
acknowledged an older version of a required policy is asked again (Home card, the onboarding step);
optional policies and ones starting later ask nobody today; removing a policy is a version that is
not active. Acknowledgments saved before versions count as version 1, and the agency's first save
keeps the three built-in policies as its version 1. Confidence: low (an article, not a screen).

## 4. A demo Recruiter

The sign-in page's "Continue as" list offered every role but the Recruiter (SPEC §2). Added a
fictional demo recruiter to the demo staff; no research needed.
