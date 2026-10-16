# Research F: payroll import formats (SPEC §13) and the payroll-export screen pattern

Researched 2026-10-16. Web only. No repository files were read or changed.
Every example row below is made up (fake company, fake worker IDs, no SSNs). Code values such as
`REG`, `OT`, `D`, `B` are placeholders: each customer's payroll setup defines its own codes.

Confidence legend:
- **HIGH**: the vendor's own spec or help page, read directly.
- **MEDIUM**: a vendor document hosted by a third party, or two or more independent integrator docs that agree.
- **LOW**: one secondary source, an inference, or not verified.
- `[UNVERIFIED]` marks a specific claim I could not confirm.

---

## 0. Executive summary

| # | Format | File | Delimiter / EOL | Hours format | Worker key | Per-row pay rate? | Flat-dollar lines? | Who multiplies OT? | Confidence |
|---|---|---|---|---|---|---|---|---|---|
| 1 | QuickBooks Desktop IIF (TIMEACT) | `.iif`, ASCII text | TAB / CRLF | `H:MM`, max 23:59 per row | Exact employee **name** string (EMP) + exact payroll item **name** (PITEM) | **No** (rate comes from the employee's payroll item in QuickBooks) | **No** (time only) | QuickBooks: employee rate x the OT item's multiplier | Structure HIGH; 2022+ behaviour MEDIUM |
| 2 | QuickBooks Online | **QBO has no native time-activity CSV import (US).** Documented routes: QuickBooks Time "Manual Time Import" CSV (column spec only inside the app), third-party importers, or the API | n/a | decimal or `H:MM` (importers) | Display name (importers) / employee ref (API) | No pay rate (importer HourlyRate is a *billing* rate) | No | QBO Payroll pay types (OT 1.5x and Double OT 2.0x) | MEDIUM |
| 3 | ADP Workforce Now Paydata | `PRcccEPI.csv` (or `EPIcccAA.csv`) | comma **or** tab (not mixed) / CRLF | decimal, explicit `.` e.g. `40.00` | `Co Code` + `File #` | **Yes**: `Temp Rate` (4 dp) or `Rate Code` | **Yes**: `Reg Earnings`, `O/T Earnings`, `Earnings 3/4/5` | ADP (not stated in the guide) | HIGH (ADP guide v13, 2017) |
| 4 | RUN Powered by ADP Time Sheet Import | `.csv`, any name | comma | decimal 11.2 | Company code (IID) + Employee ID *or* Time Clock ID | **No**: rate **codes** only (`BASE`, `RATE_2`..`RATE_5`, `HRLY4SLRY1`) | **Yes**: `Dollars` on amount-type earnings codes | RUN, via the earnings code type (1.5x and 2x only) | MEDIUM (2013 ADP partner guide plus 2026 vendor docs) |
| 5 | Generic mapped CSV (PEO / factor) | configurable | configurable | configurable | configurable | configurable | configurable | depends on target | Building blocks HIGH (Paychex SPI, PrismHR, Justworks, Deputy); factoring LOW |

Key reconciliation facts (details in §6):
- **QuickBooks Desktop** takes hours only. It prices each line as (rate on the employee's payroll item) x (that item's
  multiplier). A worked-week FLSA "regular rate" true-up, bonuses and ad-hoc rates **cannot** travel in IIF.
- **QBO Payroll** ties OT to a fixed rate. Intuit staff said in January 2026 that the 1.5x rate "must be manually calculated
  and updated" and cannot follow base pay automatically.
- **ADP WFN** can carry exact dollars per code and a per-row `Temp Rate`. This is the best format for reconciling to
  the penny.
- **ADP RUN** can carry hours or dollars per earnings code, but no custom rates in the CSV.
- **Justworks** (PEO): "the default overtime base rate will be the highest of the regular rates". A blended-rate OT
  calculation will therefore differ unless the admin edits it after import.
- **PrismHR** (the platform many PEOs run on): its optional "Recalculate Overtime Pay Rate" multiplies the file's rate by
  the code's multiplier.

---

## 1. QuickBooks Desktop: IIF time import (TIMEACT)

### 1.1 Sources
- Intuit, "IIF Overview: import kit, sample files, and headers" (official; defines IIF as ASCII TSV; says Intuit gives no
  assisted support for creating IIF):
  https://quickbooks.intuit.com/learn-support/en-us/help-articles/iif-overview-import-kit-sample-files-and-headers/00/262115
- **Intuit IIF Import Kit** (official content, "Updated 9/30/2008"). Intuit's download is no longer linked directly. It is
  mirrored on GitHub, for example `omniboost/go-quickbooks-desktop-iif`:
  - Header help `!TIMERHDR.htm`:
    https://raw.githubusercontent.com/omniboost/go-quickbooks-desktop-iif/master/IIF%20Import%20Kit/IIF%20Header%20Help/!TIMERHDR.htm
  - Header help `!TIMEACT.htm`:
    https://raw.githubusercontent.com/omniboost/go-quickbooks-desktop-iif/master/IIF%20Import%20Kit/IIF%20Header%20Help/!TIMEACT.htm
  - Example `Timer Activity.iif` (folder "QB 2007 & Enterprise 7.0 and later")
  - Manual `Start Here - IIF Import Manual.pdf`:
    https://raw.githubusercontent.com/omniboost/go-quickbooks-desktop-iif/master/IIF%20Import%20Kit/Start%20Here%20-%20IIF%20Import%20Manual.pdf
- Intuit, "Improved IIF import in QuickBooks 2019 and later" (official):
  https://quickbooks.intuit.com/learn-support/en-us/data-utilities/improved-iif-import-in-quickbooks-2019-and-later/00/203267
- Intuit Community thread on the Timer import being removed in QBDT 2022 (dated Oct 2021 to Jun 2023; staff replies in
  Mar 2023 say "this option is no longer available"):
  https://quickbooks.intuit.com/learn-support/en-us/employees-and-payroll/quickbooks-pro-timer-for-qbdt-2022/01/967256/highlight/true
- Redcort (Virtual TimeClock) 2022 workaround, "delete the first two rows":
  https://www.redcort.com/timeclock/support/blog/quickbooks-2022-payroll-integration-update
  and https://www.redcort.com/timeclock/support/blog/payroll-integration-with-quickbooks-desktop-2022
- Integrator docs:
  - Pacific Timesheet: https://timesheet.nepinc.com/timesheet/help/system_system_qbiif.html (mirror
    https://mg.pacifictimesheet.com/timesheet/help/system_system_qbiif.html)
  - Timesheets.com: https://support.timesheets.com/knowledge-base/quickbooks-desktop-iif-export/ and the importer
    troubleshooting page https://support.timesheets.com/?p=4014
  - Time Clock MTS: https://www.timeclockmts.com/online-help/quickbooks-integration.htm
  - Fanurio: https://www.fanuriotimetracking.com/files/releases/3.4/help/html/quickbooks.html
  - Procore: https://v2.support.procore.com/product-manuals/timesheets-company/tutorials/export-a-timer-list-as-an-iif-file-from-quickbooks-desktop
  - Deputy: https://help.deputy.com/hc/en-au/articles/4694853299087-Exporting-to-Intuit-QuickBooks-Desktop-US
- Open-source generators, for corroboration only: TimeTrex `PayrollExportReport.class.php` (GitHub
  `aydancoskun/timetrex-community-edition`); `linjunpop/riif`; BillingTrack.

### 1.2 Structure (Intuit kit)
IIF is ASCII, tab-separated. A row that starts with `!` declares the column names for the data rows of that keyword
that follow it. The Timer block always begins with the `TIMERHDR` header, followed by `TIMEACT` activity rows.

Intuit's example `Timer Activity.iif` (QB 2007 and later), with tabs shown as `→`. The real file ends lines with CRLF and
pads with trailing tabs.
```
!TIMERHDR→VER→REL→COMPANYNAME→IMPORTEDBEFORE→FROMTIMER→COMPANYCREATETIME→→→
TIMERHDR→8→0→Import Test Company→N→Y→1208544781→→→
!HDR→PROD→VER→REL→IIFVER→DATE→TIME→ACCNTNT→ACCNTNTSPLITTIME→
HDR→QuickBooks Pro for Windows→Version 6.0D→Release R4P→1→4/18/2008→1208545205→N→0→
!TIMEACT→DATE→JOB→EMP→ITEM→PITEM→DURATION→PROJ→NOTE→BILLINGSTATUS
TIMEACT→01/05/08→Customer→Joe Employee→Item→→4:15→→Notes about the activity→0
```
Integrators that target payroll (Pacific Timesheet, TimeTrex, Time Clock MTS) use an 11-column `!TIMEACT` row that
adds `XFERTOPAYROLL` before `BILLINGSTATUS`:
```
!TIMEACT	DATE	JOB	EMP	ITEM	PITEM	DURATION	PROJ	NOTE	XFERTOPAYROLL	BILLINGSTATUS
```

**`!TIMERHDR` fields** (Intuit header help):

| Field | Meaning |
|---|---|
| VER | Timer version number (examples use `7` or `8`) |
| REL | Timer release number (`0`). Pacific Timesheet says a wrong REL can make QuickBooks show a warning |
| COMPANYNAME | Company name exactly as in QuickBooks' Company Information window |
| IMPORTEDBEFORE | `N` in every example |
| FROMTIMER | `Y` = activity going from Timer into QuickBooks |
| COMPANYCREATETIME | Number that identifies the company file. It comes from a Timer Lists export of that file |

**`!TIMEACT` fields** (Intuit header help, with integrator notes):

| Field | Intuit definition | Notes for Shiftbook |
|---|---|---|
| DATE | Date performed, **MM/DD/YY** (e.g. 06/21/97) | Pacific Timesheet says YYYY-MM-DD is the "standard QuickBooks date exchange format" but older versions need M/DD/YY. TimeTrex writes `n/j/y`. **Use Intuit's MM/DD/YY.** `[UNVERIFIED]` whether the 2019+ importer follows Windows locale |
| JOB | `Customer:Job`; must exist on the Customer:Job list | Optional for non-billable payroll time (blank in TimeTrex and some examples) |
| EMP | Employee; must exist on the Employee list | **Exact string match.** TimeTrex and Pacific Timesheet write "Last, First M". Timesheets.com: a mismatch makes QuickBooks create a **new** employee or name |
| ITEM | Service item; must exist on the Item list | Blank is fine when non-billable. Timesheets.com: missing items are auto-created |
| PITEM | Intuit's 2008 kit: "Leave blank; not used" | **Integrators who target payroll fill this with the payroll item name** (Timesheets.com, Pacific Timesheet, Time Clock MTS, TimeTrex). Errors when it is missing or unassigned: "Timer data does not have an assigned payroll item"; "Payroll item must be assigned before import" (Timesheets.com) |
| DURATION | `HH:MM`, e.g. `4:15`; **cannot exceed 23:59** | Shiftbook's integer minutes convert exactly. Split anything over 23:59 into several rows |
| PROJ | QuickBooks **Class**; must exist on the Class list | Optional |
| NOTE | Up to 1000 chars on one line; type `/n` for a line break | Never put a TAB or CR/LF in a value |
| XFERTOPAYROLL | Not in Intuit's 2008 header help | `Y` = send to payroll (Pacific Timesheet, TimeTrex) |
| BILLINGSTATUS | `0` not billable, `1` billable not yet billed, `2` billed | Use `0` for payroll-only time. Deputy saw error 3180 "Billable activities must have a customer:job and service item" and fixed it by making timesheets non-billable in preferences |

### 1.3 Import paths and the header-row quirk (MEDIUM)
- **QuickBooks Desktop up to 2021:** *File > Utilities > Import > Timer Activities*, or the Timer menu equivalent. The
  file must start with `!TIMERHDR`/`TIMERHDR` carrying the right VER/REL/COMPANYNAME/**COMPANYCREATETIME**. Vendors
  get these values by asking the user to run *File > Utilities > Export > Timer Lists* and reading the second line
  (Time Clock MTS, Timesheets.com, Procore, Fanurio).
- **QuickBooks Desktop 2022 and later:** Intuit removed "Import Timer Activities" and "Export Timer Lists". Only
  *File > Utilities > Import > IIF Files* remains. Users reported errors on files that imported fine for years. Intuit
  staff (Mar 2023): "this option is no longer available".
  Redcort's documented workaround is to **delete the first two rows** (the `!TIMERHDR` and `TIMERHDR` pair), so the
  file starts at the TIMEACT block ("first row ... should start with TIMEACT"), and then import as a plain IIF file.
  My reading: the remaining first line is `!TIMEACT`. `[UNVERIFIED]` whether a `!HDR`/`HDR` pair is allowed or needed.
- **Recommendation:** offer two variants and ask the user which version they run.
  - **"QuickBooks Desktop 2022 or later"** (default): no TIMERHDR rows, file starts at `!TIMEACT`.
  - **"QuickBooks Desktop 2021 or earlier"**: TIMERHDR rows included. Requires a COMPANYCREATETIME taken from the
    user's Timer Lists export.
- An open-source generator (BillingTrack) has a comment that VER and REL need a leading space (`TIMERHDR\t 8\t 0`).
  Intuit's own sample has no space. `[UNVERIFIED]`; LOW.
- **2019+ importer behaviour** (Intuit): it scans the file first. Failed records are written to a new `.iif` "with error
  info" that "Review now" opens. Errors look like `[ERROR] The record at (or starting at) this line could not be
  imported...` (seen in Deputy's doc). "Import it for me. I'll fix it later" skips review, and Intuit advises against it.

### 1.4 Name-match pre-flight (rules from the Intuit manual and integrators)
- Intuit manual: "There is no preventative mechanism to stop the same IIF from being imported multiple times", and
  "There is no Undo". The **Paycheck** transaction type cannot be imported by IIF at all, so IIF can only feed *time* that
  QuickBooks later turns into paychecks.
- List elements (employees, items, payroll items, customers, classes) must exist **before** import. Otherwise "default
  list element types will be taken". Misspelled employees and service items get auto-created (Timesheets.com).
- The Customer:Job list treats "FIRST LAST" and "LAST, FIRST" as the same name. Using a different form fails with "Can't
  change the type of a name or add a duplicate name" (Intuit manual).
- Middle initials are a common cause of mismatches, e.g. "Sample Worker" vs "Sample Q. Worker" (Timesheets.com).
  Deputy says it ignores the middle-initial field.
- The employee needs **"Use time data to create paychecks"** turned on in Payroll Info (Timesheets.com, Deputy). The
  PITEM payroll item must appear in that employee's Payroll Info earnings list (Timesheets.com error "Payroll item must
  be assigned before import").
- **Suggested pre-flight UX:** the user uploads QuickBooks' *File > Utilities > Export > Lists to IIF Files* output
  (Employee list, Payroll Item list, and optionally Item, Customer:Job and Class lists). That menu still exists in 2022+;
  `[UNVERIFIED]` exact current menu wording. Shiftbook then checks every EMP, PITEM, JOB, ITEM and PROJ value
  byte-for-byte, reporting near-misses (case, whitespace, middle initial, "Last, First" vs "First Last"). It blocks
  the export until every value is mapped. This matches how Fanurio reads `TimerList.iif` (EMP NAME, INVITEM NAME,
  CUST NAME).

### 1.5 Encoding, delimiters, line endings
- ASCII TSV (Intuit). Intuit's sample files use **CRLF** and trailing tabs.
- There is no quoting mechanism. A value must never contain TAB, CR or LF.
- `[UNVERIFIED]` Spreadsheet programs may wrap values in double quotes when saving, and QuickBooks may take those quotes
  literally. Write the file directly; never round-trip it through Excel.
- Non-ASCII names: IIF is documented as ASCII. `[UNVERIFIED]` Windows-1252 handling. Recommendation: refuse characters
  outside printable ASCII in matched fields, and ask the user to fix the QuickBooks name or the mapping. Transliterating
  would break the exact match.

### 1.6 Earning types IIF can carry
| Earning type | Possible? | How |
|---|---|---|
| Regular hours | Yes | PITEM = regular hourly item |
| OT 1.5x / DT 2.0x hours | Yes | PITEM = OT or DT payroll item. QuickBooks multiplies (see §6) |
| Holiday / PTO / sick hours (hourly items) | Yes | PITEM = matching hourly payroll item, e.g. Timesheets.com's "Std/OT/DT/Sick/Vacation/PTO/Holiday Hours" items |
| Premium hours at a different rate (shift differential) | Only through a separate payroll item whose rate is set on the employee in QuickBooks | **No per-row rate field** |
| Flat dollars (bonus, meal/rest premium pay, reporting-time pay, commissions) | **No** | TIMEACT has no amount field, and Paycheck cannot be imported by IIF |
| Negative hours / corrections | **No** (treat as unsupported) | `[UNVERIFIED]` |
| Reimbursements | **No** | |

**SPEC §13 rule:** fail the IIF export if the run contains any flat-dollar line, any rate that is not the employee's
configured item rate, or any line that cannot be expressed as (employee, payroll item, date, duration ≤ 23:59).

### 1.7 Example (QuickBooks Desktop 2022+ variant, fake data, TAB-separated, CRLF)
```
!TIMEACT	DATE	JOB	EMP	ITEM	PITEM	DURATION	PROJ	NOTE	XFERTOPAYROLL	BILLINGSTATUS
TIMEACT	10/05/26		Worker, Sample		Hourly Regular	8:00			Y	0
TIMEACT	10/06/26		Worker, Sample		Hourly Regular	8:00			Y	0
TIMEACT	10/06/26		Worker, Sample		Overtime (x1.5)	2:30			Y	0
```
Use one row per employee x date x payroll item (x job/class when used). TimeTrex writes one row per pay-period total
dated at period end. That breaks Intuit's 23:59 limit for any total above one day, so avoid it.

### 1.8 Pitfalls
1. Importing twice duplicates the time, and there is no undo (Intuit manual, Timesheets.com, Pacific Timesheet). Keep an
   export ledger and warn on a re-export.
2. QBDT 2022+ removed the Timer menu, so a file with TIMERHDR rows may fail (§1.3).
3. Hourly employees need "Use time data to create paychecks". Mixing that with project time raises HRESULT 0x80040300
   (Timesheets.com).
4. DURATION is at most 23:59 per row.
5. Billable flag: non-payroll billable rows need a customer:job and a service item (error 3180).
6. Intuit offers no support for building IIF files ("Intuit does not offer assisted technical support"), so always
   import into a test company file first.

**Confidence:** structure and fields HIGH (Intuit kit). PITEM/XFERTOPAYROLL payroll use MEDIUM (several integrators
agree; Intuit's 2008 kit says PITEM is unused). 2022+ header handling MEDIUM-LOW (one vendor workaround plus user
reports).

---

## 2. QuickBooks Online: what exists for importing time or payroll hours

### 2.1 Findings
- **QBO's own data import does not include time.** Intuit's "Common questions about importing data" lists bank data,
  customers, suppliers/vendors, chart of accounts, products and services, invoices, credit notes, sales receipts,
  journal entries and bills. Time activities are not listed. The page I could open was the non-US variant:
  https://quickbooks.intuit.com/learn-support/en-ca/help-article/import-export-files/common-questions-importing-data-quickbooks-online/L4OYJRFdj_CA_en_CA
  (LOW-MEDIUM for the US).
- **Intuit staff (US community, May 2021):** "I'd suggest using an importer tool to upload your timesheets into QuickBooks
  Online", pointing to the App Center:
  https://quickbooks.intuit.com/community/employees-and-payroll-2/import-csv-time-sheets-into-quickbooks-online-12450
- **QuickBooks Time (US) CSV import** (official): "Export or import time data in QuickBooks Time"
  https://quickbooks.intuit.com/learn-support/en-us/help-article/time-tracking/export-import-time-data-quickbooks-time/L1f77o0jJ_US_en_US
  - Two importers under **Feature Add-ons**:
    - **Punch Time Import**: clock-in and clock-out rows. Overlapping timesheets cause an error.
    - **Manual Time Import**: hour totals. Can **Append** or **Replace**.
  - Rules: CSV with at most **750 rows**. A **Test Mode** checkbox validates without importing. At least one customer or
    job must exist. Approved or submitted time in the date range blocks the import. If the add-on is missing, contact
    support.
  - **Exact column headers are not public.** They are in the in-app **Help** tab and a downloadable "sample manual time
    import.csv". The troubleshooting article says headers are **case sensitive**:
    https://quickbooks.intuit.com/learn-support/en-uk/help-article/time-tracking/troubleshoot-csv-import-errors-quickbooks-time/L6VhqGxkF_GB_en_GB
    One error string reads "Uploaded file did not contain any columns where the column name matched the name of a
    time off code". `[UNVERIFIED]` inference: the Manual Time Import may use one column per job or time-off code.
    **Columns `[UNVERIFIED]`.**
  - QuickBooks Time then sends hours to QBO Payroll through the **Payroll Item Mapping Tool**. Pay Rate Engine OT rules
    can map only **1.5x or 2.0x** to the Overtime and Double Overtime pay types:
    https://quickbooks.intuit.com/learn-support/en-us/help-article/feature-preferences/configure-change-advanced-overtime-settings-time/L7vozE5kS_US_en_US
- **QBO Advanced Payroll (UK/AU, not US)** does have a mapped timesheet CSV import (CSV/TSV, one entry per line,
  column-type mapping, "Save timesheet format"):
  https://quickbooks.intuit.com/learn-support/en-uk/help-article/time-tracking/importing-timesheets-quickbooks-online-advanced/L5RR0QwSw_GB_en_GB
  It is a useful **UX reference** for a mapped CSV importer, but it does not apply to US QBO Payroll.
- **Third-party importers** (documented columns):
  - **Transaction Pro / Rightworks** "Import Time Activities into QuickBooks Online":
    https://tprosupport.rightworks.com/kb/article/439-import-time-activities-into-quickbooks-online/
    Fields: `TXNDATE`, `NAME` (required; employee or contractor, exact match), `TIME` (`5:30` or `5.5`) **or**
    `STARTTIME`/`ENDTIME` (never both), `DESCRIPTION`, `BILLABLESTATUS` (1/t/true/y/yes/Billable; 0/f/false/n/no/NotBillable),
    `CUSTOMER` (required), `SERVICEITEM` (required if billable), `HOURLYRATE` (**invoice rate**; blank uses the
    employee's QBO rate), `TAXABLE`, `CLASS`, `LOCATION`. **No payroll-item field.**
  - **SaasAnt Transactions** (states "QuickBooks doesn't offer a built-in way to import time activity in bulk"):
    https://www.saasant.com/blog/import-time-activity-quickbooks-online/
    Columns: `Name, Date, Customer, Service Item, Duration (2:30 or 2.5), Billable Status, Hourly Rate, Class, Location, Description`.
  - Dancing Numbers (secondary, 2026): names must equal the QBO **Display Name** exactly:
    https://www.dancingnumbers.com/import-time-activities-into-quickbooks/
- **QBO Accounting API `TimeActivity`** (for a direct integration later, not a file):
  - Fields include `TxnDate`, `NameOf` (`Employee`|`Vendor`), `EmployeeRef`/`VendorRef`, `Hours`, `Minutes`,
    `StartTime`, `EndTime`, `BreakHours`, `BreakMinutes`, `HourlyRate`, `BillableStatus`, `Taxable`, `CustomerRef`,
    `ItemRef`, `ClassRef`, `DepartmentRef`, `Description`, and **`PayrollItemRef`**.
  - Field names are partly confirmed by https://tray.ai/documentation/connectors/service/quickbooks/quickbooks-operations-sample-payloads
    and the Windsor field list. PayrollItemRef appears in Intuit developer forum threads, e.g.
    https://help.developer.intuit.com/s/question/0D54R00009A18l5SAB/
  - Developers report errors with PayrollItemRef in production and on Canadian QBO. `CostRate` is from memory
    `[UNVERIFIED]`.
- **Hours-to-pay-type mapping in practice:**
  - Workyard maps internal Regular/OT/DT to QBO pay types **per employee**. A pay type saves only if it is already
    assigned to that employee in QBO:
    https://help.workyard.com/en/articles/15467712-how-to-map-pay-types-for-quickbooks-online-payroll-exports
  - 7shifts says its QBO integration sends OT **as regular hours** because "QuickBooks does not support separating OT
    hours into their own column during the import process":
    https://kb.7shifts.com/hc/en-us/articles/36489913416979-Why-are-Overtime-hours-exporting-as-Regular-Hours-through-Quickbooks

### 2.2 What this means for Shiftbook
- A file called "QuickBooks Online importer CSV" can only mean **a CSV for a third-party importer** (Transaction Pro or
  SaasAnt style). That puts TimeActivity rows (hours per employee per date) into QBO, and QBO Payroll then picks them
  up as timesheet hours. **Pay types (OT/DT) cannot be set through those importers** (no payroll-item column), so every
  row would land as the employee's default pay type. In practice only **regular hours** are safe. Any OT, DT, premium
  or flat-dollar line should make the export **fail**, unless a later API integration sets PayrollItemRef.
- Alternative: a **QuickBooks Time Manual Time Import** CSV. Its column spec is only in the app (`[UNVERIFIED]`), so
  owner action is needed to get the sample file.
- Suggested importer-CSV columns (union of Transaction Pro and SaasAnt, which map columns by name):
  `Date, Name, Customer, Service Item, Hours, Billable, Description, Class, Location`.
  - Date as `MM/DD/YYYY`. Hours as decimal with 2 dp, or `H:MM`; pick one and keep it.
  - Name must be the exact QBO Display Name.
  - Use a generic customer such as "Payroll - Internal" when the time is not billable. Transaction Pro requires
    CUSTOMER.

**Confidence:** "QBO US has no native time CSV import" MEDIUM-HIGH (Intuit staff plus Intuit's import list). Importer
columns HIGH for those products. QuickBooks Time import columns LOW (not public).

---

## 3. ADP Workforce Now: Paydata import (`PRcccEPI.csv`)

### 3.1 Sources
- **ADP, "ADP Workforce Now® Importing Paydata", Version 13 (© 2017)**. This is the official guide, published as an
  attachment on Time Portal's help article (ADP marks it "proprietary and confidential", so cite it and do not
  redistribute it):
  https://support.timeportal.io/hc/en-us/articles/23838801956887-ADP-Workforce-Now-Payroll-Export (attachment
  "ADP Work Force Now PayData Export.pdf"). **Primary source for everything in §3.2 to §3.5.**
- ADP Marketplace, "Automated Paydata Integration for ADP Workforce Now" (official; .csv or tab .txt over SFTP; Co Code,
  Batch ID and File # in positions 1 to 3; lists of other fields):
  https://apps.adp.com/en-US/apps/372723/automated-paydata-integration-for-adp-workforce-now/features
- Integrator docs (2025-2026):
  - 7shifts: https://kb.7shifts.com/hc/en-us/articles/4417520074387-ADP-Workforce-Now-US-Payroll-Export
  - ClickTime: https://support.clicktime.com/hc/en-us/articles/41018977335565-Export-Payroll-Data-to-ADP
  - Time Portal (link above)
  - Sundial: https://sundialtimesystems.freshdesk.com/support/solutions/articles/1000241796-realtime-adp-export
  - Worksana: https://help.worksana.com/en/articles/11889709-adp-workforce-now-export
  - Compt: https://compt.helpscoutdocs.com/article/119-how-to-manually-upload-a-compt-payroll-report-to-adp-workforce-now

### 3.2 File naming (ADP guide, "What File Name to Use")
- Single file: **`PRcccEPI.CSV`**, where `ccc` is the company code. For a **2-character code use `cc_`** (underscore
  third), e.g. `PR12_EPI.csv`.
- Several files in one payroll (e.g. salaried and hourly separately): **`EPIcccAA.CSV`**, where `AA` is a 2-character
  user-chosen identifier (A-Z, 0-9).
- Company groups: `PR.groupcode.EPI.CSV` or `EPI.groupcode.AA.CSV` (groupcode alphanumeric, no spaces, max 25).
- Paydata grids exported from WFN default to `EPIccc00.CSV`.
- In the data rows, the company code must match the file name, **without** the underscore for 2-character codes.
- 7shifts: a wrong name gives ADP's error "File Name is Invalid". Compt and Worksana use `EPI` + code + 2 digits
  (e.g. `EPI6KM01.csv`).

### 3.3 Records, delimiters, encoding (ADP guide ch. 3)
- **One header record**, which must be the first line, then data records. Blank records are **not allowed**. There is
  no limit on the number of rows.
- **Comma (ASCII 44) or tab (ASCII 9)**. Pick one and do not mix them. Each record ends with **CR+LF**.
- Empty fields: write consecutive delimiters (`40.00,,689`). Trailing empty fields may be dropped. **"Do not enter a
  zero to indicate the absence of data."** Write a blank, not `0.00`.
- **Valid characters: ASCII 32-91 and 93-122.** That excludes backslash (92) and `{|}~` (123-126) and everything
  non-ASCII. Field names are **not case-sensitive**.
- Numbers:
  - Positive amounts are unsigned (`465.00`).
  - Negative amounts take `-` before or after (`-465.00` or `465.00-`).
  - "Decimal amounts require a decimal in the correct position (Paydata import assumes a whole number if a decimal is
    missing)". Always write explicit decimals.
- Any field may be double-quoted. Embedded quotes are doubled. Quote values that contain a comma or leading spaces.
- One file may only hold employees who work in the **same country**.
- **Informational fields** are ignored on import and taken from the employee record: Clock, Data Control, Employee Name,
  Home Cost Number, Home Department, **Rate**, Social Security Number, Standard Hours. They must sit after File # and
  before any non-informational field. **Shiftbook should never write the SSN column** (the data-safety rule).

### 3.4 Fields (exact header text from the ADP guide; order after the first three is free)
Required, in this order:

| Pos | Header | Rules |
|---|---|---|
| 1 | `Co Code` | 3 chars, A-Z 0-9 & -. Must exist, be set up for paydata import, and be at a cycle phase that allows paydata |
| 2 | `Batch ID` | **1-8 chars**. Each new Batch ID creates a new batch, so group rows by Batch ID. If blank or a duplicate, ADP generates `EPIPnnnn`. (ClickTime and Worksana use a 6-digit date, `YYMMDD`) |
| 3 | `File #` | 6 chars, range 51-999999 (employee file number / position ID without company code) |

Paydata fields relevant to Shiftbook (exact names, with simple and compound forms):

| Header | Meaning / range | Notes |
|---|---|---|
| `Reg Hours` | regular hours, -40500.00 to 99999.99 | |
| `O/T Hours` | overtime hours, same range | Header text uses a slash: `O/T Hours` (ClickTime writes "OT Hours"; prefer ADP's) |
| `Hours 3 Code` / `Hours 3 Amount` | other-hours code (1-2 chars; A-Z or 0-79 except 40, 50, 60, 61; Expanded Fields: 1-3 chars A-Z 0-9) + hours | **Paired**: the code column must come immediately before its amount |
| `Hours 4 Code` / `Hours 4 Amount` | same | |
| `Reg Earnings` | regular earnings **dollars** | -9999999.99 to 9999999.99 (non-expanded) |
| `O/T Earnings` | overtime earnings dollars | |
| `Earnings 3 Code` / `Earnings 3 Amount` | other-earnings code + **dollars** | Paired. "Hours 3 corresponds to Earnings 3. Hours 4 corresponds to Earnings 4." |
| `Earnings 4 Code` / `Earnings 4 Amount` | same | |
| `Earnings 5 Code` / `Earnings 5 Amount` | same | |
| `Temp Rate` | temporary rate amount, **-405.0000 to 999.9999, precision 4** | **Not allowed if `Rate Code` is in the file** |
| `Rate Code` | temporary rate code (2, 3, 4-9, A-Z; 1 not allowed) | 2 or 3 only if the employee has Rate 2 or 3. Not allowed together with `Temp Rate` |
| `Temp Dept` | temporary department, 3 or 6 chars to match company setup | Overrides allocation position for the row |
| `Temp Cost Number` | up to 50 chars, A-Z 0-9 space $ , - . / | Needs Labor Distribution by Cost Number. First char not blank |
| `Pay #` | 1-9, N, X; default 1 | Separate checks |
| `Shift` | 2-9 | ADP's multi-row example uses it to split OT by shift |
| `Memo Code` / `Memo Amount` | memo items | 7shifts uses memo 5 for tips |
| `Adjust Ded Code` / `Adjust Ded Amount` | one-time deduction adjustment | Out of scope for hours |
| `FLSA Workweek` | 1, 2 or blank (biweekly week 1/2) | Only if company and employee are set up for FLSA Overtime |
| `FLSA Special Processing Code` | E (exclude), C (compare rates), blank | Same requirement |
| `Batch Description` | informational, 1-20 chars | Not imported; default `EPIPBATCH` |
| `Employee Name` | informational | Ignored on import; handy for humans |

**Repeated pairs:**
- "A specific Hours/Earnings code can be used only once within a record."
- Without Expanded Fields there can be only **four occurrences** of Hours/Earnings 3 codes combined (and four of
  Hours/Earnings 4 combined). Examples: "four Hours 3 codes and no Earnings 3 codes" or "three Hours 3 codes and one
  Earnings 3 code".
- So the **header may repeat** `Hours 3 Code,Hours 3 Amount` pairs. ClickTime and 7shifts both do this.
- Going over the limit gives: "You have reached the maximum number of Hours/Earnings codes ... split the information
  into two calculations". The fix is another record for the same File #.
- **Compound fields** (`Compound Hours 3 Code`, etc.) create "Enter at Runtime" columns. A code cannot appear in both a
  simple and a compound column.

**Multiple rows per employee: allowed.** ADP's "Multiple Records for One File Number" example has three rows for one
File # to separate hours by `Shift`. Shiftbook can therefore write **one row per employee per distinct rate, department
or cost number**, each with its own `Temp Rate` / `Temp Dept`.

### 3.5 Example rows (ADP guide's own examples, reproduced as format facts)
```
Co Code,Batch ID,File #,Reg Hours,O/T Hours,Temp Dept<CR/LF>
ABC,123,111111,40.00,5.00,689<CR/LF>
ABC,123,222222,40.00,,689<CR/LF>
ABC,123,333333,40.00<CR/LF>
```
Suggested Shiftbook layout (fake values; Hours 3 code `D` = double time and Earnings 3 code `B` = bonus are
placeholders the customer must supply):
```
Co Code,Batch ID,File #,Employee Name,Temp Dept,Temp Rate,Reg Hours,O/T Hours,Hours 3 Code,Hours 3 Amount,Hours 4 Code,Hours 4 Amount,Earnings 3 Code,Earnings 3 Amount
XYZ,SB261011,000123,"Worker, Sample",,22.5000,40.00,6.50,D,2.00,,,B,150.00
XYZ,SB261011,000123,"Worker, Sample",,25.0000,8.00,,,,,,,
XYZ,SB261011,000456,"Worker, Other",,18.0000,32.00,,,,H,8.00,,
```
The second row is the same worker's hours at a different rate. A Temp Rate on a row prices that row's hours (see §6
for the OT caveat).

Integrator header orders, for reference:
- **7shifts:** `Co Code, Batch ID, File #, Employee Name, Temp Dept, Temp Rate, Reg Hours, O/T Hours, Hours 3 Code,
  Hours 3 Amount, Hours 4 Code, Hours 4 Amount (repeated for PTO / unpaid / sick), Earnings 5 Code, Earnings 5 Amount
  (repeated for tips)`. If no holiday code is set, holiday hours go into Reg Hours.
- **ClickTime:** `Company Code(A), Batch ID(B), File Number(C), Employee Name(D), Temp Rate(E, blank), Reg Hours(F),
  OT Hours(G), Hours 3 Code/Amount pairs...`. It warns: "do not rename column headers or reorder columns".
- **Sundial:** `Co Code, Batch ID, File #, Employee Name, Temp Dept, Reg Hours, O/T hours, Hours 3 Code, Hours 3 Amount,
  Earnings 3 Code, Earnings 3 Amount, Rate Code, Temp Rate, Job Cost#`. Note that this has both Rate Code and Temp Rate,
  which the ADP guide forbids in one file.

### 3.6 How ADP computes pay; Temp Rate
- `Temp Rate` = "Temporary rate amount" for that record. 7shifts: with "Export wages" off, "the default wage listed in ADP
  will be used to calculate earnings". In other words, Temp Rate overrides the employee's rate on that row. Time
  Portal uses it for hourly or piece rates. The informational `Rate` column is ignored and replaced by the employee's
  stored rate.
- **O/T Hours multiplier:** the guide **does not say** which factor ADP applies to `O/T Hours` or to Hours 3/4 codes. In
  practice it is the company's ADP setup (OT factor; per-code settings in the Hours & Earnings validation table, under
  Setup > Tools > Validation Tables > Hours & Earnings Codes per 7shifts). `[UNVERIFIED]` whether the OT factor applies
  to `Temp Rate` on the same row; I believe it does.
- **To reconcile to the cent, send dollars, not hours, for anything priced unusually.** `Reg Earnings`, `O/T Earnings`
  and `Earnings 3/4/5` take exact amounts. Sending only dollars may leave hours missing from pay statements and
  hours-worked reports. A hybrid works: hours for straight time, plus a dollar earnings code for the FLSA regular-rate
  OT premium true-up.
- ADP's FLSA Overtime option (`FLSA Workweek`, `FLSA Special Processing Code`) means ADP can recalculate FLSA regular
  rate itself for set-up companies. That is a **double-count risk** if Shiftbook also adds a true-up. Require the user to
  declare which side computes it.

### 3.7 Steps and errors
- Enable once: **Setup > Payroll > Company Options > (co code) > Import section > Paydata** (guide ch. 2; Compt).
- Import during the paydata-entry phase, before the Payroll Transmission file is created (otherwise reset the cycle).
  Path: Process > (Payroll) > Import Paydata, or Payroll Dashboard > Import File.
- Completion status: "Completed" or "Completed with errors" (Compt, 7shifts). Error log examples from the guide:
  "Earnings code {0} doesn't exist in the validation table in the record with file number {1}"; department-length
  errors; the max-codes error above. Totals are checked with Page Totals / Batch Totals.
- If Effective Dating is on, rows are validated against employee records as of the pay period end date. Paydata for
  future hires imports only if the position start date is in the current cycle.

### 3.8 Earning types ADP WFN can carry
Regular hours, OT hours, any hours code (DT, holiday, PTO, sick, premium) and any earnings dollars code (bonus, meal/rest
premium pay, reporting-time pay, tips, reimbursements if the customer's code is non-taxable) are all carried. So are
negative corrections, a per-row rate (`Temp Rate`, 4 dp, max 999.9999), departments and cost numbers. Fail only when:
- a needed code is not mapped;
- a rate is above 999.9999;
- the 4-code-per-record limit cannot be met by splitting rows;
- a character falls outside ASCII 32-91 / 93-122.

**Confidence:** HIGH (ADP guide), apart from the OT multiplier semantics (LOW, not documented).

---

## 4. RUN Powered by ADP: Time Sheet Import

### 4.1 Sources
- **ADP, "Time Sheet Import and RUN Powered by ADP Payroll for Partners"** (ADP document marked "Draft 8.7.13",
  "ADP Proprietary and Confidential", hosted by a third party):
  https://silo.tips/download/time-sheet-import-and-run-powered-by-adp-payroll-for-partners (record layout, rules, error
  codes). It is old but is the only ADP-authored layout I found.
- ADP Marketplace, "Payroll Data Input API Guide for RUN Powered by ADP" ch. 3 (2022). It shows the API mirrors
  *Home > Time Sheet > Time Sheet Import*: pay frequency, period start/end, earning code, rate code, hours, amount,
  department:
  https://marketplace-cdn.adp.com/dev-portal/pdf/protected/Payroll_Data_Input_API_Guide_for_RUN_Powered_by_ADP_chapter_3
- Integrator docs (2024-2026):
  - Lathem / PayClock (layout): https://kb.lathem.com/hc/en-us/articles/360000929453-How-to-Integrate-with-and-Export-to-ADP-RUN
    and https://help.payclock.com/Content/Integrations/Setting%20up%20to%20integrate%20and%20export%20to%20ADP%20RUN.htm
  - Connecteam (1.5x and 2x only, rate codes): https://help.connecteam.com/en/articles/8607186-exporting-to-adp-run
  - Redcort (setup path): https://redcort.com/files/pdfs/payroll-guides/ADP-Run-Payroll-Integration-Guide.pdf
  - Deputy: https://help.deputy.com/hc/en-au/articles/4694235841295-Exporting-to-ADP-Run-US
  - Timeero: https://help.timeero.com/getting-started-with-the-adp-run
  - Timesheets.com: https://support.timesheets.com/knowledge-base/adp-run/

### 4.2 File rules (ADP partner guide, "File Specifications")
- **.csv, comma-delimited.** Error 34608 if the file type is not .csv.
- **No filename rule.** ADP recommends including pay frequency and period dates, e.g. `Biweekly-08172013-08302013.csv`.
- **Row 1:** version identifier `##GENERIC## V1.0` (required, 16 chars).
  **Row 2:** column headings.
  **Row 3 and on:** data.
- **One pay frequency per file.** Company code (IID, or branch code + ADP code), pay frequency and period start/end
  must be **identical on every row**.
- Only **one file per pay frequency** can be Pending or Approved at a time. Finish it before importing another.
- Only active employees are imported. Leave of Absence and terminated-before-period employees are excluded.
- Decimals must be explicit. Negatives take a leading `-`.
- **"The file must include rate codes only, not rate values."**
- Enable it in RUN under *Settings > General Settings > Features and Services > Payroll Features > Time Sheet Import*
  (Redcort) or *Company > Features > Overview* (Timeero, Connecteam). Otherwise ask ADP to switch it on. The templates
  are in RUN's Support Center > Payroll Support > Time Sheet Import (partner guide).

### 4.3 Columns (ADP partner guide record layout; order is fixed)
| # | Heading (guide's sample title) | Detail rule | Type / len | Req |
|---|---|---|---|---|
| 1 | Company code. The title-row sample reads "IID, or Branch Alphanumeric Code+ADP Code"; integrators label it `Company Code` | Client code | Text 10 | Y |
| 2 | `Pay Frequency` | `W` weekly, `B` biweekly, `S` semimonthly, `M` monthly, `Q` quarterly | Text 10 | Y |
| 3 | `Pay Period Start Date` (integrators: "Pay Period Start") | e.g. `02/14/2012` (MM/DD/YYYY) | Date 10 | Y |
| 4 | `Pay Period End Date` | same | Date 10 | Y |
| 5 | `Employee ID`, **or Employee Time Clock ID** in the alternate template | payroll-assigned ID (e.g. `001`) or your own clock ID | Text 15 | Y |
| 6 | `Earnings Code` | from the RUN Earnings Codes report, e.g. `REG` | Text 10 | Y |
| 7 | `Pay Hours` | hours for this code, e.g. `80.00` | Num 11.2 | N |
| 8 | `Dollars` | dollars for this code, e.g. `2000.00` | Num 11.2 | N |
| 9 | `Separate Check` | `0`-`9` (0 = main check) | Num 2 | Y |
| 10 | `Worked In Dept` (integrators: "Worked Department") | dept number from the Department Numbers report | Num 6 | N |
| 11 | `Rate Code` | `BASE`, `RATE_2`..`RATE_5` (2nd-5th hourly rates), `HRLY4SLRY1` (1st hourly rate of a salaried employee) | Text 10 | Y |

`[UNVERIFIED]` whether RUN checks row-2 heading text or reads columns by position. Integrators label the columns
differently (Lathem: "Company Code, Pay Frequency, Pay Period Start, Pay Period End, Employee ID or Employee Time Clock
ID, Earnings Code, Pay Hours, Dollars, Separate Check, Worked Department, Rate Code"), which suggests position. **Get
the official template from the customer's RUN account and copy its row-2 text exactly.**

Example (fake data, weekly; codes are placeholders from the customer's Earnings Codes report):
```
##GENERIC## V1.0
Company Code,Pay Frequency,Pay Period Start,Pay Period End,Employee ID,Earnings Code,Pay Hours,Dollars,Separate Check,Worked Department,Rate Code
ABC1234,W,10/05/2026,10/11/2026,123,REG,40.00,,0,,BASE
ABC1234,W,10/05/2026,10/11/2026,123,OT,6.50,,0,,BASE
ABC1234,W,10/05/2026,10/11/2026,123,REG,8.00,,0,200,RATE_2
ABC1234,W,10/05/2026,10/11/2026,123,BONUS,,150.00,0,,BASE
```
The ADP guide's own sample scenario has, for one employee, 40 regular hours plus a $2000 salary amount, 4 OT hours and
40 vacation hours. For another it has 80 regular hours plus a separate check with a $2000 bonus. In other words,
**one row per earnings code (x rate code x dept x check)**.

### 4.4 How RUN prices hours
- The rate comes from the employee's rate selected by `Rate Code`. There is no custom rate value in the CSV. (The API
  has a custom-rate path; the CSV does not.)
- OT and DT: Connecteam can export "Regular hours, Time & half, and Double Time". It **cannot** export "Overtime that is
  not a multiplier of 1.5X or 2X". This implies RUN's OT and DT earnings codes carry fixed 1.5x and 2.0x factors applied
  to the rate-code rate. `[UNVERIFIED]` in ADP's own words.
- Hours vs dollars: an earnings code is either hours-type or amount-type. A mismatch gives errors **34624/34625**. Per
  the guide, the same code must be configured the same way "in both applications". Earnings codes restricted to
  contractors or employees give 34636/34637.
- After upload RUN shows a Pay Data Approval page with "Regular Hours Payroll" vs "Regular Hours Import" columns. The
  user chooses **Combine Payroll and Import** or **Accept Import Only**, then **Approve**, which opens the Payroll
  Worksheet. A period-date mismatch (34612) is a warning, and RUN uses its own next-payroll dates.

### 4.5 Earning types RUN can carry
- **Carried:** regular, OT 1.5x and DT 2.0x hours (through hours-type codes); PTO, holiday and sick hours; flat dollars
  through amount-type codes (bonus, premiums, reimbursements if so configured); separate checks; departments; up to 5
  pre-set hourly rates per employee.
- **Not carried (fail):**
  - any rate that is not one of the employee's pre-set rates (no `Temp Rate`);
  - OT multipliers other than 1.5x or 2.0x;
  - mixing pay frequencies, or more than one company code, in a run (split into separate files or block).

### 4.6 Error codes worth surfacing in pre-flight (partner guide appendix)
35015 blank company code · 35096 more than one company code · 34608 not .csv · 34609/34610 invalid or other company
code · 34611 invalid pay frequency · 34612 period dates do not match next payroll · 34613 invalid employee identifier ·
34614 hire date after period end · 34616 no valid employees · 34617 employee frequency mismatch · 35102 employee on
leave · 35105 terminated · 34622/34623 earnings code invalid or inactive · 34624/34625 hours vs amount mismatch ·
34626 dept invalid · 34631 file format invalid · 34638/34639 hours or amount out of range · 34640 separate check
invalid · 34656/34680 rate code or rate invalid for employee.

**Confidence:** layout MEDIUM (2013 ADP draft plus agreeing 2026 integrator docs). Multiplier behaviour LOW-MEDIUM.

---

## 5. Generic mapped CSV for PEOs and factoring companies

### 5.1 What documented PEO and payroll-bureau imports look like
**Paychex Flex: Standard Payroll Import (SPI)** (HIGH for columns)
- Paychex's own spec pages (`myapps.paychex.com/pngHelp_static/helpHtml/SPI_Specification_Sheet.htm` and
  `.../Standard_Payroll_Import_Overview.htm`) appeared in search results but returned 404 on 2026-10-16. Columns
  confirmed from Deltek Costpoint's Paychex export spec:
  https://help.deltek.com/PRODUCT/COSTPOINT/8.2/GA/ldx_AOPPCXTS_Export_File_Specifications.html
- Column order:
  `Client ID, Worker ID, Org, Job Number, Pay Component, Rate, Rate Number, Hours, Units, Line Date, Amount, Check Seq Number, Override State, Override Local, Override Local Jurisdiction, Labor Assignment`
- Field rules:
  - Client ID 8, Worker ID 10.
  - Org: pipe-separated levels.
  - Pay Component: 20 chars, **case-sensitive**, or the value `[Pay]` for a standard check.
  - **Rate** 0.0001-9999.9999 **overrides the loaded rate**.
  - Rate Number 1-6 (6 = memo hours).
  - Hours -999.99 to 999.99. **Use Hours or Units, not both.**
  - Line Date `mm/dd/yyyy`.
  - **Amount must be empty if Hours is nonzero.** "Use only one of Rate, Rate #, or Amount per earning."
  - Check Seq 1-99 groups rows into checks.
- From the search snippet of the (now 404) Paychex overview: all columns must be present and in order; **a header row
  is not necessary**; the file must be .csv; "payroll checks are imported using the first 17 columns". Deltek lists 16,
  so the count is a discrepancy `[UNVERIFIED]`.
- ClickTime's Paychex article warns: do not rename or reorder headers.

**Justworks PEO: Import Hours** (official; HIGH for rules, LOW for exact header text)
- https://help.justworks.com/hc/en-us/articles/360004527771-Import-Hours
- Template downloaded in-app from the Timecards tab. Pre-filled, **do not edit** (they are the match keys): first name,
  last name, **work email**, start date and end date of each week.
- Required: those fields plus regular hours. Optional: PTO, overtime, double time.
- Weeks run **Sunday-Saturday**: one row per employee per week (two per biweekly period).
- **Multiple rates:** add another row with the same first five fields and a different rate (hourly employees only).
- Hours may be decimal (`20.5`) or `H:MM` (`25:30`), not words. Maximum **168 hours per week**.
- Re-uploading overwrites earlier data for that employee. Only available on default payroll periods.
- **"the default overtime base rate will be the highest of the regular rates. You can adjust this to the weighted
  average after importing timecards."** This is a reconciliation hazard for blended-rate OT.

**PrismHR** (the back-office platform used by many PEOs) (official help; HIGH for the concepts)
- https://tan.prismhr.com/docs/prismhr/docs/sp_help/Content/PD/Maintenance/System/Pay_Import_Definition.htm and
  https://ies.prismhr.com/docs/prismhr/docs/sp_help/Content/Task%20Sheets/PD/Standard_Pay_Imports.htm (both say "page
  has moved", but the content renders).
- Format: delimited (**Tab, Comma, Pipe**) or fixed-length. "Number of Header Lines To Skip".
- Field tokens:
  - Identifiers: `$EMPID`, `$CLOCKNO`, `$SSN` (Shiftbook must never use SSN).
  - Long shape: `$CODEPOS`/`$HOURSPOS`/`$AMOUNTPOS`.
  - Wide shape: `$CODE1..`/`$HOURS1..`/`$AMOUNT1..`.
  - Other: `$DATE`, `$DEPT`, `$DIV`, `$SHIFT`, `$LOC`, `$PROJ`, `$JOB`, `SKIP`.
- **Two shapes.**
  - **Method 1 ("mapping")**, one row per pay code: `Employee, <id>, Pay Code, Amount, Dept`. Foreign codes are
    translated to Prism codes in an Import Translation Table with a PTO type flag.
  - **Method 2 ("matching")**, one column per pay code, e.g. `<id>, REGULAR, OVERTIME, BONUS, SICK, PTO, ...`.
- "Each mapped column can only have either $AMOUNTXX or $HOURSXX, but not both" (e.g. JURY = hours, BONUS = amount).
- Options:
  - **"Rates Have Four Decimal Places"**.
  - **"Recalculate Overtime Pay Rate"**: multiplies the imported rate by the OT code's multiplier (e.g. $10 x 1.5 =
    $15). It needs the file to carry a pay rate for that OT code.
  - "Hourly Only".

**TriNet** (LOW): the Buddy Punch "TriNet Format" export requires the employee ID to match TriNet. Opening it in Excel
strips leading zeros (`001` becomes `1`), so edit in a text editor. No public column spec found:
https://docs.buddypunch.com/en/articles/6879951-trinet-payroll-integration

**Insperity** (LOW): no public import spec found. Only an exports guide (https://help.insperity.com/bps/wp-content/uploads/sites/3/2021/05/Exports-User-Guide-1.pdf)
turned up in search, which I did not read.

**Empeon** (PEO and payroll software) (official; MEDIUM)
- https://help.empeon.com/time-file-imports
- CSV only, plain numbers, **decimal hours** (8h30m = `8.5`).
- Required: employee identifier, DET (earning) code, and either hours + rate or amount.
- **One pay entry per line.** "Earning or pay codes separated by column are not supported."
- Codes match case-insensitively. A blank template is downloadable from the configuration.

**QBO Advanced Payroll (UK/AU)**: a mapped CSV importer with WFS-style columns `Category ID, Employee ID, Location ID,
Type (L/P), Units, Rate, Time in, Time out, Comments, Break start, Break end`. Useful as a column-catalogue reference
(§2.1 link).

**Staffing factoring companies** (LOW): **no public staffing-factor upload template found.**
- Novuna's factoring portal guide shows that schedules and debtor uploads are CSV with an **"Edit Upload Format"** column
  mapping configured per client: https://novuna.co.uk/media/cdxfxikz/halo-system-guide-factoring.pdf
- Xtrasoft tells users to paste report columns "into the template provided by your factoring supplier":
  https://xtrasoft.atlassian.net/wiki/spaces/XBD/pages/65667073/Debtor+-+Factoring+Open+Item+report
- So the factor defines the template. Typical invoice-schedule fields (Coupa/Riege CSV formats, inferred): debtor or
  customer, invoice number, invoice date, due date, amount, currency, PO. Staffing factors that also fund payroll
  usually want week-ending, worker, hours and bill rate (inferred, `[UNVERIFIED]`).

### 5.2 Recommended design for the "generic mapped CSV" (synthesis)
The documented systems differ along a few axes. Make each axis a setting.

**A. Shape** (PrismHR Method 1 vs Method 2; Empeon is long-only)
- **Long**: one row per worker x period (or date) x earning type x rate (x client/job/dept). This is the default.
- **Wide**: one row per worker x period (or week), with one column per earning type (Justworks, PrismHR Method 2,
  ADP's Reg/O/T columns).
- Allow "hours or amount" per earning column, never both (PrismHR, Paychex).

**B. Column catalogue** (source fields the user can place, rename and reorder; cf. Deputy's custom exporter in §7.2)
- Company / client code; Batch ID; pay period start/end; week ending; line (work) date; pay date.
- Worker external ID, with selectable key: payroll ID, file number, clock ID, work email. Worker first/last name
  (informational). **Never SSN, full or partial** (data-safety rule).
- Client / customer (bill-to), client code, job / assignment / PO, department, cost center, location, work state, work
  locality (Paychex override state/local).
- Earning code (mapped per format from Shiftbook's internal earning type); internal earning type label.
- Hours: decimal with N dp, or `H:MM`. Units.
- Pay rate (N dp; 4 is common: ADP, Paychex, PrismHR). Rate number or rate code. Amount (2 dp).
- Bill rate, bill amount (for factors). Check sequence / separate check. Memo / note.
- Static value column; blank column; concatenation; conditional column (Deputy has all four).

**C. File options**
- Delimiter: comma, tab, pipe, semicolon. Quote: minimal or always.
- Header row on/off, plus custom header labels. **Prefix rows**, e.g. RUN's `##GENERIC## V1.0`, and footer rows.
- Line endings: CRLF (default for ADP and IIF) or LF.
- Encoding: ASCII-strict, Windows-1252, UTF-8, or UTF-8 with BOM.
- Date format tokens. Decimal places per numeric column.
- Negative style (`-x`, `x-`).
- **Zero handling**: blank vs `0`. ADP says blank.
- Leading-zero preservation for IDs, as text (TriNet pitfall).
- File-name template with tokens (company code, period dates, batch id), e.g. ADP `PR{co}EPI.csv`.

**D. Capability declaration** (SPEC §13): each saved mapping declares which internal earning types it can carry and
how:

| Capability | Values |
|---|---|
| Hours | hours column / earning-code row |
| Dollars | amount column / earning-code row / not supported |
| Per-row rate | yes / rate code only / no |
| Negatives | yes / no |
| Multiple rows per worker | yes / no |

An export **fails** when the run contains a type, rate, sign or row multiplicity the mapping does not declare.

**E. Pricing declaration (for reconciliation):** for each earning code, say who computes dollars:
- "target multiplies hours by its stored rate x factor F" (declare F);
- "target uses the rate in this file";
- "target uses the amount in this file".

Shiftbook then computes the **expected target gross** and compares it with its own gross per worker, showing the
difference before download (§6).

---

## 6. Reconciliation: who computes gross, and how to make the two match

| System | Rate used for hours | OT / DT factor | Can Shiftbook force exact dollars? | Practical rule |
|---|---|---|---|---|
| QuickBooks Desktop (IIF) | Rate on the employee's payroll item (Payroll Info) | The OT/DT item's own rate setting. Deputy: items "multiply based on their straight time rate". Intuit community guide: create an "Overtime Pay" wage item and pick the OT rate (MEDIUM) | **No** (no amounts in TIMEACT; paychecks cannot be imported by IIF) | Allow only when every line is (hours x item rate) that QuickBooks will reproduce. Otherwise fail, or warn with the computed difference |
| QBO Payroll | Employee pay types. Intuit staff (Jan 2026): OT 1.5x "must be manually calculated and updated", and the question implies OT follows the employee's **highest** rate (https://quickbooks.intuit.com/community/employees-and-payroll-2/adding-an-additional-1-5x-pay-6747) | 1.5x / 2.0x pay types only (QuickBooks Time mapping) | No (file route) | Regular hours only via importer CSV |
| ADP WFN | `Temp Rate` on the row, else the employee rate / `Rate Code` | Company / code setup; not documented in the guide | **Yes** (`Reg Earnings`, `O/T Earnings`, `Earnings 3/4/5` dollars) | Best for exact reconciliation. Send hours, plus a dollar code for any premium or true-up |
| ADP RUN | Rate selected by `Rate Code` (BASE, RATE_2..5) | 1.5x and 2x earnings codes (inferred) | Yes, through amount-type earnings codes (`Dollars`) | Hours for REG/OT/DT at stored rates; dollars for everything else |
| Paychex Flex SPI | `Rate` in the row overrides the loaded rate | `[UNVERIFIED]` whether the pay component's factor applies on top | Yes (`Amount`) | Rate per row, or amount |
| Justworks | Rate per row (multiple rows) | OT base = **highest regular rate** by default | Not in Import Hours (`[UNVERIFIED]` other routes) | Warn when multi-rate OT is present |
| PrismHR | File rate | Optional "Recalculate Overtime Pay Rate" = rate x code multiplier | Yes (`$AMOUNT` columns) | Declare whether recalc is on |

FLSA note for the reviewer (not researched here): under the federal rule, a worker paid two or more rates in a
workweek is owed OT at the weighted-average regular rate. Several targets default to a single rate instead (Justworks:
highest rate; QBO: a fixed OT pay-type rate). That is why Shiftbook needs the per-format "expected target gross" check.

---

## 7. Pattern research: the "export / download payroll file" screen with a format chooser and code mapping

This section describes structure and interactions only. Do not copy product names, labels, icons, colours or wording
into Shiftbook.

### 7.1 Deputy: timesheet export flow (best documented)
Sources:
- https://help.deputy.com/hc/en-au/articles/13116516297487-Introduction-to-the-new-Timesheet-Export-experience-Beta
- https://help.deputy.com/hc/en-au/articles/4689871462159-Exporting-timesheets-from-Deputy
- https://help.deputy.com/hc/en-au/articles/4694235841295-Exporting-to-ADP-Run-US
- https://help.deputy.com/hc/en-au/articles/4694853299087-Exporting-to-Intuit-QuickBooks-Desktop-US

Hierarchy:
1. **Entry point:** an Export button at the top-right of the timesheet-approval screen. There is also a bulk-action
   "export selected" on chosen rows, for troubleshooting a few records.
2. **Step 1, scope:**
   - Period selector: a pay calendar plus pay run, **or** a custom From/To range, with a note that most payroll systems
     need the exact pay-run dates.
   - Location (or pay centre) multi-select.
   - Team-member multi-select with "select all" and Apply.
   - A **summary panel on the right**.
   - A checkbox to mark exported timesheets as paid.
   - **Next.**
3. **Step 2, destination:**
   - A **dropdown of formats**. Connected integrations appear pre-selected or shown first. A long list of file formats
     includes "QuickBooks Desktop IIF", "ADP Run - File Download", "ADP Workforce Now - File Download", CSV variants, a
     programmable format, and the user's **custom templates tagged "(custom)"**.
   - Below the dropdown, a link to create a custom export when the payroll is missing.
   - **Per-format inline fields** appear after a format is chosen. Examples:
     - QBD IIF: three text boxes for the straight-time / 1.5x / 2.0x payroll item names, then a list of overtime-rule
       checkboxes, then an optional file name.
     - ADP RUN: an earnings-code dropdown per pay category (ordinary, OT, DT, sick, vacation, allowances), and
       optionally OT bucket checkboxes (over 8/10/12 per day, over 40 per week, Sunday, holiday).
   - **Export** downloads the file.
4. **Export codes (code mapping):**
   - A "View pay rates" action opens the list of pay rates in the selection, each with its **export code**.
   - Inline Edit, Save, Done.
   - A note says to re-check codes on every export because the people and rates differ.
   - Codes can also be set at the pay-rule level.
5. **Status after export:** per-timesheet icons for exported / not exported and paid / not paid.
6. **Errors** (help text): mismatched payroll ID, name or email; missing pay rate; dates not matching the pay period;
   code-length limits for the destination.

### 7.2 Deputy: custom payroll export template builder (model for the "generic mapped CSV")
Source: https://help.deputy.com/hc/en-au/articles/4767874654223-Custom-payroll-export

Hierarchy:
- Reached from the destination step ("can't find your payroll?" link). It opens a full-page editor.
- **Template name** at the top. Saved templates then appear in the format dropdown for **all managers**.
- **Left: "included columns" list.** Default columns are pre-filled. Each column can be:
  - removed (expand, then Remove);
  - **drag-reordered**;
  - expanded to set the **header label** (defaults to the internal name; user can rename) and the **format** (text
    case or strip spaces; decimal places for numbers; date and time format).
- **Right: data-field picker** in grouped, expandable lists with **search**, plus a "show advanced fields" checkbox for
  the full catalogue. A "+" adds a field to the left list. The same field may be added twice.
- **Custom column types:**
  - blank;
  - **static value**;
  - **multiple sources concatenated**, with chosen format and separator;
  - **conditional**, filled by rules on other fields.
- **Custom rows:**
  - placed **before the header**, **after the header**, or as a **footer**;
  - each cell is static, or **prompted at export time**;
  - drag-reorder.
- **Format Settings** (a top-right button opening a panel):
  - file type `.csv`/`.txt`/`.dat`;
  - fixed width (txt/dat only; forces delimiter = none);
  - encapsulation (double quotes);
  - export all pay rates;
  - disable column headers;
  - delimiter: comma, semicolon, pipe, caret, space, tab, none, other (csv is forced to comma);
  - **group data** (aggregate matching rows);
  - evenly split breaks;
  - Apply.
- **Template management:** Edit, Save, **Delete template**, overflow menu → **Make a copy** ("(copy)" suffix) and
  **Make template blank**.
- **Documented failure modes to design out:**
  - a field containing commas makes the export fail;
  - an expected field that is empty for some rows makes the export fail;
  - "might report success ... but no file will be downloaded".
  - **Shiftbook should validate these before download and never fail silently.**

### 7.3 7shifts: per-format integration settings with tabs plus a mapping page
Sources:
- https://kb.7shifts.com/hc/en-us/articles/4417520074387-ADP-Workforce-Now-US-Payroll-Export
- https://kb.7shifts.com/hc/en-us/articles/4417514104595-How-to-map-roles-and-employees
- https://kb.7shifts.com/hc/en-us/articles/4417514163859-QuickBooks-Online-Payroll-Integration

Hierarchy:
- **Integrations directory:** search, select the target, enter the required company identifier (one company code per
  account), finish setup.
- **That integration's Settings page, with tabs:**
  1. **Custom export codes tab** (company-level):
     - batch number;
     - an earning code per category (holiday, tips, PTO, sick PTO, unpaid);
     - **when a code is blank, the documented fallback is stated per field** (e.g. holiday hours go out as regular
       hours; PTO uses default labels);
     - Save.
  2. **Payroll mapping tab:**
     - toggles: "split hours by role" (with its side effect stated: PTO stops exporting) and "export wages" (with a
       dependency rule stated);
     - "Edit employee IDs" opens per-employee ID entry;
     - a roles tab for department codes per role, where blank falls back to the default rate in the target.
- **Shared mapping page:**
  - **Employees | Roles** tabs; a search box; a **progress/status bar**.
  - Each row has a status: **Matched / Unmatched / Ignored**. Auto-match happens on identical names.
  - Per row: **Match** (dropdown of target records), **Ignore**, **Unmatch**, and **Unignore** (from an Ignored
    accordion → overflow menu).
  - An "integration warnings" tab on the time-clocking page lists mapping gaps.
- **Export flow:**
  - select pay period;
  - approve punches (bulk "approve all");
  - **Close timesheet** (admin only; required before export);
  - Export menu → choose the target → CSV downloads.
  - Per-format help states the required file-name pattern and the upload path in the target.

### 7.4 QuickBooks Time: Payroll Item Mapping Tool (per-employee x hour-type grid)
Source: https://quickbooks.intuit.com/learn-support/en-us/help-articles/map-quickbooks-payroll-items/00/380722

Hierarchy:
- Reached from Preferences.
- Admin-only. Prerequisites are listed (payroll items exist in the payroll product; OT set up).
- **Three mapping modes:**
  1. by employee (default);
  2. by customer / service item / class (overrides);
  3. employee chooses on the timesheet.
- **Mode 1 screen ("map employees"):**
  - select an employee;
  - **one dropdown per hour-type column** (regular, overtime, time off);
  - **autosave** on change.
- **Overrides:**
  - turned on through a settings gear ("allow overrides by" customer, service item or class), then Save;
  - each dimension has its own tab with "+ Add override", choose one entity, expand it, then a payroll item per
    hour-type column;
  - unassigned items fall back to the employee default.
- **Advanced OT rules:** "Manage" beside each rule. Unassigned rates are listed and each gets a target pay item from a
  dropdown. Only 1.5x and 2.0x rules can map to the target's OT and double-OT types.

### 7.5 Workyard: just-in-time mapping inside the export
Source: https://help.workyard.com/en/articles/15467712-how-to-map-pay-types-for-quickbooks-online-payroll-exports

- When an export starts, a **"map payroll items" step appears only for employees in this export whose pay types are not
  yet mapped**.
- Each unmapped internal type (Regular / OT / DT) gets a dropdown of the target's pay types.
- The export **cannot proceed until all are mapped**.
- If the chosen target type is not assigned to that worker in the target system, the mapping does not save. The time
  then exports without a pay type; the user fixes it in the target and re-runs.

### 7.6 ClickTime: hard pre-conditions, batch ID default, duplicate-export guard
Sources:
- https://support.clicktime.com/hc/en-us/articles/41018977335565-Export-Payroll-Data-to-ADP
- Paychex variant: https://support.clicktime.com/hc/en-us/articles/41026339270797-Export-Payroll-Data-to-Paychex

- The criteria page has: date range or period; people; **status filter** (approved / locked only); **Batch ID
  auto-filled from the run date (YYMMDD) and editable**.
- **Duplicate guard:** "mark exported entries as <label>" and "don't include entries already marked as <label>".
- **Export refuses to run** when the company code is missing, any leave type lacks a code, or any included person lacks
  an ID. This is the documented precedent for SPEC §13's "fail if the run has a type it cannot carry".

### 7.7 Synthesised hierarchy for Shiftbook's pattern file (structure only)
1. **Run header:** pay period / payroll run, status, totals (worker count, hours, gross). This is the context the export
   belongs to (Deputy summary panel; ClickTime criteria).
2. **Export panel / sheet** opened from a primary "Export" action on the approved run:
   1. **Format chooser:** a searchable list or dropdown grouped by connected and recent, built-in formats, and custom
      mappings. Each option shows a small capability hint (hours / dollars / per-row rate). There is a link to create a
      new custom mapping (Deputy).
   2. **Per-format required settings** inline: company code, batch ID (auto-filled, editable), QuickBooks version
      variant, file-name preview (ADP and IIF naming).
   3. **Pre-flight checklist** (blocking items first):
      - unmapped workers (ID/name), with "Map now";
      - unmapped earning types, with "Map now";
      - earning types the format cannot carry, which **block**, with the reason and the alternatives;
      - rate or limit violations (IIF 23:59, ADP 999.9999 / 4 codes, RUN one frequency);
      - **expected target gross vs Shiftbook gross**, per worker and in total;
      - re-export warning if already exported.
      (Synthesised from ClickTime's hard fails, Workyard's just-in-time mapping and 7shifts' warnings tab.)
   4. **Download** (primary). Also mark-as-exported or labelled (ClickTime, Deputy).
3. **Mapping settings per format** (separate page, also reachable from pre-flight "Map now"):
   - tab **Earning codes**: one row per internal earning type, the target code input or dropdown, an hours/dollars
     selector, the declared factor, and the **stated fallback when blank** (7shifts);
   - tab **Workers**: Matched / Unmatched / Ignored filter, search, progress bar, Match / Ignore / Unmatch per row,
     auto-match on identical keys (7shifts);
   - optional tab **Departments / clients / cost centers** (7shifts roles; QuickBooks Time overrides);
   - autosave or explicit save, with a "saved" state (QuickBooks Time autosaves; 7shifts saves explicitly).
4. **Custom mapped-CSV editor** (Deputy model): name; included-columns list (drag, rename header, per-column format);
   field picker (search, grouped, advanced toggle); custom columns (static, blank, concat, conditional); custom
   prefix/footer rows; Format settings panel (delimiter, quoting, header on/off, line endings, encoding, fixed width,
   group rows); duplicate, reset, delete.
5. **History:** past exports for the run, with format, who, when, file hash or name, re-download, and a "marked
   exported" state.

States to handle: no approved data; nothing mapped yet (first-run empty state that leads into mapping); partial mapping;
blocked by an unsupported type; target-gross mismatch (warn vs block per the owner's rule); success with a download
link; repeat export.

Keyboard: Deputy, 7shifts, QuickBooks Time and Workyard document no shortcuts. Shiftbook's "keyboard-friendly" bar must
come from shadcn/ui defaults (combobox type-ahead, Enter to confirm), not from these references.

---

## 8. Open questions and unverified items (for the owner or follow-up)
1. **IIF on QuickBooks Desktop 2022+:** does a TIMEACT-only file (TIMERHDR removed) import cleanly with PITEM and
   XFERTOPAYROLL? Only one vendor workaround documents it. A real QuickBooks Desktop test file is needed.
2. **IIF date format** under the 2019+ importer (MM/DD/YY per Intuit, vs locale).
3. **QuickBooks Time Manual Time Import** exact columns are only inside the app. The owner would need to download the
   sample CSV from a QuickBooks Time account.
4. **ADP WFN:** what factor ADP applies to `O/T Hours` and to Hours 3/4 codes, and whether it applies on top of
   `Temp Rate`. This depends on company setup; ask the customer's ADP rep or check Validation Tables.
5. **ADP RUN:** whether row-2 headings are validated by text, and the exact current template text. Get the template
   from the customer's RUN Support Center.
6. **Paychex SPI:** official spec pages are now 404. Check whether there are 16 or 17 columns, and whether a header row
   is allowed or required.
7. TriNet and Insperity have no public import specs. The customer's PEO must supply its template, which is the reason
   to build the generic mapped CSV.
8. Factoring companies publish no templates. Assume each factor provides one and configure it through the mapped-CSV
   editor.
9. The ADP WFN guide (v13, 2017) is old. A newer revision may exist behind ADP's login. The 2026 integrator docs
   (7shifts, ClickTime, Time Portal) match it on naming and headers.

---

## 9. Source index (all accessed 2026-10-16)
Intuit / QuickBooks:
- https://quickbooks.intuit.com/learn-support/en-us/help-articles/iif-overview-import-kit-sample-files-and-headers/00/262115
- https://quickbooks.intuit.com/learn-support/en-us/data-utilities/improved-iif-import-in-quickbooks-2019-and-later/00/203267
- https://quickbooks.intuit.com/learn-support/en-us/employees-and-payroll/quickbooks-pro-timer-for-qbdt-2022/01/967256/highlight/true
- https://github.com/omniboost/go-quickbooks-desktop-iif/tree/master/IIF%20Import%20Kit (mirror of Intuit IIF Import Kit)
- https://quickbooks.intuit.com/learn-support/en-us/help-article/time-tracking/export-import-time-data-quickbooks-time/L1f77o0jJ_US_en_US
- https://quickbooks.intuit.com/learn-support/en-uk/help-article/time-tracking/troubleshoot-csv-import-errors-quickbooks-time/L6VhqGxkF_GB_en_GB
- https://quickbooks.intuit.com/learn-support/en-uk/help-article/time-tracking/importing-timesheets-quickbooks-online-advanced/L5RR0QwSw_GB_en_GB
- https://quickbooks.intuit.com/learn-support/en-us/help-articles/map-quickbooks-payroll-items/00/380722
- https://quickbooks.intuit.com/learn-support/en-us/help-article/feature-preferences/configure-change-advanced-overtime-settings-time/L7vozE5kS_US_en_US
- https://quickbooks.intuit.com/community/employees-and-payroll-2/import-csv-time-sheets-into-quickbooks-online-12450
- https://quickbooks.intuit.com/community/employees-and-payroll-2/adding-an-additional-1-5x-pay-6747
- https://quickbooks.intuit.com/learn-support/en-ca/help-article/import-export-files/common-questions-importing-data-quickbooks-online/L4OYJRFdj_CA_en_CA

ADP:
- https://support.timeportal.io/hc/en-us/articles/23838801956887-ADP-Workforce-Now-Payroll-Export (hosts ADP "Importing Paydata" v13 PDF)
- https://apps.adp.com/en-US/apps/372723/automated-paydata-integration-for-adp-workforce-now/features
- https://silo.tips/download/time-sheet-import-and-run-powered-by-adp-payroll-for-partners (ADP RUN partner guide, 2013)
- https://marketplace-cdn.adp.com/dev-portal/pdf/protected/Payroll_Data_Input_API_Guide_for_RUN_Powered_by_ADP_chapter_3

Integrators (secondary):
- https://kb.7shifts.com/hc/en-us/articles/4417520074387-ADP-Workforce-Now-US-Payroll-Export
- https://support.clicktime.com/hc/en-us/articles/41018977335565-Export-Payroll-Data-to-ADP
- https://sundialtimesystems.freshdesk.com/support/solutions/articles/1000241796-realtime-adp-export
- https://help.worksana.com/en/articles/11889709-adp-workforce-now-export
- https://compt.helpscoutdocs.com/article/119-how-to-manually-upload-a-compt-payroll-report-to-adp-workforce-now
- https://kb.lathem.com/hc/en-us/articles/360000929453-How-to-Integrate-with-and-Export-to-ADP-RUN
- https://help.connecteam.com/en/articles/8607186-exporting-to-adp-run
- https://redcort.com/files/pdfs/payroll-guides/ADP-Run-Payroll-Integration-Guide.pdf
- https://www.redcort.com/timeclock/support/blog/quickbooks-2022-payroll-integration-update
- https://timesheet.nepinc.com/timesheet/help/system_system_qbiif.html
- https://support.timesheets.com/knowledge-base/quickbooks-desktop-iif-export/
- https://support.timesheets.com/?p=4014
- https://www.timeclockmts.com/online-help/quickbooks-integration.htm
- https://tprosupport.rightworks.com/kb/article/439-import-time-activities-into-quickbooks-online/
- https://www.saasant.com/blog/import-time-activity-quickbooks-online/
- https://help.workyard.com/en/articles/15467712-how-to-map-pay-types-for-quickbooks-online-payroll-exports
- https://kb.7shifts.com/hc/en-us/articles/36489913416979-Why-are-Overtime-hours-exporting-as-Regular-Hours-through-Quickbooks

PEO / payroll bureaus:
- https://help.deltek.com/PRODUCT/COSTPOINT/8.2/GA/ldx_AOPPCXTS_Export_File_Specifications.html (Paychex SPI columns)
- https://help.justworks.com/hc/en-us/articles/360004527771-Import-Hours
- https://tan.prismhr.com/docs/prismhr/docs/sp_help/Content/PD/Maintenance/System/Pay_Import_Definition.htm
- https://ies.prismhr.com/docs/prismhr/docs/sp_help/Content/Task%20Sheets/PD/Standard_Pay_Imports.htm
- https://help.empeon.com/time-file-imports
- https://docs.buddypunch.com/en/articles/6879951-trinet-payroll-integration
- https://novuna.co.uk/media/cdxfxikz/halo-system-guide-factoring.pdf

Pattern references:
- https://help.deputy.com/hc/en-au/articles/13116516297487-Introduction-to-the-new-Timesheet-Export-experience-Beta
- https://help.deputy.com/hc/en-au/articles/4689871462159-Exporting-timesheets-from-Deputy
- https://help.deputy.com/hc/en-au/articles/4767874654223-Custom-payroll-export
- https://help.deputy.com/hc/en-au/articles/4694235841295-Exporting-to-ADP-Run-US
- https://help.deputy.com/hc/en-au/articles/4694853299087-Exporting-to-Intuit-QuickBooks-Desktop-US
- https://kb.7shifts.com/hc/en-us/articles/4417514104595-How-to-map-roles-and-employees
- https://kb.7shifts.com/hc/en-us/articles/4417514163859-QuickBooks-Online-Payroll-Integration
- https://quickbooks.intuit.com/learn-support/en-us/help-articles/map-quickbooks-payroll-items/00/380722
- https://help.workyard.com/en/articles/15467712-how-to-map-pay-types-for-quickbooks-online-payroll-exports
- https://support.clicktime.com/hc/en-us/articles/41018977335565-Export-Payroll-Data-to-ADP
- https://help.wheniwork.com/articles/adp-run-integration/ (connector, not a file export; little screen detail)
- Homebase provider pages, e.g. https://www.joinhomebase.com/integrations/paychex (flow: Settings > Payroll > provider >
  Connect; Timesheets > set dates > Download > choose provider file); no mapping detail found.

Tooling note: Firecrawl ran out of credits partway through. Pages were read with WebFetch, curl, and Zendesk Help
Center JSON endpoints (`/api/v2/help_center/.../articles/<id>.json`) for help centres that blocked plain fetches
(7shifts, ClickTime, Time Portal, Deputy, Lathem, Justworks). Downloads are in the scratchpad under `rf-dl/`.
