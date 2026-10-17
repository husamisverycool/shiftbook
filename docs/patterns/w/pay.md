# Pattern: Worker app Pay (`/w/pay`)

Status: adopted — slice t (2026-10-17)
Reference product and screen: Gusto mobile app Pay tab (a list of paystubs with pay dates and pay;
tap one for its breakdown; Show paystub PDF)
Source URL: https://support.gusto.com/article/260428150612093/view-and-understand-your-paystub-for-us-employees
Source URL: https://support.gusto.com/article/207607681100000/gusto-mobile-app-employee-experience
Researched: 2026-10-17. Confidence: high.

## Hierarchy
1. Title **Pay**; the year's gross so far (Gusto's year-to-date) as a figure.
2. Rows, newest first: the week worked, the gross pay, a chevron; a correction week says so.
3. Under the list: gross pay, before taxes and deductions, which the payroll provider calculates.

## States
- None yet: "Your pay stubs appear here after your first paid week."

Deviations allowed: none
