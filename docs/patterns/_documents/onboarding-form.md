# Pattern: Onboarding form record PDF (`src/pdf/onboarding-form.tsx`)

Form W-4, Form I-9 Section 1 and the direct deposit authorization, as records of the answers given.

Status: adopted — slice t (2026-10-17)
Reference product and screen: Gusto self-onboarding's signed forms (Documents › Form W-4 / Direct
Deposit Authorization); IRS Form W-4 step numbering; USCIS Form I-9 Section 1 fields
Source URL: https://support.gusto.com/article/106622106100000/view-and-update-form-w-4-tax-withholding-elections-for-employees-and-admins
Source URL: https://www.irs.gov/forms-pubs/about-form-w-4
Source URL: https://www.uscis.gov/i-9
Researched: 2026-10-17. Confidence: high for the fields; the official forms' page layout is not
reproduced (a record of the answers, with the official step numbers).

## Hierarchy
1. Title (the form's name) and a line saying it records the answers given in Tabulado.
2. The worker's name and the last four of the SSN only (never the whole number).
3. The answers, labelled with the official step or field names, in the official order.
4. The electronic signature: the typed name, the date and time, and the statement agreed to.

Deviations allowed: none
