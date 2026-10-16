# Pattern: Bank file import (`/bank/import`)

Status: adopted — slice (h) plan (2026-10-16, under the owner's "just keep going")
Reference product and screen: QuickBooks Online — Upload from file (choose the file; map the
columns: date, description, amount or deposits and withdrawals, and the date format; choose the
lines to import; done); Zoho Books — Import Statement (the three ways a file gives amounts: one
signed column, two columns, an amount and a type; the mapping chosen automatically and remembered)
Source URL: https://quickbooks.intuit.com/learn-support/en-us/help-article/import-transactions/manually-upload-transactions-quickbooks-online/L0rE9OXBz_US_en_US
Source URL: https://www.zoho.com/us/books/kb/banking/how-to-import-a-bank-statement.html
Researched: 2026-10-16 (`docs/research/receivables-slice-h.md` §3a–3d). Confidence: high.

## Purpose in Shiftbook
Bring the bank's activity CSV in, so its deposits can be matched to invoices (decision H5).

## Hierarchy
1. **Header:** "Bank" above, H1 "Import bank file"; three steps shown in order: Upload · Map columns ·
   Choose lines (QuickBooks Online).
2. **Upload:** drop zone or choose a CSV file; the limits (1,000 lines, 1 MB); in demo mode a link
   to download a sample bank file.
3. **Map columns:** the file's header row (or "no header row"), then for each Shiftbook field —
   date, description, amount — the file's column; how amounts are given (one signed column; a
   deposits and a withdrawals column; an amount and a type column) (Zoho); the date format; a
   preview of the first lines as Shiftbook reads them. The mapping last used is chosen
   automatically and remembered (Zoho).
4. **Choose lines:** each line with its date, description and amount, deposits ticked, withdrawals
   and lines already imported unticked and marked; **Import** with the count.

## Interactions
- **Demo only (decision 0031):** "Trying the demo? Use the sample bank file · download it" — using it reads the sample as a chosen file and goes straight to Map columns.
- Back and Next between steps; Import ends on the Bank page, For review.
- A column choice that cannot be read (a date or an amount) shows which line failed and why.

## States
- A file that is not CSV, is empty or is over the limits is refused with the reason.
- **All lines already imported:** says so, and Import is not offered.

## Never copy
Intuit's or Zoho's wording, icons, colors or logos.

## Look (decision 0029, from the products' own screenshots)
Laid out as `_components/record-page.md`'s header ("Bank" above the title) with the shared numbered steps of decision 0029 rule 12.

Deviations allowed: none
