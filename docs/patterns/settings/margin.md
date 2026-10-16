# Pattern: Margin settings (`/settings/margin`)

Status: adopted — slice (i) plan (2026-10-16, under the owner's "just keep going")
Reference product and screen: Bullhorn — Workers' Compensation Codes (a table of state, code, name,
rate, start and end; a code is end-dated, never deleted); TempWorks — worker comp codes (one per
state) and the Gross Profit Calculator's Initial Burden (employer taxes as a percentage); Gusto —
pay schedule (a pay period and its pay date; paying in arrears leaves a gap between the period's end and the pay date); Linear — settings pages reached from the
workspace name
Source URL: https://kb.bullhorn.com/ats/Content/BHATS/Topics/managingWorkersCompensationCodes.htm
Source URL: https://kb.tempworks.com/help/enterprise---adding-updating-worker-comp-codes
Source URL: https://kb.tempworks.com/help/enterprise-gross-profit-calculator
Source URL: https://support.gusto.com/account-setup-maintenance/enter-account-info/company-details/1002031571/Set-up-a-new-pay-schedule.htm
Source URL: https://linear.app/docs/workspaces
Researched: 2026-10-16 (`docs/research/margin-slice-i.md` §2). Confidence: high for the rate tables
(Bullhorn, TempWorks); high for the pay date after the period (Gusto's article).

## Purpose in Shiftbook
The rates the margin's estimated burden uses (SPEC §15: employer tax percentage and workers' comp rate
by class) and the pay day the cash floating figure uses, each kept by the date it applies from.

## Hierarchy
1. **Page header:** "Settings" above, H1 "Margin settings".
2. **Employer taxes** (TempWorks Initial Burden): a table — state ("Any other state" for the default),
   rate %, from, to, what it includes — and **Add rate**.
3. **Workers' comp** (Bullhorn codes; TempWorks per state): a table — state, class code, description,
   rate per $100 of pay, from, to — and **Add rate**. Under it the choice "Leave the overtime premium
   out of workers' comp" with the date it applies from.
4. **Pay day** (Gusto pay schedule): "Workers are paid N days after the period ends", from a date.
5. Each section says when it was last changed and by whom.

## Interactions
- **Add rate** opens a dialog with the section's fields and a **From** date; saving starts the rate on
  that date and ends the one before it the day before (Bullhorn start and end); a rate starting the
  same day replaces it. Rates are never deleted.
- Fields that break a rule show it under the field; nothing is saved.

## States
- **No rate yet** for a section: says that burden for those lines counts as zero until one is added.
- **Read only** for the accountant: a line says only the Owner changes them.

## Never copy
Bullhorn's, TempWorks', Gusto's or Linear's wording, icons, colors or logos.

Deviations allowed: none
