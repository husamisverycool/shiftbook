# Pattern: Statement PDF (`src/pdf/statement.tsx`)

Status: adopted — slice (g) plan, decision G1 (2026-10-16)
Reference product and screen: Avionté — Invoice Merge (choose two or more of one customer's open
invoices; one document presents them; payments are still applied to each original invoice);
TempWorks — Merge Invoices (a parent number, the other invoices added; payments still go to each
original invoice); QuickBooks Online — customer statements (a list of invoices with their amounts
and a total)
Source URL: https://support.avionte.com/hc/en-us/articles/55996101711379-Invoice-Merge
Source URL: https://kb.tempworks.com/help/bo---how-to-merge-invoices
Source URL: https://quickbooks.intuit.com/learn-support/en-us/accounts-receivable/create-customer-statements/00/186219
Researched: 2026-10-16 (`docs/research/invoices-slice-g.md` §2.2). Confidence: high for the
behaviour (presentation only, AR per invoice); medium for the first page's columns (QuickBooks
statements, read through excerpts).

## Purpose in Granite
Several of one client's invoices in one PDF for the client's convenience; it is not a new bill.

## Hierarchy
1. **First page:** title "Statement"; the statement date; the agency and the client (Bill to), as
   on the invoice (`invoice.md`); a table of the invoices, oldest first (QuickBooks statements list
   transactions by date) — number (with "supplemental" or "credit note" for a correction), pay
   period, issued, due (none for a credit note), amount — and the total of their amounts; a line
   saying each invoice is paid on its own number (Avionté, TempWorks).
2. **Then each invoice** exactly as issued (`invoice.md`), in the table's order: its invoice pages.
   Its backup pages (hours detail, pictures) stay in the invoice's own PDF (Avionté merges the
   invoices; the backup goes with each invoice).
3. "Page X of Y" at the bottom right of every page (as the invoice).

## Never copy
Avionté's, TempWorks' or Intuit's wording, logos or colors.

Deviations allowed: none
