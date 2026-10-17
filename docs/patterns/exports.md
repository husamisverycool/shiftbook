# Pattern: Exports (`/exports`)

Status: researched — ready for owner review
Reference product and screen: Stripe Dashboard — reports and list-page CSV exports
Source URL: https://docs.stripe.com/reports/options
Source URL: https://docs.stripe.com/reports/payout-reconciliation
Source URL: https://docs.stripe.com/reports/api
Source URL: https://support.stripe.com/questions/exporting-payment-data
Source URL: https://support.stripe.com/questions/customizing-your-reports
Researched: 2026-10-15. Confidence: high for the export dialog and report sections; low for a
history list of past exports (Stripe does not document one in the Dashboard).

## Purpose in Granite
Produce the payroll file for the agency's payroll system and the client invoice files for a period,
see each file's control totals, and download it again later.

## Hierarchy
1. **Report controls at the top** (Stripe report page): period (date range; defaults to the most
   recent period, choices of previous periods or custom dates, inclusive); format selector
   (Granite: Gusto CSV, ADP Paydata, QuickBooks Online CSV, IIF, ADP RUN, generic mapped CSV).
2. **Stacked sections, each with Download in its upper-right corner** (Stripe report sections):
   - Summary — the control totals (workers, minutes by earning type, gross cents) for the period.
   - Payroll file — one row per worker with the export's columns.
   - Invoices — one per client.
   - Exceptions — only shown when something would make the file fail (Stripe shows "Failed payouts"
     only when there are failures).
3. **Download options** (Stripe): Summary (the totals shown) or Itemized (every line); file format
   where more than one applies.
4. **Export dialog** (Stripe list-page export): time zone, date range, columns ("All columns" or a
   custom set).

## Interactions
- Download → the file goes straight to the device (Stripe list-page export).
- Hover a section → its Download control is available (Stripe category download).
- Click a total → opens the lines that make up that total (Stripe "click amounts opens an activity
  breakdown").
- Every export records its control totals and file hash (SPEC §13); an export that does not
  reconcile exactly fails and shows in the Exceptions section.

## States
- Export run states (Stripe ReportRun): `pending` → `succeeded` (file available) or `failed`.

## Not known from the references (ask the owner before building)
- A list/history of previously generated exports (Stripe does not document one).
- Progress/loading display while a file is generated.

## Never copy
Logos, product names, icons, illustrations, wording or colors from Stripe.

Deviations allowed: none
