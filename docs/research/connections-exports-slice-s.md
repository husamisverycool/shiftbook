# Research S: Connections page and more exports

Prepared 2026-10-17 for Slice S (SPEC §27 item 4): an integrations page; ATS imports by file
(Bullhorn, JobAdder, Avionté); payroll export targets including Paychex Flex and Paylocity through a
mapped CSV profile configured from a sample file; a factor "schedule of accounts" export with the
timesheet backup bundle.

## How to read this

- Fetched live 2026-10-17 with Firecrawl. **High** = official page read in full; **Medium** =
  official page via extraction/excerpt, or a table whose column alignment was garbled;
  **Low** = third-party vendor doc; **Unverified** = not found.
- This file builds on `docs/research/payroll-formats-slice-f.md` §5.1, which already holds the
  Paychex Flex Standard Payroll Import (SPI) column list (HIGH via Deltek's spec, Paychex's own
  pages 404). It is summarized here, not re-derived.
- Hierarchy and interactions only; no copied names, icons, wording or colors.

---

## 0. Summary

| Granite piece | Primary pattern | Supporting pattern |
|---|---|---|
| Integrations page (`/settings/connections`) | **Zapier App Connections page** (two tabs: connections / apps; status filter; row menu: test, reconnect, rename, replace, delete; bulk test/delete action bar) | **Stripe "Use apps" catalogue** (grouped by category, name + one-line description); Stripe installed-apps rules (admins install/uninstall, everyone uses) |
| Add a connection | **Zapier "+ Add connection"** (search → select → connect in new window → appears in list) | n/a |
| File import (ATS placements, jobs, clients) | **Avionté BOLD Bulk Import** (type → upload with template → create or pick saved mapping → validate → fix only error rows inline → import; View Imports log with audit + download; Manage Mappings) | Bullhorn import/export field list |
| Payroll export profiles | Paychex Flex SPI (from Slice F research), **Paylocity WebPay time import** (Id, Det, detCode, Hours, Amount, Rate, rateCode) | Avionté mapping UI for "configure from a sample file" |
| Factor schedule of accounts export | Published Schedule of Accounts form (Compass) + SEC-filed factoring agreement definition | Money-flows research §6 |

---

## 1. Zapier: App Connections page

- **Sources (High):**
  - Manage your app connections: https://help.zapier.com/hc/en-us/articles/8496290788109-Manage-your-app-connections
  - Connect your app accounts to Zapier: https://help.zapier.com/hc/en-us/articles/8496258785421-Connect-your-app-accounts-to-Zapier

### Regions (top to bottom)
1. **Header**: page title; top-right primary action **+ Add connection**.
2. **Tabs**: Connections | Apps.
3. **Connections tab**: Filters button (status: active, expired, non-compliant; app; owner) and an
   ownership dropdown (all / owned by me / shared with me). Table columns: **Name** (connection
   name), **App**, **Zap workflows** (count using it), **Last modified** (includes tests),
   **People with access** (avatars). Each row has a checkbox and a "more" menu.
4. **Apps tab**: one row per app: **Name** (app + version), **Tags** (e.g. premium),
   **Expired connections** (count needing re-auth), **Connections** (count), **Zap workflows**,
   **Connection users**. Dropdown: latest public versions vs other versions. Click an app to see
   its connections.
5. **Bulk action bar** appears at the bottom when rows are checked (up to 100): **Test selected**,
   **Delete selected** (confirm dialog).

### Row menu actions (exact set)
- **Test connection** → shows Active (check) or Expired (cross) inline; Expired shows a
  **Reconnect** button beside the icon (owner only). Apps tab variant shows "Test successful" or a
  reconnect prompt.
- **Reconnect** → dialog → new browser window → provider sign-in → reconnected "for all Zap
  workflows, agents, and other Zapier products that use it".
- **Replace connection** (switch to a different account; all automations follow).
- **Rename** (dialog with Name field; default names are usernames/emails; suggests purpose-style
  names).
- **Share** / **Change owner** (team plans).
- **Delete** → confirm dialog; afterwards dependent automations must be repointed.

### Add connection flow
- + Add connection → search and pick app → **Add connection** → new tab/window for the provider's
  auth → back on the list. Pop-up blocker hint if nothing opens. Multiple accounts per app allowed;
  warning that the browser may silently reuse an existing login (log out or use a private window).
- In-context alternative: from inside a workflow step, "Sign in" (first time) or "Select" (pick or
  "+ Connect a new account").

### Error states (documented causes)
- Wrong credentials; insufficient permissions or plan; expired after password change or new
  security policy; 2FA incompatibility; changed email/domain.
- Limits: 5,000 connections per user.

---

## 2. Stripe apps catalogue and installed apps

- **Sources:**
  - Use apps from Stripe (High, Markdown): https://docs.stripe.com/use-stripe-apps.md
  - How do I install a Stripe App? (Medium, excerpt): https://support.stripe.com/questions/how-do-i-install-a-stripe-app
  - Where do I go to use a Stripe App? (Medium, excerpt): https://support.stripe.com/questions/where-do-i-go-to-use-a-stripe-app
  - Who can use Stripe Apps on my account? (Medium, excerpt): https://support.stripe.com/questions/who-can-use-stripe-apps-on-my-account

### Catalogue layout
- Grouped by **category headings** (E-commerce, In-person, CRM, ERP, Tax, Insurance, Automation);
  each entry = **name link + one-sentence description** of what it does for you.

### Install and manage rules
- Install from a listing page via an **Install app** button top-right; the user then **reviews the
  permissions requested and the privacy policy** before confirming. Only Administrators install;
  install is per account currently selected.
- After install, everyone on the team can use it; "only Administrators can change app settings or
  uninstall an app".
- Manage all installed apps from an "Installed" list under the apps overview. Install button is
  disabled with stated reasons when not allowed (reasons list not fetched; unverified).

---

## 3. Avionté BOLD: Bulk Import (the file-import pattern)

- **Source (High):** https://support.avionte.com/hc/en-us/articles/55995315997203-Bulk-Import-Functionality-Jobs-Placements-and-Companies

### Permissions
- Three separate grants: import from file; edit data during import; create/edit mappings
  ("mapping admin").

### New import wizard (exact order)
1. Header menu **Import → New Import**.
2. Choose import type (**Jobs**, **Placements**, **Companies**) → Next.
3. Upload CSV by click or drag-and-drop; a downloadable **template** per type is linked.
4. **Create New Mapping** (or choose a saved mapping from a dropdown and Validate).
5. Map each CSV column to a system field via dropdowns. Required system fields are marked; mapping
   **name** is required; optional fields can be toggled "required" to force validation.
6. **Validate & Save**. The Data Validation screen shows **only rows with errors**, with messages;
   fix values inline, or tick **Remove** to exclude a row; re-validate.
7. **Import** (or "Process Import" with a saved mapping after a success message).

### Required fields (exact)
- **Placements**: Job ID, Placement Office, Start Date, Talent ID, Reg Bill Rate, Reg Pay Rate.
  Optional: Employment Type, End Date, End Reason, Hire Date, OT Bill/Pay Rate, DT Bill/Pay Rate.
- **Jobs**: Available Positions, Company ID or Company Name, Company Department, Hiring Manager
  First/Last Name (matched to a contact), Job Status, Job Title, Job Type, Start Date, Target Bill
  Rate, Target Pay Rate, Worksite Country/State/City/Street 1, WC Code, Job Branch. Optional: Custom
  Job ID, End Date (after start), Job Owner Email (validated), Overtime (Straight Time, Paid and
  Billed, Paid not Billed), Rate Type (Hourly/Daily), Sales Rep Email, Week Duration (Mon-Sun,
  Sun-Sat, Sat-Fri), Worksite Street 2.
- **Companies**: Company Name, Home Office, Country (US/Canada spellings recognized),
  State/Province, Company Rep Email, Default Job Owner Email; optional address, phone, industry,
  source, status, website.

### After import
- **View Imports** list columns: Import ID, file name, mapping name, status (Imported, Import
  Failed, Import In Progress), imported by, type, date, actions (**Import Audit**, **Download
  CSV**). Imported data downloadable for 90 days.
- **Import Audit**: who, when, what changed, corrections applied during validation.
- **Manage Import Mappings** list: mapping name, type, created by/date, last used, last edited
  by/date, actions (edit, mapping audit, delete).

---

## 4. ATS placement export fields

### Avionté BOLD: Comprehensive Placement report (High)
- https://avionteboldsupport.zendesk.com/hc/en-us/articles/52633019456275-Enhanced-Comprehensive-Placement-Report
- One row per placement; export via a "more" menu → Download → Image / CSV / PDF / Excel; CSV
  recommended for very wide files; dynamic trailing columns (commission users, timesheet
  approvers, extra values) vary with the filtered data.
- Column groups (exact names, abridged): Placement Employer/Region/Office, Talent Office; Talent ID,
  BO Talent ID, Talent Name (First/Last), Talent Status, address, Email, Phone; Company ID, BO
  Company ID, Company Name, Department; Job ID, Job Title, Job Type, Job Status, Shift, Hiring
  Manager; worksite address, Job State, **Workers Comp Code and Rate**; Placement ID, BO Placement
  ID, Hired Date; **Start Date, End Date, End Reason, Original Start Date**, #Days on Placement;
  **Reg/OT/DT Bill and Pay Rate**, Salary Bill/Pay Rate, Rate Type, OT Type, VMS Fee, Markup;
  Reg/OT/DT Hours, Total Bill, Total Pay, Gross Profit; **Employment Type, Tax Type (1099, C2C,
  W-2)**, FLSA Classification, Work Schedule Type, Remote Work.
- Filters (right panel): division, region, office, talent office, company, worksite states, extra
  value, date type (entered / start / end / active), date from-to or quick range.

### Bullhorn ATS: custom import/export fields (Medium; table columns misaligned in extraction)
- https://kb.bullhorn.com/ats/Content/BHATS/Topics/listCustomImportExportFields.htm
- Placement-entity field identifiers seen in the "Supported Placement Fields" column include:
  `placementID`, `dateBegin`, `dateEnd`, `dateEffective`, `dateClientEffective`, `payRate`,
  `clientBillRate`, `overtimeRate`, `clientOverTimeRate`, `otExemption`, `employmentType`,
  `employeeType`, `hoursPerDay`, `hoursOfOperation`, `durationWeeks`, `daysGuaranteed`,
  `daysProRated`, `fee`, `billingFrequency`, `billingUserID`, `invoiceGroup`, `costCenter`,
  `jobPostingID`, `jobTitle`, `jobClientCorporationID`, `jobClientUserID`, `jobUserID`,
  `candidateSource`, `customPayRate1-10`, `customBillRate1-10`, plus `customText*`,
  `customDate*`, `correlatedCustom*`. Exact column membership needs a browser check
  (**unverified** per field).
- Bullhorn exports placement lists from the Placement List view (Medium, blog excerpt:
  https://www.bullhorn.com/customer-blog/support-tip-end-of-the-year-reporting/).

### JobAdder
- No public placement export column list found (**gap**). One third-party migration page claims the
  JobAdder API is the only path where a placement carries both pay and charge rate (Low:
  https://workhr.ai/migrate). Treat JobAdder files as "map from sample" only.

---

## 5. Payroll import targets

### Paychex Flex: Standard Payroll Import (from Slice F research; HIGH for columns)
- Column order: `Client ID, Worker ID, Org, Job Number, Pay Component, Rate, Rate Number, Hours,
  Units, Line Date, Amount, Check Seq Number, Override State, Override Local, Override Local
  Jurisdiction, Labor Assignment`. Pay Component case-sensitive; Rate overrides loaded rate; Hours
  or Units, not both; Amount empty when Hours non-zero; Line Date `mm/dd/yyyy`; header row not
  required; column count 16 vs 17 is an open discrepancy. See `payroll-formats-slice-f.md` §5.1.
- A 2026 third-party article on Paychex Flex CSV import exists but could not be extracted
  (https://getclox.com/blog/paychex-flex-payroll-import; unverified).

### Paylocity WebPay: time import batch (Low; two third-party vendor docs agree)
- ClickTime: https://support.clicktime.com/hc/en-us/articles/41025186225549-Export-Payroll-Data-to-Paylocity-WebPay
- Buddy Punch: https://docs.buddypunch.com/en/articles/1262234-how-to-integrate-with-paylocity-webpay
- **Columns (exact, in order)**: A `Id` (Paylocity employee identifier), B `Det` (always `E` for
  earnings), C `detCode` (earning code: worked-time code, overtime code, or a leave code), D
  `Hours`, E `Amount` (blank by default), F `Rate` (blank by default), G `rateCode` (overtime rate
  code on OT rows). One row per employee × time type. "do not rename the column headers or change
  their order".
- **Import path in WebPay**: Payroll → Payroll Entry → Batch Type **TimeImprt** → Add Batch → choose
  new batch or merge into existing → upload time import file → Import → **Status Report** with
  warnings/errors ("Errors will not import"), option to ignore errors and import.
- Codes are company-specific (case-sensitive detCode), so Granite's profile must hold a code map
  per earning type, per agency.
- Paylocity's developer docs also describe an API punch import (Time & Labor) with a downloadable
  result CSV (Medium excerpt: https://developer.paylocity.com/integrations/reference/punch-import-overview);
  not a file layout.

---

## 6. Factor schedule of accounts export

- **Sources:** Compass Funding Solutions form (High as a document): https://compassfs.net/_Old_Website/scac011.pdf ;
  SEC-filed factoring agreement (High for the definition): https://www.sec.gov/Archives/edgar/data/1665300/000121390018004257/fs42018ex10-17_stellaracq3.htm ;
  same filing's client instructions (Medium excerpt) require invoices to carry the factor's notice
  of assignment and to be listed on a signed SOA with backup.
- **Columns** (Compass): Debtor Name, Invoice Number, Date, Reference / PO Number, Invoice Amount;
  footer total; signed certification and assignment paragraph; factor-only section (check no.,
  check date, total, fee %, reserve, charge back, rebates, cash payment).
- **Definition** (SEC filing): a signed bill of sale identifying each receivable with "the correct
  amount owed by the Account Debtor, the name and address of the Account Debtor, the invoice
  number, and the invoice date".
- **Recommended Granite CSV columns** (union of the above, our naming): schedule number, schedule
  date, agency legal name, debtor (client) legal name, debtor address, invoice number, invoice
  date, due date, PO / reference, week ending, invoice amount (cents in file as dollars with 2 dp),
  backup file name; footer: count and total. Bundle: SOA CSV + SOA PDF for signature + invoice PDFs
  + approved timesheet PDFs (staffing factors want approved timesheets, see money-flows research
  §6).

---

## Recommended hierarchy for Granite

### `/settings/connections`
- Header with primary **Add connection** (Zapier) · tabs **Connected** | **Available** (Zapier
  Connections/Apps tabs, with the Available tab laid out as a category-grouped catalogue of name +
  one-line purpose: Stripe apps catalogue).
- Connected table: name (renamable), type (ATS import, payroll export, VMS profile, forwarding
  address, partner handoff), used by (count of runs/exports), last activity, status
  (active / needs attention) (Zapier columns adapted) · row menu: Test, Reconnect/Re-upload sample,
  Rename, Replace, Remove with confirm (Zapier) · bulk test/remove bar (Zapier).
- Install/remove only for admins; everyone can use (Stripe installed-app rule); permission review
  step before enabling a partner handoff (Stripe install review).

### `/imports/new` (ATS file import) and mapped CSV profiles
- Stepper: type (placements / jobs / clients / workers) → upload with template link → create or
  choose saved mapping → map columns with required markers → validate → **error rows only** with
  inline fix and remove-row → import (Avionté Bulk Import).
- `/imports` log: id, file, mapping, status, by, type, date, actions audit + download (Avionté View
  Imports) · `/imports/mappings`: name, type, created, last used, last edited, actions (Avionté).
- Payroll export profiles (Paychex Flex, Paylocity) reuse the same mapper but in reverse: upload a
  sample file → detect columns → map Granite fields and code tables (detCode / Pay Component per
  earning type) → preview first rows → save profile (Avionté mapping UI; column rules from Paychex
  SPI and Paylocity TimeImprt).

### `/exports/factor`
- Pick approved invoices → preview SOA table (Compass columns + SEC definition) → totals → generate
  bundle (CSV, signature PDF, invoices, timesheets) → record handoff (SPEC §27.4/§27.9).

### Gaps
- JobAdder placement export columns: not public.
- Bullhorn placement field list: column alignment needs a browser check.
- Paylocity layout only from third-party vendors (Low); Paychex official spec pages still 404.
- Stripe "why can't I install" reasons not fetched.
