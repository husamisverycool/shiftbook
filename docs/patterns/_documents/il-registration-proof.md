# Pattern: Illinois proof of registration (`src/pdf/il-registration-proof.tsx`)

Status: adopted — slice (j) plan, decision J3 (2026-10-16)
Reference product and screen: Shiftbook's own statement document (`_documents/statement.md`: the
agency and the client at the top, a dated title, a table, page numbers), with the contents the law
asks for: 820 ILCS 175/85(a) (the client verifies the agency's registration before contracting and on
March 1 and September 1) and 56 Ill. Adm. Code 260.510 (the agency gives proof of a valid
registration); the Illinois Department of Labor's list of registered agencies, where the client checks
Source URL: https://ilga.gov/Documents/legislation/ilcs/documents/082001750K85.htm
Source URL: https://ilga.gov/ftp/JCAR/AdminCode/056/056002600E05100R.html
Source URL: https://labor.illinois.gov/employers/approveddtlsa.html
Researched: 2026-10-16 (`docs/research/compliance-slice-j.md` §1). Confidence: high for what the law
asks; the layout follows Shiftbook's statement (no product publishes such a page).

## Purpose in Shiftbook
The page the agency gives an Illinois client so the client can verify the agency's registration, at
the contract's start and before each March 1 and September 1.

## Hierarchy
1. **Top:** the agency's name and address at the left; at the right the title "Proof of
   registration", the law it answers ("Illinois Day and Temporary Labor Services Act"), and the date
   it was made.
2. **For:** the client's name and address (as an invoice's Bill to).
3. **Registration table:** for the agency and each registered branch — the office, the registration
   number, issued, expires: the newest one in force on the day the client checks (the duty's date when
   the page is made early; else the day it is made).
4. **Workers' comp:** the insurer and policy number in force on that day, and its period (a lapse
   suspends the registration: § 45); none in force then: a line saying so.
5. **How to check:** a sentence that the client may verify the registration with the Illinois
   Department of Labor, its list's address, and the dates the law names (before contracting, March 1
   and September 1).
6. "Page X of Y" at the bottom right.

## States
- **No Illinois registration in force on that day:** the page cannot be made; the duty says to add
  one in Compliance settings first.

Deviations allowed: none
