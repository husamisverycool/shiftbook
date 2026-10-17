# Pattern: Worker onboarding (`/w/onboarding`)

Status: adopted — slice t (2026-10-17)
Reference product and screen: Gusto employee self-onboarding (Personal information → Taxes (W-4) →
Payment (direct deposit or paper check) → Review; forms signed by typing the full name and ticking
the box); Rippling onboarding checklist (the steps as a list with done marks)
Source URL: https://support.gusto.com/article/210728164125837/add-new-employees-to-gusto
Source URL: https://support.gusto.com/article/106622106100000/view-and-update-form-w-4-tax-withholding-elections-for-employees-and-admins
Source URL: https://www.rippling.com/blog/employee-onboarding-checklist
Researched: 2026-10-17 (`docs/research/workers-app-slice-t.md` §1). Confidence: high for the order
and the signing; medium for Rippling.

## Hierarchy
1. The checklist (Rippling): six steps, each with its state (done ✓, current, to do) — **Personal
   information**, **Taxes (Form W-4)**, **Work eligibility (Form I-9, Section 1)**, **Payment**,
   **Policies**, **Review and sign**. Selecting a done step reopens it.
2. One step at a time (Gusto), its fields in a column, **Save and continue** at the foot.
   - Personal: legal first and last name, Social Security number (nine digits), date of birth, home
     address, email (optional).
   - Taxes: the 2020-and-later Form W-4 — filing status (Step 1c), multiple jobs or spouse works
     (Step 2c), dependents amount (Step 3), other income, deductions, extra withholding (Step 4), or
     exempt.
   - Work eligibility: Form I-9 Section 1 — citizenship or immigration status and, by status, the
     A-number/USCIS number, the I-94 or foreign passport number and country, and the expiration
     date; no E-Verify.
   - Payment: direct deposit (routing number, account number twice, checking or savings) or paper
     check.
   - Policies: each agency policy with **I have read this**.
   - Review and sign: the summary of each step (numbers masked); "Type your full name to sign"; a box
     agreeing that typing the name is the electronic signature; **Sign and finish**.
3. Done: "You're all set" and Home.

## States
- A routing number that fails its check digit, account numbers that differ, an SSN that is not nine
  digits or is already on another worker: a message under the field.
- Saved as they go: coming back resumes at the first step not done.

Deviations allowed: none
