# Research H: AR and cash application references (SPEC §14)

Prepared 2026-10-16 for the "AR and cash application" slice. Scope: aging, record payment, bank CSV import and matching, reminders, days-to-pay, short pays, plus staffing-specific practice (factoring, remittance, lockbox).

## How to read this

- **Source quality.** Each reference has a confidence rating:
  - **High**: I fetched and read the official page today.
  - **Medium**: the official page exists, but I only saw its indexed snippet or a secondary write-up.
  - **Low**: third-party pages only.
- **Xero caveat.** Xero Central (central.xero.com) is a JavaScript-rendered site, and our fetch tools got an empty page. Everything about Xero below comes from search-index snippets of the Xero Central articles or from accountants' guides, so it is all Medium. Before Xero is used as a pattern `Source URL:`, a human should open the page in a browser and confirm it.
- **Quoting.** Quotes are short phrases only. We copy hierarchy and interactions, never wording, names, icons or colors (CLAUDE.md Design rules).
- **Demo data.** Where a source's example uses a business name, I left it out. No personal data is included.

---

## 0. Summary of what we recommend

| Shiftbook screen | Primary pattern (copy hierarchy + interactions) | Use only for a specific part |
|---|---|---|
| AR aging (`/receivables`) | **FreshBooks: Accounts Aging report** (updated version) | QuickBooks Online A/R Aging Summary/Detail: bucket set and summary-vs-detail split. TempWorks Invoice Aging: staffing filters (branch, weekend-bill date, parent/child invoice). |
| Record payment (dialog/page) | **QuickBooks Online: Receive payment** | TempWorks lump-sum check (Ctrl+L, applied in the order invoices are selected, short pay shown in red). TempWorks Quick Pay (invoice # → check # → amount, Tab between fields). Business Central Register Customer Payments (lump sum for one customer and date). |
| Payments list (`/payments`) | **QuickBooks Online: Sales transactions list** (money bar, status list, row action) | Zoho Books Payments Received ("Amount" vs "Unused Amount" for overpayments). Stripe payment application (apply/unapply, find unapplied payments). |
| Bank import (`/bank/import`) | **QuickBooks Online: Upload from file** (upload → choose account → map columns → review/select rows → done) | Zoho Books Import Statement: the three amount layouts, auto-selected mapping, "Save these selections". Business Central data exchange: header-line count and date format per bank. |
| Bank match (`/bank` "For review") | **QuickBooks Online: Bank transactions "For review"** (suggested match → review → Post; Find other match; Posted tab with Undo) | Matching logic: Stripe's documented reconciliation order. Confidence levels and the Difference/review queue: Business Central Payment Reconciliation Journal. Multi-select until totals are equal: Zoho Books Possible Matches. Xero two-column layout with OK: secondary, unverified. |
| Client page AR section | **FreshBooks: client profile Overview** (outstanding graph with overdue vs not-yet-due, credit available, tabs, statement) | Xero contact "average days to pay" metric. |
| Reminders (copy / mailto) | **QuickBooks Online: Send reminder (manual)** from the invoice list, using an editable template with variables | FreshBooks dynamic-field list and "::" insert shortcut. Cadence and tone: FreshBooks Hub guidance. Xero "don't send under amount" threshold. |
| Short-pay tracking | **TempWorks: Short Pay Invoices report + Write-off with reason code** (staffing-native) | Business Central Payment Tolerance warning (default is to leave the balance open). QuickBooks Online bad-debt write-off by credit memo. |

---

## 1. AR aging report

### 1a. FreshBooks: Accounts Aging report (updated)

- **Product:** FreshBooks
- **Source:** https://support.freshbooks.com/hc/en-us/articles/219118308-What-is-an-Accounts-Aging-report
  - Related: https://www.freshbooks.com/api/account-aging-report (API: totals per interval, per-client accounts, CSV download token)
  - Related: https://support.freshbooks.com/hc/en-us/articles/42491377615373-Changes-and-updates-in-2026 (the 2026 changelog, per its search-index snippet, says the report now runs on any "As of" date with a more detailed drill-down; not opened)
- **Hierarchy, top to bottom:**
  1. Title, with **More Actions** and **Send To…** at the top right.
  2. Quick Filters: **Outstanding** / **Overdue**.
  3. Filter panel: Date Range (Today, This Month … All Time, Custom), Group By (Outstanding or Overdue), Currency (one at a time).
  4. Table: one row per client; bucket columns **0-30, 31-60, 61-90, 90+ Days**; totals.
- **Interactions:**
  - Clicking a **client** opens the client profile.
  - Clicking a **total** lists the invoices behind that amount.
  - Clicking an **invoice** in that list opens it.
  - More Actions: "Export for Excel" (CSV), "Print or Save PDF". Send To emails the report.
- **Buckets:** "Outstanding" ages from the issue date and "Overdue" ages from the due date. There is no separate "Current" column; the API's buckets are overdue-only (`0-30`, `31-60`, `61-90`, `91+`).
- **States:** No empty state is documented. The troubleshooting note is useful: a bucket shows an amount but its list is blank when an invoice has a **future-dated payment**. We should handle that case explicitly, for example by excluding or flagging future-dated payments.
- **Confidence:** High for hierarchy and drill-down; Medium for the 2026 "As of" change, which comes from the changelog's search snippet only.

### 1b. QuickBooks Online: A/R Aging Summary and A/R Aging Detail

- **Source:** https://quickbooks.intuit.com/learn-support/en-us/help-article/accounts-receivable-reports/run-accounts-receivable-aging-report/L4N7PC2hg_US_en_US
  - UK version, which lists the options in more detail: https://quickbooks.intuit.com/learn-support/en-uk/help-article/accounts-receivable-reports/run-accounts-receivable-ageing-report/L4N7PC2hg_GB_en_GB
  - Community thread on bucket customization: https://quickbooks.intuit.com/learn-support/en-us/reports-and-accounting/a-r-aging-summary-report/00/940838
- **Hierarchy:** Reports → Standard reports → **"Who owes you"** section. The Summary shows total outstanding by customer and how long it is past due. The Detail lists each transaction and how long it has been overdue.
- **Customize:** Report period; show non-zero/active rows only; **aging method** ("Current" or "Report date"); **Days per aging period**; **Number of periods**; header/footer; "Save as" to keep settings.
- **Drill-down:** Click an amount to see the transactions behind it. This comes from community and moderator answers, not the help article itself.
- **Buckets:** The default columns are commonly cited as Current, 1–30, 31–60, 61–90 and "91 and over". I could not confirm the exact labels from an official page.
- **Known limits (community):**
  - The Current column of the Detail report cannot be customized.
  - The Detail report cannot be grouped by customer.
- **Confidence:** High for navigation and options; Medium for drill-down and labels.

### 1c. Xero: Aged Receivables Summary / Detail (US name: Accounts Receivable Aging Summary / Detail)

- **Sources (official, but could not be fetched):**
  - https://central.xero.com/0/article/Aged-Receivables-Summary-report-New
  - https://central.xero.com/0/article/Aged-Receivables-Detail-report-New?userregion=true
- **What the snippets and accountants' guides say:**
  - The Summary shows "outstanding totals by customer and how long they've been outstanding".
  - The Detail shows individual invoices, credit notes and overpayments.
  - Settings: **Ageing Periods** (how many periods, and how long each is) and **Ageing By** (Due Date or Invoice Date).
  - Extra columns can be added (for example email). Related reports sit in a left-hand panel.
  - Default bands are reported as Current, 1–30, 31–60, 61–90, over 90.
- **Confidence:** Medium. It is a good secondary reference, but not usable as a primary pattern until a human verifies it.

### 1d. TempWorks Enterprise: Invoice Aging Report (staffing back office)

- **Source:** https://kb.tempworks.com/help/invoice-aging-report
- **Parameters:**
  - **Branch** (multi-select).
  - **Show**: the invoice the payment was entered on, or the **parent invoice** it was merged into. This matters for our split and supplemental invoices, because the client may remit against a different number.
  - **Group By**: Branch / Customer / Department / Invoice Date / Due Date / none.
  - **Sort By**: Invoice Date / Number / Amount / Due Date / Amount Paid / Balance.
  - **Period End Date**: the as-of date, which lets you "go back in time".
  - **Date Filter**: Invoice Date / Due Date / **Weekend Bill Date**.
  - **Customer Filter**.
- **Buckets:** The defaults are 30/60/90/90+, and "0-30 is any invoice that is 0-30 days out from the due date".
- **Confidence:** High. It is a parameterized report rather than an interactive screen, so use it for staffing-specific filters only.

### 1e. Microsoft Dynamics 365 Business Central: Aged Accounts Receivable (Excel, report 4402)

- **Source:** https://learn.microsoft.com/en-us/dynamics365/business-central/reports/report-4402
- **What it shows:** "Aged as of" and "Period length" parameters. The API equivalent uses `periodLengthFilter`, for example "30D".
- **Confidence:** Medium. I saw the search snippet only. It is a spreadsheet report, not a screen to copy.

### Takeaways for aging

1. The SPEC bucket set (current, 1–30, 31–60, 61–90, 90+) matches the QuickBooks Online and Xero defaults.
2. Age by **due date**, so that "current" means not yet due.
3. **Decision for the planner:** SPEC's "61–90" and "90+" overlap at day 90. QuickBooks Online and Xero use "over 90" (91 and over).
4. Make every amount clickable down to its invoices (FreshBooks pattern).
5. Support an as-of date (QuickBooks Online "Report date", TempWorks "Period End Date", FreshBooks 2026 change).
6. Credit notes and unapplied payments must appear (Xero Detail includes credit notes and overpayments). Otherwise the client totals won't tie out.

---

## 2. Recording a payment (partial, overpayment, one payment across many invoices)

### 2a. QuickBooks Online: Receive payment (primary)

- **Source:** https://quickbooks.intuit.com/learn-support/en-us/help-article/invoicing/record-invoice-payments-quickbooks-online/L4ZadDW7F_US_en_US
- **Hierarchy, top to bottom:**
  1. **Customer** (with "+ Add new").
  2. Payment method.
  3. Deposit to.
  4. **Amount received**.
  5. **Outstanding Transactions** table with a checkbox per invoice and a **PAYMENT** column.
  6. Footer: **Amount to Apply** and **Amount to Credit**.
  7. **Record and close**.
- **Fields the article doesn't list:** payment date and reference number. The article's video mentions recording the check number; other QuickBooks Online pages show a Reference no. field.
- **Interactions:**
  - Ticking one invoice fills its PAYMENT cell with the amount received.
  - Ticking several fills each with its open balance. You then edit the PAYMENT cells so their total matches the amount received.
  - A partial payment leaves the remaining balance on the invoice.
  - Any amount left over shows as **Amount to Credit**, which is applied later.
- **Bad-debt flow:** Credits (for example a credit memo) appear in a Credits section of the same dialog: https://quickbooks.intuit.com/learn-support/en-us/help-article/customer-refunds-credits/write-bad-debt-quickbooks-online/L88pSKtr9_US_en_US
- **Keyboard:** Ctrl+Alt+R opens Receive payment (community-listed). Ctrl+Alt+? shows the shortcut guide: https://quickbooks.intuit.com/learn-support/en-us/help-article/intuit-subscriptions/new-quickbooks-online/L66q5XLC5_US_en_US
- **Mobile note (official search snippet):** The app applies a payment amount "first to the oldest open invoice". This is a useful default for auto-allocation.
- **Confidence:** High for flow and fields; Medium for shortcuts.

### 2b. TempWorks Enterprise: invoice payments wizard (staffing-native, keyboard-heavy)

- **Sources:**
  - Overview: https://kb.tempworks.com/help/invoice-payments-overview
  - Lump sum: https://kb.tempworks.com/help/how-to-pay-invoices-with-a-lump-sum-check
  - Quick Pay: https://kb.tempworks.com/help/how-to-quick-pay-invoices
  - Overpayment: https://kb.tempworks.com/help/how-to-apply-overpayment-to-invoices
- **Hierarchy:** A wizard of **session → enter payments → post payments**.
  1. Start a session: pick the Payment Date and Bank Account for the batch.
  2. Enter payments has two tabs:
     - **Find Invoices**: search by customer, invoice #, and status (unpaid, partially paid, overpaid).
     - **Quick Pay**: invoice # + check # + amount → Pay.
  3. Rows have **Action**, **Reason**, **Check #** and **Pay Amount** columns.
  4. A toolbar holds Save, Pay with Lump Sum Check, **Pay in Full**, Upload Lockbox Feed, New Line Item, and Remove Payment.
  5. Next → **Post Payments** closes the batch, prints a batch report, and leaves posted sessions viewable later.
- **Interactions:**
  - **Lump sum:** Ctrl-click invoices, then Ctrl+L. Enter the check # and check amount, and the amount is distributed **in the order the invoices were selected**. "Short pay amounts highlighted in red", so the last invoice selected is the one that gets short-paid.
  - **Quick Pay:** Tab moves between fields; the payment summary table updates as you go.
  - **Save:** Ctrl+S.
  - **Undo a misapplied payment:** enter "a negative payment of the same amount", then apply it correctly.
  - **Overpayment:** zero the overpaid invoice with a negative amount using reason **OP**, then apply the amount as a positive on another invoice. The net batch total stays 0. A "zero dollar invoice" can hold the overpayment for later; this is a workaround we should not copy.
- **Confidence:** High.

### 2c. Business Central: Register Customer Payments

- **Source:** https://learn.microsoft.com/en-us/dynamics365/business-central/receivables-how-reconcile-customer-payments-list-unpaid-sales-documents
- **Hierarchy:** A list of every posted document that is open for payment. Each line has **Payment Made** (checkbox), **Date Received**, **Amount Received** and **Remaining Amount**.
- **Actions:** Post Payments; **Post As Lump Payment** (same customer and same date only); Search Documents (by doc no. and/or amount ± **Amount Tolerance %**); General Journal (for a payment with no document).
- **Rules:**
  - A partial payment is a lower amount, and "The document remains open".
  - With an overpayment, "The extra amount is credited to the customer".
- **Confidence:** High.

### 2d. Overpayment and unapplied-cash references

- **Xero** (Medium; official pages, snippet only):
  - Invoices can take "as many partial payments as you need": https://central.xero.com/0/article/Record-a-payment-on-an-invoice-US
  - Overpayments are recorded as their own transaction and allocated to later invoices: https://central.xero.com/0/article/Record-an-overpayment
  - Credit-note scenarios: https://central.xero.com/s/article/Common-scenarios-for-credit-notes-US
- **Zoho Books** (High):
  - The payment form totals show "Amount Received", "Amount used for payments" and "Amount in excess". Saved payments show "Amount" vs "Unused Amount".
  - https://www.zoho.com/us/books/help/payments-received/basic-functions.html
- **Stripe** (High):
  - Payments can be applied to and **unapplied** from invoices. Unapplying returns the invoice to Open, Past Due or Partially Paid.
  - Stripe states that you "can't apply a portion of a payment toward an invoice", which is weaker than what we need.
  - https://docs.stripe.com/invoicing/apply-payments
- **Takeaway:** Model Payment as cash received, with PaymentMatch (application) rows to invoices. Payment amount minus the sum of applications is **unapplied**, shown as client credit. That matches QuickBooks Online's "Amount to Credit", Zoho's "Unused Amount" and Stripe's "unapplied payments".

---

## 3. Bank CSV import and suggested matching

### 3a. QuickBooks Online: Upload from file (import flow, primary)

- **Source:** https://quickbooks.intuit.com/learn-support/en-us/help-article/import-transactions/manually-upload-transactions-quickbooks-online/L0rE9OXBz_US_en_US
- **Formats:** CSV must be **3-column** (Date, Description, Amount) or **4-column** (Date, Description, Credit, Debit). Other accepted formats are .qbo, .ofx, .qfx and .txt.
- **Limits:** ≤350 KB and ≤1,000 lines per upload.
- **Steps:**
  1. Bank transactions → Link account ▾ → **Upload from file**.
  2. Drag/drop or choose the file.
  3. Pick the target account.
  4. **Map columns** (the header row and date format are set here).
  5. Optionally "reverse all values" if signs are flipped (from the video).
  6. **Select the transactions to import**.
  7. Done.
- **File-prep guidance (doubles as a list of error causes):**
  - Remove the word "amount" from Credit/Debit headers.
  - Leave zero cells blank.
  - Use one consistent date format.
  - Split a day-of-week out of the date column.
- **Duplicates:** Start the file at least one day before the oldest existing transaction to avoid duplicates.
- **Confidence:** High.

### 3b. Zoho Books: Import Statement (column-mapping details)

- **Sources:**
  - https://www.zoho.com/us/books/kb/banking/how-to-import-a-bank-statement.html
  - Help index: https://www.zoho.com/us/books/help/banking/add-transactions.html
- **Steps:** Upload File (CSV, TSV, XLS, OFX, QIF, CAMT.053/.054) → **Amount Column Type** → Character Encoding and File Delimiter → **Map Fields** (file headers → app fields) → **Preview** → Import. Imported lines land as "uncategorized".
- **Amount Column Type has three choices:**
  1. **Double Column**: separate deposits and withdrawals.
  2. **Single Column and Amount Type**: an amount plus a debit/credit indicator column.
  3. **Single Column with Negative Values**: one signed amount.
- **Mapping (search snippet):** "the best match for each field … will be auto-selected", with a "Save these selections for use during future imports" option.
- **Confidence:** High for the steps; Medium for auto-select and save-mapping.

### 3c. Business Central: bank statement file format (data exchange definition)

- **Sources:**
  - https://learn.microsoft.com/en-us/dynamics365/business-central/across-how-to-set-up-data-exchange-definitions
  - https://learn.microsoft.com/en-us/dynamics365/business-central/bank-how-reconcile-bank-accounts-separately
- **What it defines:** header-line count to skip, column separator, and per-column position, type (Text/Date/Decimal) and date format. The format is attached **to a bank account** and reused.
- **Confidence:** Medium (search snippets).

### 3d. US bank CSV exports (third-party descriptions only; verify against a real anonymized file)

| Bank | Shape reported | Confidence |
|---|---|---|
| Chase (checking) | Header row with about 7 columns: Details, Posting Date, Description, Amount, Type, Balance, Check or Slip #. The header set appears to have changed over time. | Low |
| Bank of America | Several **summary lines before the real header** (beginning balance, totals), then `Date,Description,Amount,Running Bal.` | Low |
| Wells Fargo | **No header row**. Five positional columns: date, amount, `*`, empty, description. Check numbers appear only inside the description. | Low |

- **Sources:**
  - https://beancount.io/tools/csv-to-beancount/chase
  - https://beancount.io/tools/csv-to-beancount/bank-of-america
  - https://beancount.io/tools/csv-to-beancount/wells-fargo
  - https://invoicedataextraction.com/blog/bank-of-america-statement-to-excel
- **Implications for the importer:**
  - Detect the header row; don't assume it is row 1.
  - Allow "no header" files.
  - Support the three amount layouts from 3b.
  - Remember the mapping per bank account.
  - Show a preview with row selection before committing.
  - De-duplicate re-imports. Business Central notes that already-posted transactions "won't be imported".

### 3e. QuickBooks Online: Bank transactions "For review" (matching screen, primary)

- **Sources:**
  - https://quickbooks.intuit.com/learn-support/en-us/help-article/bank-feeds/match-online-bank-transactions-quickbooks-online/L6qyw0PvP_US_en_US
  - https://quickbooks.intuit.com/learn-support/en-us/help-article/bank-transactions/ai-suggestions-help-match-categorize-bank/L8FHOh4AD_US_en_US
- **Hierarchy:**
  1. Account tiles.
  2. Tabs: **For review / Pending** → **Posted** (plus Excluded).
  3. The list has a **"Categorize or Match"** column holding the suggestion.
  4. Expanding a row shows the details.
- **Interactions:**
  - Verify, then **Post** (or Match).
  - **"Find other match"** when the suggestion is wrong.
  - Exclude.
  - **Undo** from the Posted tab, which moves the line back to For review.
  - Bulk-post high-confidence suggestions from a bottom action bar (on some plans).
- **Suggestion logic, as documented:**
  - Same amount, within **90 days before to 20 days after** the bank date.
  - No suggestion when fees or discounts change the total, when several payments were deposited as one, when the record is outside the window, or when it is already reconciled.
  - The newer scoring considers: exact amount; payee lines up; **a single clear candidate**; date closeness; how often you accepted that kind of match; money direction.
- **Confidence badges:** "High confidence" (green) and "Medium confidence" (blue). "Low-confidence suggestions are filtered out of the inline feed entirely."
- **Side effect:** Matching an invoice "automatically marks it as paid". For us, confirming a match should create the Payment and PaymentMatch rows, with an undo.
- **Confidence:** High.

### 3f. Business Central: Payment Reconciliation Journal (confidence model and Difference handling)

- **Sources:**
  - https://learn.microsoft.com/en-us/dynamics365/business-central/receivables-how-reconcile-payments-auto-application
  - Rules: https://learn.microsoft.com/en-us/dynamics365/business-central/receivables-how-set-up-payment-application-rules
  - Manual apply: https://learn.microsoft.com/en-us/dynamics365/business-central/receivables-how-review-apply-payments-auto-application
  - Differences: https://learn.microsoft.com/en-us/dynamics365/business-central/receivables-how-reconcile-payments-cannot-apply-auto
- **Hierarchy:**
  - The journal has one line per bank transaction, with **Match Confidence** (Low/Medium/High/Accepted), Account Name, Statement Amount and **Difference**.
  - Footer links: **Lines to Review** and **Lines with Difference** open a guided **Payment Application Review**, one line at a time.
- **Interactions:**
  - **Apply Manually** opens the Payment Application page with every candidate open entry. You tick **Applied**, edit **Applied Amount** (split a lump sum across entries), then **Accept Application**.
  - **Transfer Difference to Account** handles unexplained remainders.
  - **Post** is allowed only when "no more lines require review and the Difference field is blank".
  - Test Report previews the result.
- **Scoring rules** (default table, 24 rows):
  - Criteria are **Related Party Matched** (Fully/Partially/No), **Document No./Ext. Document No. Matched** (Yes-Multiple/Yes/No) and **Number of Entries Within Amount Tolerance Found** (One/Multiple/No/Not considered).
  - Each rule maps to High/Medium/Low, with an optional **Review Required** flag.
  - Text match needs more than 4 characters.
  - Example: party fully matched + document no. matched + exactly one amount match = High.
- **Constraint:** "You can only apply a payment to one account". A lump-sum split must be within the same customer.
- **Confidence:** High.

### 3g. Stripe: automatic cash reconciliation order (best documented algorithm)

- **Source:** https://docs.stripe.com/payments/customer-balance/reconciliation
  - Older Sources-API version, with the same idea: https://docs.stripe.com/invoicing/automatic-reconciliation
- **Order, as documented:**
  1. Match the transfer **reference** to a single invoice **number**.
  2. Match the reference to another open payment request.
  3. Otherwise find a **group of 1–5 open invoices that sum exactly** to the amount. Tie-breakers: prefer the smallest group, then the group with the most invoices, then the oldest.
  4. Otherwise "fund as many invoices that can be fully funded, starting with the oldest due ones first".
  5. Anything left stays as an unapplied balance.
- **Older doc's underpayment setting:** a margin within which Stripe auto-reconciles and credits the difference (for example bank fees).
- **Confidence:** High.
- **Use:** The documented order gives us suggestion rules that are deterministic and explainable (CLAUDE.md requires an explain string). In Shiftbook these stay **suggestions the user confirms** (SPEC §14), never automatic.

### 3h. Zoho Books: Match & Categorize (multi-invoice selection)

- **Source:** https://www.zoho.com/us/books/help/banking/matching-transactions.html
- **Hierarchy:**
  - The Uncategorized list shows a **"Match found"** tag on lines that have a suggestion.
  - Opening a line shows a right pane of **Possible Matches**, with a filter icon (amount range, date range, customer, type, Reference#), "+ Create New Transaction", and Include Deposits/Withdrawals.
- **Interactions:**
  - **Select** one or more candidates. **Match** is enabled only when the selected total equals the bank amount.
  - An adjustment line (for example a fee) can be added in the pane.
  - **Unmatch** from the All Transactions tab.
- **Confidence:** High.

### 3i. Xero: bank reconciliation (classic two-column)

- **Sources (official, could not be fetched):**
  - https://central.xero.com/0/article/Reconcile-your-bank-account
  - https://central.xero.com/0/article/Reconcile-a-bank-statement-line-using-Find-Match
  - https://central.xero.com/0/article/Import-a-CSV-bank-statement-US
  - https://central.xero.com/0/article/Change-the-way-Xero-imports-CSV-bank-statements
- **What secondary sources describe:**
  - Bank line on the left, suggested match on the right, confirmed with **OK**.
  - Tabs: Match / Create / Transfer, plus **Find & match** to search, multi-select, and handle fees.
  - CSV import maps columns to Transaction Date, Payee, Description, Amount and Reference; prompts for the date format; and lets you untick rows before import.
- **Confidence:** Medium. Strongly reputed, but use it only after a human verifies it in a browser.

---

## 4. Payment reminder templates (version one: copy to clipboard or `mailto:`)

### 4a. QuickBooks Online: invoice reminders (primary for the manual send flow)

- **Source:** https://quickbooks.intuit.com/learn-support/en-us/help-article/invoicing/send-invoice-reminders-automatically-manually/L84cQjpxo_US_en_US
- **Manual flow:** Invoices list → find invoice → **Receive payment ▾ → Send reminder** → customize the message → Send. In our version, Send becomes **Copy** and **Open in email app** (mailto).
- **Template settings:**
  - Up to 3 automatic reminders, each "up to 90 days before or after" the due date.
  - Editable subject (keep "reminder" in it), greeting and message.
  - Insertable variables: Invoice Number, Company Name.
  - Changes apply to future reminders only.
- **Rules worth copying as guards:** reminders only go for unpaid invoices that were already sent ("only for invoices you've already emailed").
- **Confidence:** High.

### 4b. FreshBooks: reminders and email templates (variables, plus an insert shortcut)

- **Sources:**
  - https://support.freshbooks.com/hc/en-us/articles/227559727-What-are-payment-reminders-and-late-fees
  - https://support.freshbooks.com/hc/en-us/articles/360044800411-How-Do-I-Manage-My-Emails-and-Templates-
- **Reminder settings:** up to 3 reminders per client (days before or after due), a personal message, one-off or bulk send from invoices, and reminders go to the original recipient plus secondary contacts.
- **Dynamic fields:**
  - Amount outstanding; Before/after due date; Client company name; Client first name.
  - Invoice amount, which shows the amount outstanding on a partially paid invoice. That is the right behavior for short pays.
  - Invoice due date; Invoice number; Payment amount; Payment date.
- **Interactions:** Insert a field with the lightning icon **or by typing "::"**; Preview toggle.
- **Limits:** subject 100 characters; body 4,096 characters.
- **Confidence:** High.

### 4c. Xero: invoice reminders (secondary)

- **Sources (Medium):**
  - https://central.xero.com/0/article/Set-up-invoice-reminders
  - https://central.xero.com/0/article/Edit-or-delete-an-invoice-reminder
  - https://central.xero.com/0/article/Turn-invoice-reminders-on-or-off
- **What the snippets say:**
  - Three default reminders.
  - Options to include a link to the invoice PDF.
  - "Don't send reminders for amounts owing" under a threshold. This is a useful guard against nagging over tiny short-pay balances.
  - Sends happen daily between 4am and 8am. Not relevant, since we send nothing.

### 4d. US practice: cadence and tone (FreshBooks Hub, editorial)

- **Source:** https://www.freshbooks.com/hub/payments/payment-reminder-email
- **Cadence:**
  - Pre-due, 3–7 days before: friendly.
  - Due date: neutral.
  - 1–7 days overdue: polite and direct.
  - 14–30+ days overdue: firm. A final notice around 30 days overdue states the next step (for example a late fee, per the agreement).
- **Each reminder should carry:** invoice number, amount due, due date or days overdue, how to pay, the invoice attached or linked, and an invitation to raise disputes.
- **Confidence:** Medium (editorial guidance, not product documentation).

### 4e. `mailto:` mechanics

- **Source:** RFC 6068, https://www.rfc-editor.org/rfc/rfc6068
- **Mechanics:** `subject` and `body` are percent-encoded, and line breaks are `%0D%0A`.
- **Length risk (general knowledge, not verified here):** Some mail clients truncate long mailto URLs, roughly 2,000 characters. Keep reminder bodies short, and make **Copy** the always-works path.
- **Confidence:** High for the RFC; Medium for the length risk.

### Takeaway for reminders

- Template variables should include: client name, contact first name, invoice number(s), PO/worksite, invoice date, due date, days overdue, original amount, **amount outstanding**, amount paid to date, the agency's remit-to details, and the agency's name.
- One-week invoices mean clients often owe several invoices at once. Consider a reminder that lists several invoices for one client; our existing statement feature already does that.

---

## 5. Days-to-pay by client

| Product | Definition | Source | Confidence |
|---|---|---|---|
| Xero (contact page) | "The average number of days between when invoices are issued and when they're paid". A customer-level report is still an open idea (status "Accepted", no date). | https://productideas.xero.com/forums/967133-reports-tax/suggestions/44960980-reporting-show-average-days-to-pay-by-customer | Medium (quoted by users from the Contacts page) |
| QuickBooks Desktop: Average Days to Pay report | Days = paid date − invoice (or statement charge) date, averaged per customer over **paid** invoices. Not available in QuickBooks Online. | https://quickbooks.intuit.com/learn-support/en-us/reports-and-accounting/average-days-to-pay-report/01/492050/highlight/true (community/support answers) | Medium |
| Workday: Collections dashboard | **Average Days Late** = Σ(days late) ÷ count of invoices paid late, where days late = paid date − **due** date. **Weighted** ADL = Σ(amount × days late) ÷ Σ(amount). Only invoices "paid in full and when the paid date isn't null". | https://doc.workday.com/admin-guide/en-us/financial-management/customer-accounts/customer-collections/collections-dashboard/ogn1659383479276.html | High |
| Business Central | Average Collection Period (DSO-style, company-level, from GL). Not per-invoice. | https://learn.microsoft.com/en-us/dynamics365/business-central/finance-powerbi-average-collection-period | High (snippet) |

**Suggested definition for the planner to confirm with the owner:**

- Use the simple average, matching the Xero and QuickBooks Desktop convention. For each **fully paid** invoice, days = (date the last payment made it fully paid) − (invoice issue date), in whole days. Average per client over a fixed window, and show the count of invoices used.
- Optionally show "average days late" (against the due date) beside it, the Workday-style metric. For agencies on net-30 that is often the more actionable number.
- Keep it integer and explainable. Store Σdays and count, display rounded once, and include an explain string, for example "14 invoices, 518 days total → 37 days".
- **Edge cases to define:**
  - Credit notes that close an invoice don't count as "paid".
  - Supplemental invoices count on their own.
  - Write-offs are excluded.

---

## 6. Short-pay tracking

### 6a. TempWorks Enterprise (primary, staffing-native)

- **Sources:**
  - https://kb.tempworks.com/help/short-pay-invoices-report
  - https://kb.tempworks.com/help/how-to-write-off-a-small-invoice-balance
- **Short Pay Invoices report:** invoices that "have had a payment applied to them but still have an open balance". Branch filter; group by branch or customer.
- **Resolving one:**
  1. In the payments wizard, find the invoice.
  2. Set **Action = write off** and **Reason = small balance write off (SBWO)**, and enter the amount.
  3. Ctrl+S, then post.
- **Related reason codes:** **OP** (overpayment) is a reason code. The Reason column is also used for payment discounts and cash advances. Reason codes are how they explain GL movements.
- **Confidence:** High.

### 6b. Business Central: payment tolerance (when to auto-close a tiny difference)

- **Source:** https://learn.microsoft.com/en-us/dynamics365/business-central/finance-payment-tolerance-and-payment-discount-tolerance
- **What it does:**
  - Tolerances are set as **Payment Tolerance %** and **Max Pmt. Tolerance Amount**.
  - With the warning turned on, the user chooses how to treat a within-tolerance difference. The default choice is **"Leave the Balance as Remaining Amount"**; the alternative is to post the balance as payment tolerance.
  - Tolerance can be blocked per customer.
- **Confidence:** High.

### 6c. QuickBooks Online: write-off via credit memo

- **Source:** https://quickbooks.intuit.com/learn-support/en-us/help-article/customer-refunds-credits/write-bad-debt-quickbooks-online/L88pSKtr9_US_en_US
- **Steps:**
  1. Review A/R Aging Detail.
  2. Create a "Bad debts" expense account and item.
  3. Create a **credit memo** for the amount.
  4. Apply it to the invoice in Receive payment.
- The article advises consulting an accountant first.
- **Confidence:** High.

### 6d. Stripe: underpayment margin

- **What it does:** A configurable margin auto-reconciles small underpayments (bank fees) and credits the difference: https://docs.stripe.com/invoicing/automatic-reconciliation
- **Confidence:** High; the page is deprecated, but the concept is clear.

### 6e. Industry vocabulary: deduction or reason codes

- **Sources:**
  - Versapay recommends customizable deduction codes so customers pick a reason from an approved list: https://www.versapay.com/resources/short-paid-invoice-how-to-handle
  - HighRadius describes mapping customer reason codes to internal codes: https://www.highradius.com/software/order-to-cash/cash-application-management/deductions-coding/
- **Confidence:** Low–Medium (vendor marketing).

### Takeaway for short pays

1. A short pay leaves the invoice **open and marked short-paid**. Default to leaving the balance open, as Business Central does.
2. The user picks a **reason** from a data table (with effective dates, per CLAUDE.md), for example: disputed hours, rate difference, bank fee, client deduction, unknown.
3. The user then resolves it one of three ways:
   - collect the remainder (reminder);
   - issue a **credit note naming the original**, which SPEC already has;
   - **write off** with a reason (the TempWorks SBWO pattern).
4. A "short-paid" filter or report lists open short pays by client (TempWorks report).
5. Never auto-close a difference. Any tolerance is a suggestion the user confirms.

---

## 7. Staffing-specific practice

### Back offices with public docs

- **TempWorks Enterprise** has the richest public AR documentation. Its Accounts Receivable section (https://kb.tempworks.com/help/accounts-receivable) covers:
  - Invoice Payments Overview
  - Quick Pay
  - Lockbox Feed
  - Apply Overpayments
  - Zero Dollar Invoice
  - Lump Sum Check
  - Search/Filter
  - Write Off Small Balance
- **Bullhorn Back Office** (https://kb.bullhorn.com/backoffice/Content/backoffice/Topics/markingInvoicesPaid.htm):
  - Receivables tab → **Paid** column → "Paid Amount(s)" pop-up → Add payment lines (amount + date), one line per partial or split payment → Save.
  - Can instead sync paid status from QuickBooks Desktop (not QuickBooks Online).
  - This is basic. It confirms that many agency back offices leave real cash application to the accounting system.
  - **Bullhorn One**'s process guide reconciles its invoice register "to Accounts Receivable" in a separate financial system: https://kb.bullhorn.com/bhone/Content/BH1/Topics/bh1Tools.htm
  - **Confidence:** High for what is stated.
- **Avionté:** No public AR or payments documentation found; the help center appears to be login-only. **Confidence: none.** Do not use as a reference.

### Remittance advice and parent/child invoices

TempWorks' aging "Show" option exists because clients remit against a different invoice number from the one the payment was entered on (merged parent/child invoices). Our split-by-PO/worksite invoices and supplemental invoices make this real. The matcher should treat **PO number, worksite and the original invoice number** as references, not only our invoice number.

### Factoring (common for small agencies)

- **Sources:**
  - Factor marketing: https://www.advancepartners.com/payroll-funding/how-factoring-works/
  - https://ecapital.com/en-ca/blog/the-importance-of-a-notice-of-assignment-in-factoring/
- **How it works:**
  - The factor advances "80% to 90%+" of the invoice and holds a reserve.
  - It sends the client a **Notice of Assignment**, so the client pays the **factor's lockbox**.
  - When the client pays, the factor releases the reserve minus its fee.
  - Recourse vs non-recourse decides who eats non-payment.
- **AR implications:**
  - For factored invoices, the agency's bank shows **advance deposits and reserve releases from the factor**, not client payments.
  - The invoice's remit-to address must be the factor's.
  - Aging and days-to-pay still need the client's actual pay date, which comes from the factor's reports.
- **Confidence:** Medium (factoring vendors' own descriptions).

### Lockbox and BAI2

- **TempWorks:** Supports a "Lockbox Feed" upload of bank remittance files, but says to "work with a TempWorks representative" on the format (https://kb.tempworks.com/help/lockbox-feed). In practice it is a per-bank custom layout.
- **BAI2:** The Bank Administration Institute standard for cash-management files: 01 file header, 02 group, 03 account, 16 transaction detail, 88 continuation, 98/99 trailers (https://cashbook.com/cash-application-software/lockbox-automation/bai2). Mid-size and large companies use it with bank lockbox services.
- **Small agencies:** typically download CSV/OFX from online banking (QuickBooks Online, Xero and Zoho all lead with CSV/OFX).
- **Version one:** CSV-only is consistent with the reference products. OFX/QFX is the most common next format; BAI2/lockbox is a later, bank-by-bank feature.
- **Confidence:** Medium.

---

## 8. Recommended references per Shiftbook screen (for `docs/patterns/` files)

| Shiftbook screen (suggested route) | Primary `Source URL:` | Why this one | Secondary (single parts only) | Confidence |
|---|---|---|---|---|
| **AR aging** (`/receivables`) | https://support.freshbooks.com/hc/en-us/articles/219118308-What-is-an-Accounts-Aging-report | Fully documented hierarchy (quick filters → filter panel → client rows × buckets), three-level drill-down, export/print, and a known blank-list cause. | QuickBooks Online aging (bucket set, summary/detail, as-of method): https://quickbooks.intuit.com/learn-support/en-us/help-article/accounts-receivable-reports/run-accounts-receivable-aging-report/L4N7PC2hg_US_en_US. TempWorks Invoice Aging (branch, weekend-bill date, parent invoice): https://kb.tempworks.com/help/invoice-aging-report | High |
| **Payments list** (`/payments`) | https://quickbooks.intuit.com/learn-support/en-ca/help-article/journal-posting/view-sales-transactions/L2Do6c0jS_CA_en_CA | Status list (Open/Paid/Partially Paid/Overdue), filters, export, row "Receive payment". | Zoho Payments Received (Amount vs Unused Amount): https://www.zoho.com/us/books/help/payments-received/basic-functions.html. Stripe apply/unapply: https://docs.stripe.com/invoicing/apply-payments | Medium–High |
| **Record payment** (`/payments/new` or dialog) | https://quickbooks.intuit.com/learn-support/en-us/help-article/invoicing/record-invoice-payments-quickbooks-online/L4ZadDW7F_US_en_US | The canonical "one payment → tick invoices → amounts → leftover becomes credit" form. | TempWorks lump-sum (selection-order allocation, red short pay, Ctrl+L): https://kb.tempworks.com/help/how-to-pay-invoices-with-a-lump-sum-check. TempWorks Quick Pay (Tab-through entry): https://kb.tempworks.com/help/how-to-quick-pay-invoices | High |
| **Bank import** (`/bank/import`) | https://quickbooks.intuit.com/learn-support/en-us/help-article/import-transactions/manually-upload-transactions-quickbooks-online/L0rE9OXBz_US_en_US | Upload → account → map → select rows → done. Documented formats and limits. | Zoho amount layouts and saved mapping: https://www.zoho.com/us/books/kb/banking/how-to-import-a-bank-statement.html | High |
| **Bank match** (`/bank`, "For review") | https://quickbooks.intuit.com/learn-support/en-us/help-article/bank-feeds/match-online-bank-transactions-quickbooks-online/L6qyw0PvP_US_en_US (+ AI suggestions page for confidence badges) | Review queue → suggestion → Post; Find other match; Posted tab with Undo; confidence badges; low confidence hidden. | Stripe order of matching (reference → exact-sum group → oldest): https://docs.stripe.com/payments/customer-balance/reconciliation. Business Central confidence rules and Difference/review queue: https://learn.microsoft.com/en-us/dynamics365/business-central/receivables-how-set-up-payment-application-rules. Zoho multi-select until totals equal: https://www.zoho.com/us/books/help/banking/matching-transactions.html | High |
| **Client page AR section** (`/clients/[id]`) | https://support.freshbooks.com/hc/en-us/articles/217181797-What-are-clients | Outstanding graph (overdue vs not yet due), available credit, tabs incl. credits and statement, reminder settings from the client header. | Xero contact "average days to pay" (verify in browser). FreshBooks statements: https://support.freshbooks.com/hc/en-us/articles/360024193891-What-are-Client-Account-Statements- | High (Medium for days-to-pay) |
| **Reminders** (copy/mailto) | https://quickbooks.intuit.com/learn-support/en-us/help-article/invoicing/send-invoice-reminders-automatically-manually/L84cQjpxo_US_en_US | Manual "Send reminder" from the invoice row, editable template with variables, and guard rules. | FreshBooks variables and "::" insert: https://support.freshbooks.com/hc/en-us/articles/360044800411-How-Do-I-Manage-My-Emails-and-Templates-. Cadence: https://www.freshbooks.com/hub/payments/payment-reminder-email. mailto: RFC 6068 | High |
| **Short pays** (filter/report inside `/receivables`) | https://kb.tempworks.com/help/short-pay-invoices-report | Staffing-native: list of partly-paid invoices plus a write-off with reason code. | Business Central tolerance warning (default leave open): https://learn.microsoft.com/en-us/dynamics365/business-central/finance-payment-tolerance-and-payment-discount-tolerance | High |

Note for the pattern files: CLAUDE.md requires `Deviations allowed: none`. Where a screen mixes a primary with a secondary for one part, for example the match screen's multi-select from Zoho, the pattern file should name that part and its source explicitly, so the hook and the reviewer can see it.

---

## 9. Open questions for the owner (plain words, one at a time)

1. Do any of your clients pay a factoring company instead of paying you directly?
2. When a client pays less than the invoice, what do you usually do: chase the rest, give a credit, or let it go?
3. Below what dollar amount would you rather just let a small shortfall go than chase it?
4. Which bank do you download your account activity from? A sample file with fake numbers would let us test the importer.
5. When we show how fast a client pays, should we count from the invoice date or from the due date?
6. Should a big invoice count more than a small one when we work out a client's average days to pay?
7. Do your clients usually write your invoice number on their payment, or something else like a PO number?
8. How firm should the last reminder sound? For example, should it mention a late fee if your contract has one?

### Notes for the planner (not for the owner)

- SPEC bucket overlap (61–90 vs 90+): follow the QuickBooks Online/Xero convention, 91+.
- Future-dated payments break aging lists (FreshBooks note). Decide how payments dated after the as-of date are treated.
- Every match suggestion needs an `explain` string, for example "reference INV-1042 matched invoice number; amount equal; 1 candidate → high". The Business Central rule table and the Stripe order give a deterministic, citable basis.
- Keep tolerance, thresholds and windows (90/20-day date window, reminder threshold, write-off limit) in data tables with effective dates, per CLAUDE.md.
- Before any `Source URL:` points at central.xero.com, a human should open it in a browser and confirm it, because our tools cannot render it.
