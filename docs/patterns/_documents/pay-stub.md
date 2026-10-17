# Pattern: Pay stub PDF (`src/pdf/pay-stub.tsx`)

Status: adopted — slice t (2026-10-17)
Reference product and screen: Gusto pay stub
Source URL: https://gusto.com/resources/articles/payroll/how-to-read-your-pay-stub
Researched: 2026-10-17 (`docs/research/workers-app-slice-t.md` §3). Confidence: high.

## Hierarchy
1. Header: the agency's name and address; the worker's name, the last four of the SSN; the pay
   period's dates.
2. **Earnings** table: description, rate, hours, current, year to date; **Gross pay** row.
3. The note that taxes and deductions are calculated by the payroll provider.

Deviations allowed: none
