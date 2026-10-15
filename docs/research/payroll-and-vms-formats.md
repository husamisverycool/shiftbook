# Research notes: payroll and VMS file formats

Collected by research subagents on 2026-10-15. These notes are inputs to exports (SPEC §13) and
intake mapping profiles (SPEC §6). Confidence levels are the researchers'.

## Gusto — hours import ("Smart Import")

- Path in Gusto: Pay → Run payroll → choose payroll → **Import payroll data** → download template →
  upload → review column matching → review row matching → import. Re-importing replaces existing
  entries for that payroll. Source: https://support.gusto.com/article/999914471000000/Run-payroll-with-Smart-Import
  (read through a text proxy; direct fetch returns 403).
- Gusto publishes **no fixed column list**: each company downloads a template pre-filled with its
  employees; columns vary with company settings.
- Core header shared by every recent real template (high confidence; seen in several public repos
  that copied downloaded templates):
  `last_name,first_name,title,gusto_employee_id,regular_hours,overtime_hours,double_overtime_hours`
- Common extra columns (company-specific): `missed_break_hours`, `bonus`, `commission`,
  `paycheck_tips`, `cash_tips`, `correction_payment`, `reimbursement`, `personal_note`,
  `holiday_hours` (one source), `owners_draw` (one source), `custom_earning_<name>`.
- One row per employee per job; the primary job's title ends in " (Primary)".
- `gusto_employee_id` is a short hex id Gusto pre-fills (e.g. `b4c2b5`).
- Hours are decimals (template pre-fills `0.0`). Blank leaves a value unchanged; `0` overwrites
  (older article, to verify).
- Gusto's official CLI (`Gusto/gusto-cli`) uses `regular_hours`, `overtime_hours`,
  `double_overtime_hours`, confirming the internal names.
- **Implication:** the export writes the core columns in that order, hours with two decimals; an
  agency's own downloaded header (with extras) becomes a per-agency mapping in slice (f).
- Gusto computes pay from hours × the rate stored in Gusto, so two-decimal hours can differ from our
  minute-exact pay by a few cents on lines whose minutes are not a multiple of 3. The export's
  control file lists every such line.

## SAP Fieldglass — supplier time sheet downloads

- **Approved Time Sheet Download** connector (CSV; buyer must enable it; supplier, buyer, MSP).
  Source: SAP Help, SAP Fieldglass Connector Library, page `e68b9441008b422fa8c1b9c64b126ea4`.
  - **One row per day** (unique on Time Entry Date + Cost Center + Task + Currency + UOM); a weekly
    sheet has at least seven rows, zeros on days not worked; OT on the same day is a separate row.
  - Columns, in order (* = off by default): Buyer Name, Buyer Code, Supplier Name, Supplier Code,
    Account Name, Account Code, Remit To Address Code*, Job Posting Owner, Work Order ID, Worker ID,
    Job Seeker ID, Worker Last Name, Worker First Name, Site Code, Site Name, Business Unit Code,
    Business Unit Name, Final Approver First Name*, Final Approver Last Name*, Final Approver
    Employee ID*, Final Approver Email*, Time Sheet ID, Time Sheet Status (Approved / Invoiced /
    Revoked), Time Sheet Start Date, Time Sheet End Date, Time Sheet Submit Date/Time, Time Sheet
    Approved Date, Time Entry Date, Cost Center Code, Cost Center Name, Task Code, Task Name,
    General Ledger Account Code, Billable Per Diem, Billable Hours, Non-billable Hours, Total Hours,
    time_entry_comments, Billable Amount, Billable Amount after Discount, Currency,
    Rate Category/UOM, Bill Rate Buyer, Bill Rate Supplier, Pay Rate, SOW ID, Account Category*,
    Work Location Name / Location Code; custom fields last as `[c] modulename_Field Name`.
  - The spec prints "Worker  ID" with two spaces: normalize whitespace when matching headers.
  - Hours are decimals (7.5, 8.0). Rate Category/UOM values: `ST/Hr`, `OT/Hr`, `ST/Day`, `ST/MTH`
    documented; `DT/Hr` inferred. ST = "Standard Time".
  - IDs: 4-letter buyer prefix + 2-letter type + 8 digits (e.g. `XXXXTS00049151`), max 16 chars.
  - Date format inside connector CSVs: unconfirmed (an XLSX example used MM/DD/YYYY).
- **Approved Time Sheet Fixed Format Download**: one row per time sheet, rate categories pivoted
  into columns (literal headers unconfirmed).
- **Analytics reports**: user-built, columns vary; XLSX/CSV include a title/filter line above the
  headers ("CSV Data Only" omits it).
