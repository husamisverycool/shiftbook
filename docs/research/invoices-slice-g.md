# Research G: Invoices slice (SPEC §12): backup bundles, templates, grouping, PO, CSV and VMS uploads, screens

Researched 2026-10-16 for Shiftbook. All facts come from the vendors' own public help pages unless
marked otherwise. No real customer data, names or SSNs appear here. Example values are invented and
clearly fake (IDs like `XXXXTS00000001` follow SAP's own placeholder style).

**Confidence key.** **H** means read directly in the vendor's own documentation. **M** means read
in vendor documentation but the detail is thin, or it was inferred from two or more vendor pages.
**L** means a community or third-party source, or a search snippet only. **[UNVERIFIED]** means I
could not confirm it in any primary source.

**What I could not read**
- Adobe Acrobat redaction help returned 403. Firecrawl was out of credits, so I used Google's
  image-redaction docs instead.
- The California statute page (leginfo) returned 403 to direct fetches. I read the statute text
  through a government-index excerpt.
- The Coupa Compass page is a 404. I read the same page on docs.coupa.com.
- Beeline Enterprise, VNDLY and Magnit publish no supplier invoicing documentation that I could find.
- SAP KBA 3043412 requires an SAP login.
- SAP Ariba publishes no standard CSV field list: each template is specific to the buyer.
- I found no published invoice documentation for Ceridian (staffing), Tempus/ClearView, COATS or
  Zenople. Haley Marketing is a marketing firm for staffing companies; I found no back-office
  invoicing product from them [UNVERIFIED].
- Stripe documents its invoice list mechanics but not its exact default columns. Column names are
  marked [UNVERIFIED].

---

## Executive summary

1. **Backup is a standard staffing feature, and every vendor sets it per client.**
   - Bullhorn Back Office has a "Show Timesheets" Yes/No setting on each billing contact.
   - Bullhorn One sets "File Types for Invoicing" on the client's Invoice Terms: Timesheet image,
     Timesheet Attachment, Expense Report and Expense Receipt.
   - TempWorks offers three invoice methods that add timecard images: "Print with Timecard Image",
     "Print and Email with Timecard Image" and "Email with Timecard Image".
   - Avionté has a "Show Time Card" setting, plus an option that merges the invoice and the
     timecards into one PDF.
   - Confidence: H.
2. **The usual delivery is one PDF: invoice pages first, then each timecard image on its own page**
   (Avionté).
   - Bullhorn One orders attachments to match the invoice lines (line ID, then transaction date,
     then file type) and compresses images to 300 DPI at 70% quality.
   - A ZIP appears in three cases:
     - Bullhorn Back Office, when an attachment is not a PDF;
     - Bullhorn One "Consolidated Email", which sends a ZIP of invoice PDFs with a 10 MB limit;
     - Coupa uploads, where the CSV and attachments go in one ZIP under 8 MB.
   - Confidence: H.
3. **Approver evidence shows up three ways:**
   - an approval line on each invoice line. Bullhorn Back Office's `[APPROVE_LOG]` prints
     "Approved by <Last, First> on <date> at <time> <zone>". TempWorks has an
     "Invoice WebCenter - Approver" style that shows the approver on each line.
   - a signed or approved image. Examples: Bullhorn Time & Expense "Approval Attachment",
     Bullhorn's client-attach queue with Approve or No Signature, and the Group Timesheet
     Signature Report.
   - per-day hours. Avionté has "Show Daily Hours". TrackTik's "Details per employee" shows
     scheduled versus clocked times, hours, and hourly and total costs.
   - Confidence: H.
4. **Grouping works on three levels in every mature staffing product:**
   - **Split**: separate invoices. This is TempWorks "Create Separate Invoices", Avionté "Separate
     Invoice By" and Bullhorn One "Split By".
   - **Group**: subtotals within an invoice. This is Bullhorn One "Group By" (the standard
     template allows two levels) and Avionté "Group Invoice By", where the order of selection
     matters.
   - **Summarize/Sort**: how lines are built and ordered. Sorting by worker sorts by last name.
   - Splitting by PO and by worksite is offered everywhere. Confidence: H.
5. **"Consolidated" means four different things in staffing:**
   - one invoice covering several weeks (Bullhorn One "Monthly by Customer (Consolidated
     Invoice)");
   - a merged document for presentation only, where payments are still applied to each original
     invoice (Avionté "Invoice Merge", TempWorks "Merge Invoices");
   - an AR statement (QuickBooks Balance Forward, Open Item or Transaction statements; Avionté
     "AR Statement Letter");
   - one email carrying many invoices (Bullhorn One "Consolidated Email").
   - SPEC §12's "consolidated statement" needs an owner decision on which one is meant.
   - Confidence: H for the definitions.
6. **PO handling.**
   - The PO usually lives on the client (one PO for everything) or on the placement or order (one
     PO each).
   - Products show the PO in one of three places:
     - a header field (Stripe custom fields, up to 4);
     - the top of each invoice page when splitting by PO (Avionté);
     - a value on each line (TempWorks "Invoice Line Items", Bullhorn `[PO_NUMBER]`).
   - Bullhorn One has a "PO Required" flag on Invoice Terms. It is separate from splitting:
     "Requiring a PO does not automatically split invoices."
   - TempWorks POs carry an end date with a warning date 10 days before it, and a warning amount
     at 75% of the PO value.
   - The exact blocking behaviour of "PO Required" is not documented [UNVERIFIED].
   - Confidence: H, except where noted.
7. **VMS invoicing is mostly done by the VMS itself.**
   - SAP Fieldglass buyers turn "Auto Invoicing" on (an invoice is created for each approved time
     sheet) or off (the supplier creates the invoices). Buyers can consolidate either way.
   - Beeline Professional builds consolidated invoices from "blueprints" and can let suppliers
     upload an externally created invoice against a batch.
   - SAP Fieldglass is the only VMS I found that publishes **supplier-side invoice upload columns**
     ("Time Sheet Invoice Upload": Invoice Code, TIMESHEET ID, ORIGINAL TIMESHEET ID, Job Seeker
     ID, Paid Amount, Total Billing Amount, Remit to Address Code, plus `[c]`, `[rvc]` and `[a]`
     columns).
   - Coupa publishes its full invoice CSV loader: header, line, allocation and tax columns, sent
     over SFTP using a template the customer supplies.
   - Ariba's CSV templates are specific to each buyer, and no general field list is published.
   - Confidence: H.
8. **Screen references.**
   - Stripe documents these list mechanics:
     - status tabs or chips, and badges where an open invoice may show "Past due", "Retrying"
       or "Pending";
     - Edit columns, Export CSV, and a ⋯ menu on each row (Download PDF, Duplicate, Delete
       draft, view customer, Edit invoice).
   - Stripe documents these parts of the detail page:
     - Edit invoice (revision), Send invoice with a preview, More actions > Issue a credit note,
       and Change invoice status;
     - a "History" section and an embedded revision timeline;
     - customer-level billing defaults, with a documented order of precedence.
   - The staffing additions come from Bullhorn:
     - selecting many invoices with "# Selected" actions (Mark as Ready, Finalize, Save as one
       PDF, Export);
     - a "Timesheet Status" pop-up listing Employee, Placement title and Status;
     - credit invoices that link back to the original.
   - Confidence: H for the mechanics; the exact list columns are [UNVERIFIED].
9. **Client billing settings.** The best-documented model is Bullhorn One:
   - Billing Profile → Invoice Terms → Invoice Statement Template;
   - Invoice Terms have **effective-dated versions**, which fits Shiftbook's effective-dates rule;
   - Avionté's "Billing Preferences" adds an audit trail of changes.
   - Confidence: H.
10. **Redaction.** No vendor documents automatic SSN or date-of-birth redaction of timesheet images
    for client backup [UNVERIFIED that none exists].
    - Google Sensitive Data Protection is a documented pattern: it finds text in images by OCR and
      covers matches such as `US_SOCIAL_SECURITY_NUMBER` with opaque boxes, black by default.
    - NIST SP 800-122 names SSN and date of birth as PII.
    - California Civ. Code §1798.85 restricts displaying and mailing SSNs.
    - Confidence: H for the sources. Applying them to client backup is my inference (M).

---

## 1. Staffing invoice backup: what is attached and how back offices document it

### 1.1 Vendor-by-vendor

| Vendor / product | Where it is set | What gets attached / shown | Format, order, limits | Conf. |
|---|---|---|---|---|
| **Bullhorn Back Office** | Company → Contacts → (department) → Edit → **Invoice Information → "Show Timesheets"**: Yes attaches timesheets automatically; No does not [S1] | Timesheets attached to the client's invoices. A change updates invoices still "In Progress" but not those already approved or processed [S1]. Attachments can also be added by hand: Receivables → open invoice → **Attachments** button → drag and drop, with a trash icon to remove [S1][S13][S14] | Attachments are sent as PDFs if all of them are PDFs; otherwise they are combined into a ZIP [S4] | H |
| Bullhorn Back Office | Contact → Edit → Invoice Information → **"Expense Detail Report"** toggle [S3] | Yes gives a detailed expense report with billable expenses and receipts. No gives only a summary line on the timesheet [S3] | n/a | H |
| Bullhorn Back Office | Contact → **Invoice Lines** template with variables [S2] | Line text can include `[FIRST_NAME]` `[LAST_NAME]` `[PO_NUMBER]` `[ASSIGNMENT_TITLE]` `[ASSIGNMENT_CUSTOM_TEXT1-3]` `[START_PERIOD]` `[END_PERIOD]` **`[APPROVE_LOG]`** `[EXPENSE_DESCRIPTION]` `[PER_DIEM]`. `[APPROVE_LOG]` prints "Approved by <Last, First> on <M/D/YY> at <h:mm AM> <zone>" [S2] | The firm-wide default can be changed only for new contacts; Support runs a script to apply it to existing ones [S2] | H |
| **Bullhorn One** (Pay & Bill) | Company → Invoice Terms → **"File Types for Invoicing"** [S20] | **Timesheet**: the timesheet from Bullhorn Time & Expense "displayed as an image". **Timesheet Attachment**: e.g. an original timesheet entered outside that product. **Expense Report**, shown as an image. **Expense Receipt** [S20] | Attachments are ordered by the invoice line ID on the transactions, then transaction date, then attachment file type [S24]. With "Summarize By: Placement > Candidate", invoice lines and attachments are alphabetical by candidate last name [S21] | H |
| Bullhorn One | Same Invoice Terms: **"Invoice Only Approved Timecards"** and **"Approval Required"** [S20] | Controls whether charges can be invoiced before the timecard is approved, and whether the invoice needs approval before it is finalized [S20] | n/a | H |
| Bullhorn One | Corporation-level setting, switched on by Support [S25] | **Invoice Compression**: images inside PDF invoices are compressed | Default maximum resolution 300 DPI, quality 70% [S25] | H |
| **Bullhorn Time & Expense** | Worker's Web Time Entry → attachments icon → **"Approval Attachment"** [S40] | "An image that indicates that your time has been authorized by a local approver" [S40] | One image per file type per assignment; combine pages into one; .gif .png .jpg .tif .pdf; 4 MB maximum [S40] | H |
| Bullhorn Time & Expense | Call Center Dashboard → "Client Attach Queue" [S41] | Staff view the image beside the assignment details (including the week-ending date) and click **Approve**, or **No Signature**, which requires a comment [S41] | n/a | H |
| Bullhorn Time & Expense | Group Timesheets → printer icon [S42] | **Signature Report**: "time entered by day and period total" with "a signature line for employees" [S42] | n/a | H |
| **TempWorks Enterprise** | Customer → Invoice Setup → Billing Setup → **Invoice Method** set to "Print with Timecard Image", "Print and Email with Timecard Image" or "Email with Timecard Image". Needs the **Timecard Linker** add-on [S45] | Linked timecard images are attached to invoices during the invoice run [S45] | Timecards must be PDFs, and one PDF may hold several. Each image is linked to its time-entry lines. "Verified mode" makes the linker type in the hours from the image; a mismatch sets the status to "Linked with partial hours verified". Image errors such as a missing signature or wrong hours are reported by "Problem Type" with an "Override" option. The "Timecard Linking Hours Breakdown" report lists missing or mismatched links. Staging offers "Preview Invoice w/ Timecards". After posting, the images appear under Extend Invoice Details > Transaction [S45] | H |
| TempWorks Enterprise and Beyond | Billing Setup → **Style** [S46][S47] | Generic styles: **"Invoice S Type"** (single pass, one transaction per line) and **"Invoice T Type"** (triple pass: Regular, OT and DT on separate rows). **"Invoice WebCenter - Approver"** shows the approving supervisor's name on each line [S46][S47] | Beyond can preview the standard styles; custom styles cannot be previewed [S47] | H |
| TempWorks Beyond | Billing Setup → **Invoice Recipients** card [S47] | For each recipient: contact, "Method Type" (which email), **attachment type**, and the checkbox **"One invoice per email"** (each invoice in its own email, or all in one) [S47] | The values for attachment type are not listed [UNVERIFIED] | H/M |
| **Avionté** (Classic) | Customer → Back Office Setup → Billing Setup → **"Show Time Card" = Yes**, plus an Invoice Style that allows time cards [S50][S52] | Timecards attached per invoice, in the Billing batch or after posting in Invoice → Actions → Attach Time Cards [S50] | Accepts .pdf .doc .jpeg .png .tif/.tiff .xls. "Each time card image attached will show on its own individual page each in addition to the Invoice page(s)". For several pages, use the folder option so the order is kept [S50]. With Show Time Card on, Excel output is no longer available, only PDF [S52] | H |
| Avionté | Admin config **"MergeInvoice&AttachmentPDF" = True** [S51] | The invoice is merged with its attached time cards into one PDF, both in preview and in the email sent from the Invoice section [S51] | Default False [S51] | H |
| Avionté | Billing Setup: **"Show Daily Hours"**, **"Show Web Time Card"** (a grid of web-entered time at the bottom of the invoice), **"Display Items"** [S52][S53] | Per-day hours on the invoice; a web time grid [S52] | n/a | H |
| **TrackTik** | Client contract → Hourly Billing Invoice Details → **"Include Timesheets: Details per employee"** [S62] | "Scheduled vs. clocked times and hours and hourly and total costs", included with the next invoice [S62] | n/a | H |

### 1.2 Fields that appear on staffing backup (synthesis)

Each item names the sources that show it.

- **Worker identity:**
  - first and last name (Bullhorn Back Office variables [S2]);
  - an employee or worker ID (Beeline "Worker ID", Fieldglass "Job Seeker ID" [S77][S65]).
  - Confidence: H.
- **Days and hours:**
  - per-day hours (Avionté [S52]);
  - time in and out (Beeline "Time In" and "Time Out", optional fields [S77]);
  - hours by earning code (Beeline "Time Code Name", "Hours" [S77]; TempWorks "T Type" [S46]);
  - period start and end (`[START_PERIOD]` and `[END_PERIOD]` [S2]); week-ending date (Fieldglass,
    Beeline [S67][S77]).
  - Confidence: H.
- **Approval:**
  - approver name with date and time (`[APPROVE_LOG]` [S2]; Beeline "Approving Manager",
    "Approval Date" and the optional "Approval Time" [S77]; TempWorks Approver style [S46]);
  - the signed image (Bullhorn Time & Expense Approval Attachment [S40]).
  - Confidence: H.
- **Client references:** PO number, cost center, timesheet ID (Beeline and Fieldglass [S77][S67]).
  Confidence: H.
- **Rates and amounts:**
  - bill rate and amount per line (Beeline "Allocation Rate" and "Gross Amount" [S77]);
  - TrackTik shows hourly and total cost [S62].
  - Confidence: H.

---

## 2. Invoice grouping rules

### 2.1 Split, group, sort: options per vendor

| Vendor | Separate invoices by ("split") | Group within an invoice | Line building and sort | Notes | Conf. |
|---|---|---|---|---|---|
| **Bullhorn One** [S21][S20] | **Split By** any field of Bill Master, Billable Charge, Candidate, Placement or Customer Required Fields. Examples: candidate, week-ending date, expenses vs time, billing calendar, shift | **Group By**, which subtotals each group. Examples: week ending, expenses vs time, **PO number**, shift. "The standard template supports two group bys"; more needs a custom invoice. "If split by is used, it is not recommended to group by the same field" | **Summarize By** sets the invoice lines. Examples: candidate, earn code, week ending, PO, bill rate, earn-code alias. Lines and attachments sort by the summarize fields, e.g. candidate last name | Hours and expenses share one invoice unless you split by charge type. Documented examples: "Weekly Invoicing by Candidate with Separate Invoices for Time and Expenses", "Weekly by Customer (Consolidated Invoice)", "Monthly Invoicing by Candidate", "Monthly by Customer (Consolidated Invoice) and Grouped by Week End Date" [S21] | H |
| **Bullhorn Back Office** [S5][S6][S7][S17] | **Invoice Groups**: set the contact's Invoice Information **Type** to "One invoice for each Invoice Grouping", then type a group name on each placement (e.g. by location or PO). Placements with the same name share an invoice | n/a | Invoice Lines templates (variables) | **Invoice Frequency** can be weekly, bi-weekly (Cycle 1 or 2, with a hover showing the date range) or **Batch**. A batch has a name shared across companies; you create it on Receivables with Create > Create Batch, enter start and end dates, Preview, then "Create New Invoice Batch" | H |
| **TempWorks** Enterprise [S46] and Beyond [S47] | **Create Separate Invoices** checkboxes: Department, Order (Job Order), Assignment, Employee (ID), Week end (late timecards), Cost center, **PO** ("a different invoice number for each po number used"), Branch, **Worksite**, Supervisor, Job title, Sub-entity, Division, Department address; Beyond adds Shift | n/a | **Invoice Line Items**: extra fields printed on each line, e.g. PO number | Selections combine. Worked example: billing at 4 worksites in 2 branches with Branch and Worksite ticked gives **4** invoices [S46]. Supervisor plus worksite gives one invoice per combination [S47]. Departments choose "Apply All Billing To Parent" or "Invoice Department Separately" [S46] | H |
| **Avionté** [S52][S53] | **Separate Invoice By**: Day Worked, Assignment ID, BranchName, Department Name, Employee, Job Title, **Max Invoice Amount**, **PO#**, **PO Number**, ShiftName, StaffingOrderID, Supervisor, WeekWorked, **Work Address**. Each separate invoice gets a new number | **Group Invoice By**: the order of selection sets the grouping order | **Sort Invoice By**: selection order is sort order; "Employee" sorts by last name | Max Invoice Amount moves whole transactions to a new invoice and is applied after the other splits. Changes to Separate By are **not** retroactive, but changes to Group, Sort and Display **are** reflected immediately in historical invoices [S53] | H |
| Avionté BOLD [S57] | "Consolidate Invoices" on each job; jobs with the same billing contact combine | n/a | n/a | Applies only to BOLD payroll and invoicing customers [S57] | H |
| **Stripe** [S96][S97] | n/a (one invoice per call) | **Line item grouping** in invoice rendering templates. A "Group by" expression (in Common Expression Language, CEL) groups lines under a summary item; groups can be hidden so only the group subtotal shows. Up to 10 grouping policies per template; policy order matters | n/a | Templates can be attached to a customer and then apply to all their future invoices [S96] | H |

### 2.2 What "consolidated" means (four distinct things)

| Meaning | Who documents it | What the document contains | AR effect | Conf. |
|---|---|---|---|---|
| **A. One invoice covering a longer cycle** | Bullhorn One "Monthly by Customer (Consolidated Invoice) and Grouped by Week End Date" [S21]; billing calendars make charges eligible only after the calendar period ends [S35] | One invoice number, with lines grouped and subtotalled by week ending | One open item | H |
| **B. Merged presentation of several invoices** | **Avionté "Invoice Merge"** [S55]; **TempWorks "Merge Invoices"** [S49] | Avionté: pick two or more open invoices for one customer and choose the number printed on the merged document ("Invoice As"). Then select the items to include ("Deselect all zero items" is available). Then email or preview. TempWorks: choose a parent invoice (keep its number or make a new one), add the others, then view or print | **Payments are still applied to each original invoice.** Avionté: "for AR, each original invoice is still its own record". TempWorks: "you will still apply the payments to each invoice's original number". Both can undo a merge (Avionté's "Remove Invoice Merge" utility; TempWorks' "X" on the merged-invoices view). Avionté shows a read-only "Merged" column under AR Balance | H |
| **C. Statement (AR summary)** | QuickBooks Online statements: **Balance Forward** (invoices, payments and current balance for a date range), **Open Item** (unpaid invoices from a start date to today), **Transaction Statement** (all transactions in a range) [S106]. **Avionté "AR Statement Letter"**: invoice number, amount paid, finance charges, remaining balance; selectable by customer, branch or **PO number**; can be emailed automatically each month on a set day [S56][S52] | A list of invoices with their balances | None (information only) | M for QuickBooks (read via search excerpts of the Intuit article); H for Avionté |
| **D. One email, many invoices** | **Bullhorn One "Consolidated Email"**, a Billing Profile delivery method [S22][S23]; TempWorks Beyond "One invoice per email" checkbox [S47] | A ZIP of the invoice PDFs, 10 MB limit. In the email body, the dates show the earliest statement and due dates, and the total is the sum of all invoices [S23] | None | H |
| (VMS-side) **Consolidated invoice by the buyer** | SAP Fieldglass: invoices sit in "Pending Consolidation", then become "Consolidated" [S72][S66]; Beeline Professional blueprints [S75][S78] | The buyer combines supplier invoices for its accounts payable | Buyer-side | H |

---

## 3. PO header invoices

### 3.1 Where the PO lives and how it prints

- **Bullhorn Back Office** [S8][S2]: two places.
  - **On the billing contact**, in the "PO NUMBER" field under Invoice Information, when every
    placement under that contact uses one PO. The placement must have "PO Number Same As Billing
    Contact" turned on.
  - **On each placement**, printed through `[PO_NUMBER]` in the Invoice Lines.
  - In the email template, `[PO_NUMBER]` resolves to the placement's PO when the invoice has one
    placement. Otherwise it uses the department (contact) PO.
  - Confidence: H.
- **Bullhorn One** [S27][S20][S21]:
  - Purchase Orders are records on the company, with these fields: Name, Description, Start
    Date, End Date, Warning Date, Total Budget, Warning Balance, External Amount and Total Hours.
  - They are attached to placements through a "Purchase Order" Customer Required Field. The
    worker picks the PO at time entry; "Required on Timesheet" makes the choice mandatory.
  - Invoices can be split, grouped or summarized by PO.
  - Invoice Terms have **"PO Required"**: "Indicates whether a Purchase Order is Required under
    this Invoice Term. PO Required and Split By settings are independent. Requiring a PO does not
    automatically split invoices."
  - Confidence: H.
- **TempWorks Beyond** [S48]:
  - Path: Customer → Invoice Setup → PO Setup.
  - Fields: PO Number (letters, digits and symbols allowed), PO Value (enter 0.00 if there is
    none), End Date, and "Applies To Child Departments".
  - Two warnings are added automatically: a warning amount at 75% of the value, and a warning
    date 10 days before the end date.
  - An expired PO cannot be chosen for new orders, but it keeps printing on assignments that
    already have it.
  - **Two documented invoice options**: "Option 1: Create Separate Invoices by PO number" and
    "Option 2: Adding PO Number as a Line Item on Invoices".
  - A PO can be assigned in bulk to orders, assignments and timecards, e.g. "the client gives
    you a new PO number each week".
  - Confidence: H.
- **Avionté** [S54]: two kinds of PO.
  - **"PO #"** is managed under Order Options. It can hold several active POs, values, limits and
    warning values, and flows into Order Detail and Time Entry.
  - **"PO Number"** is free text under Order > Extra.
  - Either can be a Display Item on invoices.
  - **If invoices are separated by PO, "the purchase order information will appear at the top of
    each invoice page"; if grouped, it appears above each group.**
  - A "PO Warning" counter flags a PO whose billing reaches its warning value.
  - Confidence: H.
- **Stripe** [S95]:
  - Custom fields are "up to four key-value pairs that display in the invoice header", and
    "Purchase Order (PO) numbers" are listed as a common use.
  - Custom fields set on the customer carry over to that customer's draft invoices. They can be
    edited while the invoice is a draft and are locked once it is finalized.
  - Invoice rendering templates can also hold custom fields [S96].
  - Confidence: H.

### 3.2 Refusing to invoice without a required PO

- **Bullhorn One:** the "PO Required" flag exists on Invoice Terms [S20]. The page does not say
  what the system does when the PO is missing (block, hold or warn) [UNVERIFIED].
- **Bullhorn One Customer Required Fields:** "Required on Timesheet: Selected: There must be a
  Customer Required Field value selected on a Timesheet" [S27]. This blocks the timesheet, not
  the invoice. Confidence: H.
- **Bullhorn One** gives a related hold pattern: "Default Invoicing Hold" on Invoice Terms marks
  new charges "On Hold" so they are not invoiced [S38]. Confidence: H.
- **Bullhorn One:** "Without a Billing Profile, billable charges cannot be invoiced" [S36]. This
  is a documented hard block on a missing billing setup. Confidence: H.
- **Coupa:** "For invoice lines where the PO Number is specified, you must also provide PO Line
  Number or Supplier Part Number" [S82]. Confidence: H.
- **TempWorks:** an expired PO cannot be picked for new orders [S48]. Confidence: H.
- **Shiftbook fit:** this belongs among SPEC §11's blocking checks. Example: "PO required for this
  client and missing, expired, or over budget". The products split as follows:
  - Bullhorn, Avionté and TempWorks document *warnings* (warning date, warning amount, PO Warning).
  - Only Customer Required Fields and the missing Billing Profile are *hard blocks*.
  - Whether a missing PO blocks the invoice or only warns is an owner decision (open question 4).

---

## 4. Invoice CSV exports and VMS invoice uploads

### 4.1 How VMSs handle supplier invoices (context)

- **SAP Fieldglass** [S72]:
  - Buyers set "Auto Invoicing On", in which case approved time sheets generate invoices
    automatically and the supplier does nothing.
  - With "Auto Invoicing Off", the supplier creates invoices from approved sheets using the
    Invoice Generator: pick a schedule, then workers, then lines, then enter an "Invoice Code".
  - With auto invoicing on, there is "a unique invoice … for each individual time sheet". Buyers
    may consolidate either way.
  - Statuses: Approval Paused, Approved, Pending Consolidation, Consolidated, Draft, Paid, Payment
    Pending, Pending Approval, Rejected.
  - The invoice page has a **Related** tab listing related documents (job posting, work order,
    invoice).
  - Confidence: H.
- **Beeline Professional** [S75][S76][S78][S79]:
  - Administrators build **invoice blueprints**. Each blueprint sets the schedule, suppliers,
    data types and fields, with batches covering all suppliers or a custom filter by supplier,
    company, organization or location.
  - Approved timesheets and expenses become **preliminary** invoices, then **final** invoices.
  - With "Allow suppliers to submit invoices", a supplier can "upload an externally created
    invoice, add the corresponding External Invoice ID to a system-generated invoice batch file,
    and submit it".
  - Supplier invoice statuses: DRAFT, QUEUED, PENDING, APPROVED, REJECTED, FAILED.
  - Confidence: H.
- **Beeline Enterprise, VNDLY (Workday), Magnit:** no public supplier invoicing docs found
  [UNVERIFIED].

### 4.2 SAP Fieldglass: "Time Sheet Invoice Upload" (supplier-side; full column list public) [S65][S71]

**What it is.** Creates invoices for **approved** time sheets. It is available to Supplier and MSP
Partner company types, in the API-V1.0 and API-A-V1.0 versions, as CSV.
- Prerequisites: "Integration – Time Sheet Invoice Upload" and "MSP suppliers can create invoices"
  must be on, and the time sheets must **not** have the Auto Invoice flag. Confidence: H.

**File layout** (general connector rules) [S71]:
- Header lines: one Name/Value pair per line. SAP writes this as "Name = Value"; the delimiter in
  the actual CSV is [UNVERIFIED].
- **one blank line**;
- the column header row;
- the data rows.
- The delimiter defaults to a comma; "&", ";" and "|" can be enabled. Several values in one field
  are separated by "~".
- Optional header items can be left out entirely. A detail column with no values anywhere in the
  file can be left out. Detail columns must stay in the download order, with custom fields at
  the end.
- Confidence: H.

**Header components:**

| Component | Required? | Values |
|---|---|---|
| Type | Yes | `Time Sheet Invoice Upload` |
| Transaction | No | True: the whole upload fails if any record errors. False: only the bad records fail |
| Approval Required? | No | True/False |
| Send Notifications? | No | True/False |
| Number Format | No | e.g. "#,##9.99" (quotes required) |
| Language | No | e.g. English (United States) |
| Skip Reverse Time Sheet | No | True/False: whether reversed time sheets are invoiced along with revised ones |
| Comments | No | free text; quote it if it contains commas |

**Detail columns (exact headers):**

| Field Header Name | Type | Len | Required | Rule (abridged from SAP) |
|---|---|---|---|---|
| `Invoice Code` | Text | 100 | Yes | The supplier's own invoice code. "Pre-existing invoice codes cannot be used to create new invoices." Fieldglass then assigns its own invoice ID |
| `TIMESHEET ID` | Text | 16 | Yes | A valid Fieldglass time sheet ID (e.g. `XXXXTS00000001`), in **approved** status and not future-dated |
| `ORIGINAL TIMESHEET ID` | Text | 16 | No | The original sheet, when invoicing a revised one |
| `Job Seeker ID` | Text | 16 | Yes | Required for contingent workers (e.g. `XXXXJS00000001`) |
| `Paid Amount` | Decimal | | Yes | "Amount paid on the invoice to be created" |
| `Total Billing Amount` | Decimal | | Yes | The total of the invoice, "inclusive of the Time Sheet Billable Amount and associated Adjustments" |
| `Remit to Address Code` | Text | 100 | Conditional | Can come from the work order if blank and configured to |
| `[c] Invoice Custom Field 1` | depends | | depends | Invoice custom fields, one column each, named with a `[c]` prefix |
| `[rvc] Custom Field 1` | depends | | depends | Custom-field value for the reversed invoice, when revising |
| `[a] Invoice Adjustment 1` | Decimal | | No | Adjustments set up by the buyer, e.g. `[a] State Tax 1` |

Invented example file (fake IDs; layout per [S71], values per [S65]):
```
Type,Time Sheet Invoice Upload
Transaction,True
Number Format,"#,##9.99"

Invoice Code,TIMESHEET ID,Job Seeker ID,Paid Amount,Total Billing Amount
SB-DEMO-0001,XXXXTS00000001,XXXXJS00000001,0.00,1234.56
```
The header-line syntax above is [UNVERIFIED]; SAP shows it only as "Name = Value". The amounts
are invented.

**Related Fieldglass connectors (exact column lists available)** [S66][S67][S68][S69][S70]:
- **Consolidated Invoice Upload**: for Buyers and MSPs, not suppliers. Header: Type
  `Upload Consolidated Invoice`, Transaction, **Submit** (must be True), Language, Approval
  Required, Send Notification?, **Currency** (required; one currency per upload), Comments.
  Columns: `Consolidated Invoice Code` (100, required), `Business Unit Code` (200, required),
  `Invoice ID` (16, required; the invoice must be in Pending Consolidation), `Invoice Code`
  (optional).
- **Invoice Supplier Download**: what a supplier receives, useful for reconciliation. Columns:
  - Company and invoice IDs: Company Code, Company Name, Consolidated Invoice ID, SAP Fieldglass
    Invoice ID, Underlying Invoice Id, Supplier Invoice Code, Invoice Type, Invoice Line Item,
    Invoice Submit Date;
  - site and order: Site Code, Remit To Address Code, PO Number;
  - totals: Gross Invoice Amount, Net Invoice Amount, Invoice Adjustment Amount, Currency;
  - worker: Worker First Name, Worker Last Name, Person ID, Job Seeker ID, Worker ID, Week Ending
    Date;
  - cost assignment: Business Unit Code and Name, Cost Center Code and Name, Task Code and Name,
    General Ledger Account Code;
  - line values: Amount, Hours, Rate, Rate Code, Unit of Measure;
  - additional-currency and expense-adjustment columns;
  - `[c]{module}_{custom_field}`, VMS Tax, Contract ID, External Contract ID.
- **Time Sheet Credit Debit Memo Upload**: for Buyer, Supplier and MSP. Columns:
  - `Worker ID Or Work Order ID Or Job Seeker ID Or Buyer Ref`, Last_Name, First_Name, Date,
    Week_Start_Date;
  - Cost_Center_Code and Name, Task_Code and Name, Rate_Category_Code and Name, UOM;
  - `Sun_Hrs` … `Sat_Hrs`, Apply Adjustments, `[c]` and `[a]` columns.
  - It uploads hour adjustments, which fits Shiftbook's correction runs.
- **Email Invoice PDF Upload**: Buyer only. Sends invoice PDFs to the buyer, supplier and MSP by
  Invoice ID.
- **SOW Draft Invoice Upload**: Supplier, for statement-of-work time sheets. Columns:
  `Invoice Code`, `Document ID`.
- Confidence: H for all.

### 4.3 Beeline Professional invoice file fields [S77][S78][S80]

- **The blueprint's "Data Files" step**: "Select and organize the data fields … rename and
  rearrange", with separate **Finance View** and **Supplier View** transaction files. "Use the
  same fields as finance view" is checked by default. Step 6 is a **Preview**. This is a
  documented pattern for a "mapping profile" editor. Confidence: H.
- **Default fields** in the data dictionary:
  - invoice and billing period: Invoice Date, Billing Period End Date, Consolidated Invoice ID,
    Invoice Type (PRELIMINARY or FINAL), Invoice Line Item ID, Financial Record Type;
  - parties and terms: Supplier Name, Payment Terms;
  - worker and engagement: Worker Name, Engagement ID, Engagement Job Profile, Hiring Manager Name;
  - client: Cost Center Name and Code, Company Code and Name;
  - time: Timesheet ID, Weekending Date, Spend Date, Time Code Name, Hours, Allocation Rate, Rate
    Frequency, Timesheet Status;
  - expense and milestone: expense and milestone fields;
  - approval: Approval Date, Approving Manager;
  - money: Currency, Unit, Unit of Measure, Adjustment, Adjustment Type, Gross Amount, Total Fees,
    Total Taxes, Client Amount, Supplier Amount.
- **Optional fields** include PO Number, Worker ID, Approval Time, Time In, Time Out, Supplier
  Invoice ID and Rate Code.
- Confidence: H.
- **Rounding** [S80]: "each line item is rounded individually first, then the rounded values are
  summed". Money is rounded half-up to 2 decimals. This matches SPEC §5 ("round once, at line
  level"). Confidence: H.

### 4.4 Coupa invoice CSV (flat-file loader) [S82][S83]

- **How suppliers use it** [S83]:
  - "Your Coupa customer will provide you with the file template."
  - Columns marked * are required.
  - The supplier logs into the customer's SFTP and drops the file in `Incoming/Invoices`.
  - It is picked up within about 5 minutes; the supplier gets an email only on failure.
- **Attachments** [S82]: zip the CSV (at the top level) with its attachments; each ZIP must be
  under 8 MB. The CSV refers to an attachment as `file://<name>`. Several invoices go in one file.
- **Unique key:** Invoice Number plus Supplier Name or Supplier Number.
- **Header columns** (selected): `Invoice Number*` (string 40), Supplier Name, Supplier Number,
  Status, `Invoice Date*`, Submit For Approval?, Handling Amount, Misc Amount, Shipping Amount,
  `Line Level Taxation*`, Tax Amount, Tax Rate, Tax Code, Supplier Note, Payment Terms, Requester
  Email, `Chart of Accounts*`, Currency, Contract Number, Image Scan Filename, Image Scan URL, Ship
  To fields, among about 80 more (many for tax compliance outside the US).
- **Line columns** (selected): Invoice Line, `Invoice Number*`, Supplier Name, Supplier Number,
  Line Number, Description, Supplier Part Number, `Price*`, Quantity, Line Tax fields,
  `Unit of Measure*`, **PO Number**, **PO Line Number**, Account Name, Account Code, Billing Notes,
  Account Segment 1–20.
- **PO rule:** a line with a PO Number must also have a PO Line Number or Supplier Part Number.
- Confidence: H. This is Coupa's core loader. The column set a given customer actually uses comes
  from their template.

### 4.5 SAP Business Network (Ariba) CSV invoice [S85][S86][S87]

- The customer's CSV template sits under Settings → Customer Relationships → (customer) → **CSV
  INVOICE FIELDS** and the CSV Invoice Template. "This template is customized for each buying
  organization; do not attempt to use one among different customers."
- Upload: Documents → Create CSV Invoice → choose customer → Import CSV Invoice.
- Rules:
  - "do not modify the first three lines";
  - do not use Excel (it drops leading zeros);
  - re-uploads are rejected as duplicates;
  - **at most 2,999 lines per file and 1 MB**.
- The buyer must have its Customer Success Partner build the template [S86].
- No standard public field list exists. Confidence: H.

### 4.6 Generic invoice CSV and export references

- **Stripe** [S90]: "export all of your invoices or a subset of them as a CSV file by clicking
  Export on the Invoices page". Shiftbook's `docs/patterns/exports.md` already copies Stripe's
  export dialog (columns: all or a custom set). Confidence: H.
- **Bullhorn Back Office** [S12][S11]: select invoices on Receivables → Actions / # Selected →
  Export to CSV, Excel or PDF. Selecting several invoices and using "Save" downloads **one PDF
  with multiple pages**. Confidence: H.
- **Bullhorn One "Invoice Export" report** [S29]. Its columns are a good header-level invoice CSV:
  - identity and dates: Invoice, Candidate, Placement, Customer, Earn Code/Account, Invoice Date,
    Due Date, Period End Date, Batch ID, Line Number, Customer ID, Payment Terms;
  - billing contact and address: Billing Contact, Primary Email, Direct Phone, Bill to Attention,
    Billing Address 1 and 2, City, State, Country, Zip;
  - amounts: Credit of Invoice, Invoice subtotal, Total amount;
  - customer address fields, Billing Profile, Invoice Date Last Modified.
  - Confidence: H.
- **QuickBooks Online invoice import** [S108]:
  - "Each line item needs its own invoice number, customer, invoice date, due date, item amount,
    and item tax code" (the page I read is the non-US version, which mentions VAT);
  - up to 100 invoices and 1,000 rows per file;
  - no negative lines (no discounts or credit notes).
  - Confidence: M, because the US article variant was read only through search excerpts.

### 4.7 Which VMS or procurement formats are publicly documented with columns?

| Format | Supplier can upload? | Public column list? | Conf. |
|---|---|---|---|
| SAP Fieldglass Time Sheet Invoice Upload | Yes (Supplier/MSP) | **Yes, exact** [S65] | H |
| SAP Fieldglass Consolidated Invoice Upload | No (Buyer/MSP) | Yes [S66] | H |
| SAP Fieldglass Invoice Supplier Download | n/a (download) | Yes [S67] | H |
| Beeline Professional invoice files | Upload of an external invoice against a batch | Field dictionary yes [S77]; the upload file format is not documented [UNVERIFIED] | H/M |
| Beeline Enterprise / VNDLY / Magnit | Unknown | No public docs found | [UNVERIFIED] |
| Coupa invoice loader (SFTP CSV) | Yes, with the customer's template and SFTP account | **Yes** [S82] | H |
| SAP Ariba CSV invoice | Yes | No: specific to each buyer [S85] | H |

---

## 5. Screen patterns (structure only)

### 5.1 Invoices list

**Primary: Stripe Dashboard → Invoices** [S90][S91][S92][S94][S101]
1. A page action, "Create Invoice", which opens the invoice editor. Exiting saves a draft [S92].
   Confidence: H.
2. **Filters**: "filter your invoices by using the tabs or chips" [S90]. Confidence: H. The tab
   names are [UNVERIFIED]. Statuses are Draft, Open, Paid, Void and Uncollectible [S91].
3. **Status badge on each row.** An open invoice may show "Past due" or "Retrying", with a hover
   tooltip; a pending payment shows "Pending" in the list but "Open" on the detail page [S90][S91].
   Confidence: H.
4. **Edit columns** and **Export** (CSV) [S90]. Confidence: H. The default columns, possibly
   amount, status, number, customer, due date and created, are [UNVERIFIED].
5. **Row overflow (⋯)**: Download PDF (the invoice, or the receipt if paid), Duplicate invoice,
   Delete draft, view customer details, Edit invoice [S90][S92][S93]. Confidence: H.
6. Clicking a row opens the detail page; an editable draft opens the edit form instead [S90].
   Confidence: H.
7. **Keyboard:** "press the question mark key (?) for a list of available keyboard shortcuts"
   [S101]. Confidence: H.

**Staffing additions** (Bullhorn) [S9][S10][S11][S12][S32][S33]:
- Checkbox selection with an **"Actions / # Selected"** menu offering Finalize, Mark as Ready (up
  to 500), Save (several invoices download as one PDF), Export CSV, Excel or PDF, Timesheet Status
  and Un-Process.
- The **Timesheet Status** pop-up lists Employee, Placement title and Status, "useful for
  determining who is holding up an invoice".
- Bullhorn Back Office statuses: In-Progress (Not Ready), In-Progress (Partial Ready), In Progress
  (Ready), Approved, Approved (Empty), Error Processing, Export Queued, Export Processing,
  Processed.
- Confidence: H.

### 5.2 Invoice detail page

**Primary: Stripe "Invoice details"** [S90][S93][S94][S98]
1. **Header**: status badge (Open, Paid and so on) and actions that depend on status. Documented
   actions:
   - **Edit invoice**, which opens the editor on a *new draft*; "Update invoice" finalizes it and
     voids the old one;
   - **Send invoice**, which shows a preview of the hosted page first;
   - **Charge customer**;
   - **More actions / ⋯**: **Issue a credit note**, **Change invoice status** (Paid, Void or
   Uncollectible), Duplicate;
   - **Invoice PDF** download, and **Send receipt** once paid.
   - Confidence: H for the actions; the layout is [UNVERIFIED].
2. **"Enabled payment methods"** section with an edit icon [S93]. Shiftbook would drop this,
   since payments are out of scope. Confidence: H.
3. **"History" section** showing old and new invoices, with an **embedded timeline of
   revisions**. A voided-by-revision invoice links to its successor [S93]. Confidence: H.
4. **Credit notes**: a reason, then line credit by quantity or amount, or a custom line; they
   reduce the amount due without voiding the invoice [S94]. Confidence: H.
5. Email logs from the last 60 days are on the customer page [S98]. Confidence: H.

**Staffing additions:**
- **Bullhorn One invoice record** [S30][S31][S32][S33][S34]:
  - a **Details** tab containing the **Line Items** section, where each line has "Edit Line
    Description" (Description and Comment);
  - an **Edit** tab, where only non-financial fields can be edited after finalization ("the
    Invoice is automatically regenerated and must be resent manually");
  - a **Finalize** button top right (cannot be undone);
  - an **Actions** menu with Mark as Ready, Credit, Credit & Reinstate and Email Invoice PDF;
  - a folder icon that opens the PDF;
  - credit invoices "Link to the Original Invoice Statement", with Invoice Type "Credit -
    Write-Off" or "Credit - Reinstated".
  - Confidence: H.
- **TempWorks** [S45][S49]:
  - **"Preview Invoice w/ Timecards"** in the staging register;
  - after posting, **Extend Invoice Details → Transaction** shows the linked images and **→
    Merged invoices** shows any merge.
  - Confidence: H.
- **SAP Fieldglass** [S72]: a **Related** tab listing the related documents, and a link to the
  time sheet that generated the invoice. Confidence: H.
- **QuickBooks Online** [S105]:
  - an attachments area on the invoice ("Add attachment"), with accepted types PDF, JPEG, PNG,
    DOC, XLSX, CSV, TIFF, GIF and XML;
  - statements cannot carry PDF attachments;
  - an "Attach to email" checkbox sends the attachment with the invoice email. That checkbox is
    documented only in community answers (L).
  - Confidence: H, except the checkbox.

### 5.3 Client billing profile and settings

**Primary (layout): Stripe customer detail page** [S98][S95][S96][S100][S99]
- **Left pane, "Details" section → Edit** opens the **"Update customer"** dialog. Its **"Billing
  information"** section has the "Same as account email" checkbox, the To emails, and **"Add more
  recipients" → "Emails to CC"**. Confidence: H.
- **Invoice settings that apply per customer:**
  - invoice prefix (1–12 uppercase letters or digits, unique) and next sequence [S95];
  - preferred language [S100];
  - custom fields such as PO, which carry over to drafts [S95];
  - invoice template ("In a customer's invoice settings, to apply to all future invoices
    associated with that customer") [S96];
  - tax IDs and tax-exempt status [S100].
  - Confidence: H.
- **Precedence**, highest first [S96]:
  1. invoice;
  2. template on the invoice;
  3. template on the customer;
  4. customer invoice settings;
  5. account invoice settings.
  - Confidence: H.

**Staffing content model: Bullhorn One** [S22][S20][S28]
- **Billing Profile**, which can be one of several per client:
  - Effective Date, Title, Status, Billing Specialist;
  - Bill-To Client, **Invoice Terms**, Location, Billing Contact, Bill-To Attention;
  - **Delivery Method**: Print, Do Not Print, Email (with an email template and at least one
    contact) or **Consolidated Email**.
- **Invoice Terms:**
  - Invoice Term Template, **Effective Date**, Title, Description, Status, Currency;
  - Billing Cycle, Default Invoicing Hold, Payment Terms (Due Upon Receipt or Net n), Discount
    and Surcharge Rate;
  - **File Types for Invoicing**, Approval Required, **PO Required**, Invoice Only Approved
    Timecards;
  - GL account mapping;
  - **Invoice Statement Template**, Remit Instructions, Auto Set Invoice Date;
  - **Split By, Group By, Summarize By**.
- Versioning: "best practice is to create a new version instead of editing … often referred to as
  using effective dating" [S28].
- Confidence: H.

**Other references:**
- **TempWorks Beyond Billing Setup cards** [S47]: Actions (bill this department separately or
  roll up to the parent), Invoicing (Style with preview, Invoice Method, Email Template), Invoice
  Recipients, Billing Schedule, Separate Invoices, Invoice Line Items. Each card is edited with a
  pencil icon. Confidence: H.
- **Avionté BOLD "Billing Preferences"** [S53]:
  - Sections:
    - **Invoice Settings**: Invoice to Department (required), Invoice Style (required; on change
      it asks whether to apply the style to existing invoices), Separate, Group and Sort By,
      Display Items, Show Daily Hours, Show Time Card, Show Web Time Card, Show Past Invoice;
    - **Delivery & Distribution**: Email Invoices To, Print Invoice;
    - **Statement Letter Settings**;
    - **Billing & Scheduling**: Billing Period, Billing Cycle (with a help icon showing the
      current cycle), Payment Terms, Max Invoice Amount.
  - A **company audit trail** records user, date and time, and what changed.
  - The **invoice audit** shows style, finance-charge and balance changes caused by edits to the
    billing preferences.
  - Separate permissions for viewing and editing.
  - Confidence: H.
- **Bullhorn Back Office** contact sections [S15]: Timesheets, Address (Attention), Invoice
  Information, Invoice Lines, Taxes, Discounts/Surcharges, Emailing. The bottom-of-invoice "Client
  Message" falls back to a firm default [S16]. Confidence: H.
- **QuickBooks Online** customer "Payment and billing" tab: preferred payment method, preferred
  delivery method and terms. These come from community answers only (L).

---

## 6. How a backup bundle is delivered

| Question | What the references do | Conf. |
|---|---|---|
| One combined PDF or ZIP? | **Combined PDF**: Avionté merges the invoice and time cards into one PDF when MergeInvoice&AttachmentPDF is on [S51]. TempWorks attaches linked images to the invoice during the run [S45]. Bullhorn Back Office sends "PDFs as long as all attachments … are uploaded as PDFs" [S4]. **ZIP**: Bullhorn Back Office when any attachment is not a PDF [S4]; Bullhorn One Consolidated Email, a ZIP of invoice PDFs with a 10 MB limit set by the mail server [S23]; Coupa uploads (CSV plus attachments in a ZIP under 8 MB) [S82] | H |
| Page order | Avionté: invoice page(s), then "each time card image attached … on its own individual page". The multi-page folder option keeps page order [S50]. Bullhorn One: attachments follow invoice line ID, then transaction date, then file type [S24]; with summarize by candidate, both lines and attachments are alphabetical by last name [S21] | H |
| How images are labelled | No reference documents a caption or stamp on backup pages [UNVERIFIED]. TempWorks links each image page to its time-entry lines and shows "Linked Timecard Status" [S45]. Bullhorn Time & Expense's client-attach review shows the image beside the assignment information, including the week-ending date [S41] | M |
| Image limits and quality | Bullhorn Time & Expense: 4 MB per image, one image per type per assignment, combine pages [S40]. Bullhorn One compression: 300 DPI, 70% quality [S25]. Ariba CSV: 1 MB per file [S85] | H |
| Redaction of SSN and date of birth | No staffing vendor documents automatic redaction of timecard images in client backup [UNVERIFIED]. **Google Sensitive Data Protection** finds text in images by OCR and covers matches with "an opaque rectangle", black by default and colourable per type. It supports JPEG, BMP and PNG, not PDF. `US_SOCIAL_SECURITY_NUMBER` is a documented type; date of birth was not confirmed on that page [S110]. **NIST SP 800-122** lists "social security number, date and place of birth" as identifying PII [S111]. **Cal. Civ. Code §1798.85(a)(5)** bars printing an SSN "on any materials that are mailed to the individual" unless the law requires it; (a)(1)-(4) cover public display, cards and internet transmission [S112] | H for the sources; M for applying them to client backup |
| Redaction method | The Google pattern: render the page as an image, detect, then paint opaque boxes into the pixels so the output keeps no underlying text [S110]. The NSA's 2005 "Redacting with Confidence" warns that covering text with shapes is not redaction (press coverage only; the NSA PDF was not read) | M/L |

---

## 7. Recommended invoice templates and grouping options for Shiftbook

These recommendations follow CLAUDE.md: copy references, take no design decisions of our own, and
mark anything that needs an owner decision.

### 7.1 Templates (PDF), each with the reference it copies

| Shiftbook template | Copies | What it shows |
|---|---|---|
| **Standard** (the current one) | Page skeleton: **Stripe invoice PDF** (existing `docs/patterns/_documents/invoice.md`). Lines: **Bullhorn One "Summarize By: Placement > Candidate + Bill Transaction > Earn Code"** [S21] plus **TempWorks "Invoice T Type"**, with Regular, OT and DT on separate rows [S46]. Sort: worker last name (Avionté Sort by Employee [S52]; Bullhorn One [S21]) | One line per worker per earning type: hours (from integer minutes), bill rate, amount rounded once per line. Header and footer as today |
| **Per-worker detail** | Grouping: **Bullhorn One Group By Candidate** with a group subtotal [S21], plus **Stripe line-item group "summary item"** [S97]. Daily hours: **Avionté "Show Daily Hours"** [S52] and **TrackTik "Details per employee"** [S62]. Approval: **Bullhorn Back Office `[APPROVE_LOG]`**, "Approved by … on … at …" [S2], and **TempWorks "Invoice WebCenter - Approver"** [S46] | A block per worker: the days of the week with hours by earning type, a per-worker subtotal, and an approval line (approver identity plus date and time from the SPEC §10 audit event) |
| **PO header** | **Stripe custom fields**, a PO key-value in the header (up to 4 fields) [S95]. **Avionté** "if separated by PO, the purchase order information will appear at the top of each invoice page" [S54]. **TempWorks** Option 1 (separate invoice per PO) versus Option 2 (PO on each line) [S48] | PO number in the header on every page. One invoice per PO when the profile splits by PO, otherwise PO on each line (owner question 5) |
| **Consolidated statement** | The owner chooses one. **B: Avionté "Invoice Merge"** [S55] or **TempWorks "Merge Invoices"** [S49], a presentation document where payments stay on each weekly invoice (fits SPEC §14 aging per invoice). **C: QuickBooks "Open Item" or "Balance Forward"** statement [S106] or **Avionté AR Statement Letter** [S56]. **A: Bullhorn One "Monthly by Customer (Consolidated Invoice) and Grouped by Week End Date"** [S21] is a true single invoice | For B: a cover document listing each period's invoice (number, period, amount), followed by the lines grouped by invoice or week. AR is unchanged |
| **Backup bundle** | **Avionté merged PDF**: invoice pages, then one image per page [S50][S51]. Ordering: **Bullhorn One attachment priority** (line order, then date, then type) [S24]. Compression defaults: **Bullhorn One 300 DPI / 70%** [S25]. ZIP fallback: **Bullhorn Back Office** (non-PDF), **Bullhorn One Consolidated Email** | One PDF: invoice, then the line detail (the per-worker detail pages), then the approved timesheet images in invoice line order. Page labels: owner question 9 |

### 7.2 Grouping and settings on `ClientBillingProfile` (SPEC §4 fields in bold)

| Setting | Values | Copies |
|---|---|---|
| **invoice template** | Standard, Per-worker detail, PO header | Bullhorn One "Invoice Statement Template" on Invoice Terms [S20]; Stripe "template on customer" [S96] |
| Separate invoices by (split) | none (per client per period), **PO**, **Worksite**; several selections combine | TempWorks Beyond "Separate Invoices" checkboxes, combinations multiply [S47]; Avionté "Separate Invoice By" [S52] |
| Group lines by | up to 2 ordered keys: Worker, Week ending, PO, Worksite; never the split key | Bullhorn One "two group bys" and "not recommended to group by the same field" [S21]; Avionté ordered Group By [S52] |
| Sort | Worker last name | Avionté [S52]; Bullhorn One [S21] |
| **PO required** | yes/no; PO list with start and end dates, budget and warning levels | Bullhorn One Invoice Terms "PO Required" and PO records [S20][S27]; TempWorks warning amount 75% and warning date 10 days [S48] |
| **consolidate** | off or on (statement template, period such as monthly) | Avionté "Automatically Email Monthly Statements" and day of month [S52]; Bullhorn One billing cycle [S20] |
| Backup contents | Timesheet images: yes/no; line detail: yes/no | Bullhorn Back Office "Show Timesheets" [S1]; Bullhorn One "File Types for Invoicing" [S20]; Avionté "Show Time Card" [S52] |
| Delivery | one email per invoice, or one email with all of the period's invoices | TempWorks Beyond "One invoice per email" [S47]; Bullhorn One "Consolidated Email" [S22] |
| **VMS name** + mapping profile | none, SAP Fieldglass (Time Sheet Invoice Upload), Beeline, Coupa, Ariba or custom | §4 above; the editor copies the **Beeline blueprint "Data Files" step** (select, rename, reorder, preview) [S78] |
| Versions | effective-dated versions of the whole profile | **Bullhorn One Invoice Term Versions** [S28] (CLAUDE.md requires effective dates) |
| Change log | who changed what and when | **Avionté Billing Preferences audit trail** [S53]; SPEC §19 audit log |

When a change takes effect: Bullhorn Back Office applies setting changes to "In Progress" invoices
only, never to approved ones [S1]. That fits Shiftbook's approval snapshots (SPEC §11).

### 7.3 CSV outputs

1. **Invoice lines CSV**, one per invoice or one per run. Columns copy the **Beeline default
   invoice fields** [S77], restricted to what Shiftbook has:
   - invoice and period: invoice number, invoice date, period end;
   - worker and client: worker, worker ID, worksite, PO;
   - time: week ending, date, earning type, minutes shown as hours, approver, approval date and
     time;
   - money: bill rate and amount (in cents, shown as dollars).
   - The header-level columns follow **Bullhorn One Invoice Export** [S29].
2. **Invoices list export**: already covered by the Stripe export pattern in
   `docs/patterns/exports.md`.
3. **VMS invoice-upload CSV**, one per mapping profile:
   - Built-in profile 1: **SAP Fieldglass "Time Sheet Invoice Upload"**, with the exact headers in
     §4.2. It needs the VMS **Time Sheet ID** and **Job Seeker ID** stored for each worker and
     week; Bullhorn One stores a "VMS Timesheet ID" in a required field on each transaction [S37].
   - Built-in profile 2: **Coupa loader**, header and line columns (§4.4).
   - **Ariba**: a custom profile, because each buyer's template differs; keep the first three
     lines as given.
   - Ariba and Coupa limits feed into the pre-flight checks: 2,999 lines and 1 MB for Ariba,
     8 MB per ZIP for Coupa.

### 7.4 Screens: pattern files to write (paths per the CLAUDE.md mapping)

| Screen | Pattern file | Primary reference | Secondary |
|---|---|---|---|
| Invoices list | `docs/patterns/invoices.md` | Stripe Invoices page [S90] | Bullhorn "# Selected" bulk actions and Timesheet Status pop-up [S10][S11][S32][S33] |
| Invoice detail | `docs/patterns/invoices/[id].md` | Stripe Invoice details [S93][S94] | Bullhorn One Details tab, Actions, credit linking [S30][S31]; TempWorks "Preview with timecards" [S45]; Fieldglass "Related" tab [S72] |
| Client billing profile | `docs/patterns/clients/[id]/billing.md` (route to be decided) | Stripe customer "Details → Edit → Update customer" [S98] | Avionté Billing Preferences sections and audit [S53]; Bullhorn One Billing Profile and Invoice Terms [S22][S20] |
| PDF templates | `docs/patterns/_documents/<name>.md`, e.g. `invoice-detail`, `invoice-po`, `statement`, `backup` | per §7.1 | |

---

## 8. Open questions for the owner (one each, plain words)

1. Do any of your clients use a vendor-management system (for example SAP Fieldglass, Beeline,
   Coupa or Ariba)? If so, does that system make the invoice for you, or do you upload one?
2. When a client wants a "consolidated statement", do they mean one bill covering several weeks
   that is paid once? Or a cover sheet listing the separate weekly bills, each still paid on its
   own?
3. Should Shiftbook always black out Social Security numbers and dates of birth on the timesheet
   pictures you send to clients?
4. If a client requires a PO and none is on file (or it has expired or run out), should Shiftbook
   stop the invoice, or just warn you?
5. When one client has several POs in the same week, should each PO get its own invoice, or should
   one invoice show the PO on each line?
6. Should the timesheet pictures go inside the same PDF as the invoice, or in a second PDF sent
   alongside it?
7. Should the approver's name and approval time be printed on the invoice itself, or only on the
   backup pages?
8. How should each timesheet picture page be labelled? For example: worker name, week, and "page 2
   of 5". No reference product shows this, so we need your pick.
9. Do clients ever ask for one email with all of the week's invoices in it, rather than one email
   per invoice?

---

## 9. Source index

Retrieved 2026-10-16. "Read" means I fetched and read the full page; "snippet" means search-result
text only.

**Bullhorn Back Office** (all read)
- S1 https://kb.bullhorn.com/backoffice/Content/backoffice/Topics/addingRemovingTimesheetInvoices.htm
- S2 https://kb.bullhorn.com/backoffice/Content/backoffice/Topics/usingVariablesBillingContacts.htm
- S3 https://kb.bullhorn.com/backoffice/Content/backoffice/Topics/enablingDisablingExpenseDetailReport.htm
- S4 https://kb.bullhorn.com/backoffice/Content/backoffice/LP/bboReceivables.htm
- S5 https://kb.bullhorn.com/backoffice/Content/backoffice/Topics/usingInvoiceGroups.htm
- S6 https://kb.bullhorn.com/backoffice/Content/backoffice/Topics/settingUpBatchInvoiceCycle.htm
- S7 https://kb.bullhorn.com/backoffice/Content/backoffice/Topics/creatingBatchInvoice.htm
- S8 https://kb.bullhorn.com/backoffice/Content/backoffice/Topics/purchaseOrderNumbers.htm
- S9 https://kb.bullhorn.com/backoffice/Content/backoffice/Topics/invoiceStatuses.htm
- S10 https://kb.bullhorn.com/backoffice/Content/backoffice/Topics/viewingStatusTimesheetsInvoice.htm
- S11 https://kb.bullhorn.com/backoffice/Content/backoffice/Topics/savingInvoices.htm
- S12 https://kb.bullhorn.com/backoffice/Content/backoffice/Topics/exportingReceivablesData.htm
- S13 https://kb.bullhorn.com/backoffice/Content/backoffice/Topics/editingInvoice.htm
- S14 https://kb.bullhorn.com/backoffice/Content/backoffice/Topics/creatingManualInvoice.htm
- S15 https://kb.bullhorn.com/backoffice/Content/backoffice/Topics/creatingNewContact.htm
- S16 https://kb.bullhorn.com/backoffice/Content/backoffice/Topics/editingClientMessageInvoices.htm
- S17 https://kb.bullhorn.com/backoffice/Content/backoffice/Topics/adjustingInvoiceFrequency.htm
- S18 https://kb.bullhorn.com/backoffice/Content/backoffice/Topics/invoiceNumberingOptions.htm

**Bullhorn One** (all read)
- S20 https://kb.bullhorn.com/bhone/Content/BH1/Topics/AddInvoiceTerms.htm
- S21 https://kb.bullhorn.com/bhone/Content/BH1/Topics/invTermsSplitGroupSum.htm
- S22 https://kb.bullhorn.com/bhone/Content/BH1/Topics/CreateBillProfile.htm
- S23 https://kb.bullhorn.com/bhone/Content/BH1/Topics/invoiceConsolidation.htm
- S24 https://kb.bullhorn.com/bhone/Content/BH1/Topics/invoiceAttachmentPriorityOrder.htm
- S25 https://kb.bullhorn.com/bhone/Content/BH1/Topics/invoiceCompression.htm
- S26 https://kb.bullhorn.com/bhone/Content/BH1/Topics/bh1InvoiceTemplateOverview.htm. Default
  template call-outs: Logo, Agency Details, Bill To (from the Billing Profile), Invoice number,
  Invoice Date, Due Date (from Payment Terms), Remittance Instructions (from Invoice Terms),
  Group-by example, Summarize-by example, Earn Codes, Billable Transactions, Sales Tax.
- S27 https://kb.bullhorn.com/bhone/Content/BH1/Topics/managingPurchaseOrders.htm
- S28 https://kb.bullhorn.com/bhone/Content/BH1/Topics/understandingInvoiceTerms.htm
- S29 https://kb.bullhorn.com/bhone/Content/BH1/Topics/bh1CanvasInvoiceExport.htm
- S30 https://kb.bullhorn.com/bhone/Content/BH1/Topics/editInvoice.htm
- S31 https://kb.bullhorn.com/bhone/Content/BH1/Topics/creditVSCreditReinstate.htm
- S32 https://kb.bullhorn.com/bhone/Content/BH1/Topics/FinalInv.htm
- S33 https://kb.bullhorn.com/bhone/Content/BH1/Topics/MarkInvReady.htm
- S34 https://kb.bullhorn.com/bhone/Content/BH1/Topics/ViewInvStatePDF.htm
- S35 https://kb.bullhorn.com/bhone/Content/BH1/Topics/BillChargeWrkflw.htm (also read:
  BillCycleInvoiceEligibility.htm)
- S38 https://kb.bullhorn.com/bhone/Content/BH1/Topics/defaultInvoicingHoldStatus.htm
- S36 https://kb.bullhorn.com/bhone/Content/BH1/Topics/criticalPayBillDataPlacementRecord.htm
- S37 https://kb.bullhorn.com/bhone/Content/BH1/Topics/timesheetBillableChargesCustomerRequiredFields.htm

**Bullhorn Time & Expense** (all read)
- S40 https://kb.bullhorn.com/bte/Content/BHTE/Topics/approvalAttachment.htm
- S41 https://kb.bullhorn.com/bte/Content/BHTE/Topics/clientAttachmentApprovalProcess.htm
- S42 https://kb.bullhorn.com/bte/Content/BHTE/Topics/printSignatureReport.htm

**TempWorks** (all read)
- S45 https://kb.tempworks.com/help/timecard-linker
- S46 https://kb.tempworks.com/help/how-to-manage-billing-setup-on-a-customer
- S47 https://kb.tempworks.com/help/beyond--how-to-manage-billing-setup
- S48 https://kb.tempworks.com/help/beyond-how-to-create-purchase-orders
- S49 https://kb.tempworks.com/help/bo---how-to-merge-invoices

**Avionté** (all read through the Zendesk JSON API, /api/v2/help_center/en-us/articles/<id>.json)
- S50 https://support.avionte.com/hc/en-us/articles/55996103929747-Attach-Timecards-to-Invoices
- S51 https://support.avionte.com/hc/en-us/articles/56030458831123-Config-Option-MergeInvoice-AttachmentPDF
- S52 https://support.avionte.com/hc/en-us/articles/55996167663251-Customer-Back-Office-Setup-Billing-Setup
  (also 55997977094163 Invoice - Back Office Setup)
- S53 https://support.avionte.com/hc/en-us/articles/56451748020243-BOLD-Front-Office-Billing-Preferences
- S54 https://support.avionte.com/hc/en-us/articles/56030564966675--PO-Number-and-PO-Usage
- S55 https://support.avionte.com/hc/en-us/articles/55996101711379-Invoice-Merge
- S56 https://support.avionte.com/hc/en-us/articles/55996108236819-AR-Statement-Letter
- S57 https://support.avionte.com/hc/en-us/articles/56451763127571-Consolidating-Invoices
- S58 https://support.avionte.com/hc/en-us/articles/55996133983251-Invoice-Summary
- S59 https://support.avionte.com/hc/en-us/articles/55996109016211-Print-Invoices
- S60 https://support.avionte.com/hc/en-us/articles/56030802283283-Standard-AQ-VMS-Billing-Report

**TrackTik** (read through the Zendesk JSON API)
- S62 https://support.tracktik.com/hc/en-us/articles/25489523531671-Add-detailed-employee-timesheets-to-invoices
- S63 https://support.tracktik.com/hc/en-us/articles/1500001467341-Billing-Invoice-Settings
  (invoice classes: Legacy Mode, Standard, Custom, Custom Bilingual)

**SAP Fieldglass** (read through the SAP Help Portal page-content API)
- S65 https://help.sap.com/docs/SAP_FIELDGLASS_INTEGRATION/9cfd5c12ee3046d59453e73974f9c4b7/3800ae14e91144598852e3fe1ea25535.html
  (Time Sheet Invoice Upload)
- S66 https://help.sap.com/docs/SAP_FIELDGLASS_INTEGRATION/9cfd5c12ee3046d59453e73974f9c4b7/99e394589e05448099f767fc10b5e436.html
  (Consolidated Invoice Upload)
- S67 https://help.sap.com/docs/SAP_FIELDGLASS_INTEGRATION/9cfd5c12ee3046d59453e73974f9c4b7/8e463c499c7d4cb8a37bfb3272a311f8.html
  (Invoice Supplier Download)
- S68 https://help.sap.com/docs/SAP_FIELDGLASS_INTEGRATION/9cfd5c12ee3046d59453e73974f9c4b7/2547d64f3d79488bb7bff70ebed50a5c.html
  (Time Sheet Credit Debit Memo Upload)
- S69 https://help.sap.com/docs/SAP_FIELDGLASS_INTEGRATION/9cfd5c12ee3046d59453e73974f9c4b7/4647d77657ba41dc808029f79efccd9b.html
  (Email Invoice PDF Upload)
- S70 https://help.sap.com/docs/SAP_FIELDGLASS_INTEGRATION/9cfd5c12ee3046d59453e73974f9c4b7/d88764bc0f6048b790c56e7d2f70e5b4.html
  (SOW Draft Invoice Upload)
- S71 https://help.sap.com/docs/SAP_FIELDGLASS_INTEGRATION/9cfd5c12ee3046d59453e73974f9c4b7/c5bfbab0da494df1bc7536a3b09bb854.html
  (Connector Documents - General Information: CSV header, blank line, detail)
- S72 https://assets.cdn.sap.com/agreements/supplier-portal/fieldglass-supplier-enablement/supplier-quick-reference-guide-invoices-and-reporting-english-global.pdf
  (Supplier Quick Reference Guide: Invoices and Reporting)

**Beeline Professional** (all read)
- S75 https://docs.bpe.beeline.com/beeline-professional/financials/about-consolidated-invoicing.html
- S76 https://docs.bpe.beeline.com/beeline-professional/financials/allowing-suppliers-submit-invoices.html
- S77 https://docs.bpe.beeline.com/beeline-professional/financials/invoice-fields-data-dictionary.html
- S78 https://docs.bpe.beeline.com/beeline-professional/financials/creating-invoice-blueprints.html
- S79 https://docs.bpe.beeline.com/beeline-professional/financials/invoice-statuses.html
- S80 https://docs.bpe.beeline.com/beeline-professional/financials/about-rounding.html

**Coupa** (read)
- S82 https://docs.coupa.com/en/developer-documentation/coupa-core-flat-files-csv/flat-file-csv-import/invoices-import
- S83 https://docs.coupa.com/en/supplier-documentation/coupa-for-suppliers/supplier-integration-resources/integration-contacts

**SAP Ariba / SAP Business Network** (read)
- S85 https://support.ariba.com/item/view/157592
- S86 https://support.ariba.com/item/view/127026
- S87 https://support.ariba.com/item/view/183965 (an example of a buyer-specific CSV guide; PDF not
  opened)

**Stripe** (all read as the docs' .md variants)
- S90 https://docs.stripe.com/invoicing/dashboard/manage-invoices
- S91 https://docs.stripe.com/invoicing/overview
- S92 https://docs.stripe.com/invoicing/dashboard
- S93 https://docs.stripe.com/invoicing/invoice-edits?testing-method=without-code
- S94 https://docs.stripe.com/invoicing/dashboard/credit-notes
- S95 https://docs.stripe.com/invoicing/customize
- S96 https://docs.stripe.com/invoicing/invoice-rendering-template
- S97 https://docs.stripe.com/invoicing/group-line-items
- S98 https://docs.stripe.com/invoicing/send-email
- S99 https://docs.stripe.com/billing/customer
- S100 https://docs.stripe.com/invoicing/customer
- S101 https://docs.stripe.com/dashboard/basics

**QuickBooks Online**
- S105 https://quickbooks.intuit.com/learn-support/en-ca/help-article/invoicing/attachments-quickbooks-online/L8XvMBCgd_CA_en_CA
  (read)
- S106 https://quickbooks.intuit.com/learn-support/en-us/accounts-receivable/create-customer-statements/00/186219
  (statement types; search excerpts only, M)
- S107 https://quickbooks.intuit.com/learn-support/en-au/manage-customers-and-income/re-is-it-possible-to-set-a-preferred-delivery-method-for-all/01/971257/highlight/true
  (community post; Payment and billing tab; L)
- S108 https://quickbooks.intuit.com/learn-support/en-us/help-articles/import-invoices-in-batches/00/338726
  (read; the page served the non-US VAT variant)

**Redaction and PII**
- S110 https://docs.cloud.google.com/sensitive-data-protection/docs/redacting-sensitive-data-images
  (read, first 100k characters)
- S111 https://nvlpubs.nist.gov/nistpubs/Legacy/SP/nistspecialpublication800-122.pdf (read, §2.1)
- S112 https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=CIV&sectionNum=1798.85
  (statute text via a government-index excerpt; direct fetch 403)
- The NSA's "Redacting with Confidence" (2005) is known only from press coverage, e.g.
  https://fas.org/blogs/secrecy/2006/01/nsa_redacting_with_confidence (snippet, L).
