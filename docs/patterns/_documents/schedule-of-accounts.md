# Pattern: Schedule of accounts PDF (`src/pdf/schedule-of-accounts.tsx`)

Status: adopted — slice (s), decision 0040 (2026-10-17)
Reference product and screen: a factor's published Schedule of Accounts form (Compass Funding
Solutions: debtor name, invoice number, date, reference / PO number, invoice amount, a total, the
seller's signed certification and assignment, a section for the factor's use); the definition of a
schedule in a factoring agreement filed with the SEC (each receivable's amount owed, the account
debtor's name and address, the invoice number and date, signed)
Source URL: https://compassfs.net/_Old_Website/scac011.pdf
Source URL: https://www.sec.gov/Archives/edgar/data/1665300/000121390018004257/fs42018ex10-17_stellaracq3.htm
Researched: 2026-10-17 (`docs/research/connections-exports-slice-s.md` §6). Confidence: high for the
columns and the signed assignment (the form and the agreement themselves); medium for the layout
(one form's image).

## Purpose in Granite
The page an agency signs and sends its factor with the invoices it assigns; the CSV of the same rows
and each invoice's PDF (with its timesheet backup) travel with it in one file.

## Hierarchy
1. Title "Schedule of accounts"; under it the schedule number and date; the seller (the agency, with
   its address) and "Assigned to: ________" for the factor's name (the form leaves the factor's name
   to the seller).
2. A table, oldest first: debtor (the client, with its address under the name), invoice number,
   invoice date, due date, PO / reference, amount; the count and the total under it (the form's
   footer total).
3. The certification and assignment paragraph in plain words: the invoices are for work performed
   and approved, the amounts are owed and not disputed or paid, and they are assigned to the factor
   under the agreement (the form's certification; the agreement's "bill of sale").
4. Signature lines: signature, printed name, title, date.
5. A ruled box "For the factor's use" (the form's factor-only section): left empty.
6. "Page X of Y" at the bottom right of every page (as the invoice).

## Interactions
None (a document).

## States
- Many invoices: the table continues across pages with its header repeated.

## Never copy
The form's wording, its logo or layout details beyond the hierarchy above.

Deviations allowed: none
