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
Source URL: https://linear.app/docs/account-preferences
Source URL: https://linear.app/docs/saml-and-access-control
Source URL: https://linear.app/docs/login-methods
Researched: 2026-10-16 (`docs/research/margin-slice-i.md` §2). Confidence: high for the rate tables
(Bullhorn, TempWorks); high for the pay date after the period (Gusto's article). Laid out on 2026-10-17
as Linear's settings from Linear's own screenshots (`_components/settings.md`).

## Purpose in Tabulado
The rates the margin's estimated burden uses (SPEC §15: employer tax percentage and workers' comp rate
by class) and the pay day the cash floating figure uses, each kept by the date it applies from.

## Hierarchy
Laid out as Linear's settings (`_components/settings.md`): each section a heading with its muted line
and **Add rate** at the heading's right (Linear's IP restrictions), its rates as rows in a panel
(Linear's SAML domains: the name over its dates, the value at the right), each choice a row with its
control at the right and **Save** in the panel's foot.
1. **Page header:** "Settings" above, H1 "Margin settings", the muted line saying what the rates are
   for (and, for the accountant, that only the Owner changes them).
2. **Employer taxes** (TempWorks Initial Burden): a panel, one row per rate — the state ("Any other
   state" for the default, "In force" beside the one in force) over its dates ("From <date>" or "<date>
   to <date>") and what it includes; the rate % at the right. A rate that has ended is muted.
3. **Workers' comp** (Bullhorn codes; TempWorks per state): a panel, one row per rate — state · class
   code ("In force" beside it) over the description and its dates; "$N per $100" at the right. A code
   with no rate today is named in red under the section's muted line. Under it a second panel: the
   switch "Leave the overtime premium out of workers' comp" in its row (with what changes next), the
   **From** date in the next row, **Save** in the foot.
4. **Pay day** (Gusto pay schedule): a panel — "Days after the period ends" over what applies now (and
   next), the number at the right; **From** and its date in the next row; the foot with when it was last
   changed and **Save**.
5. Each rate panel ends with a foot saying when it was last changed and by whom.

## Interactions
- **Add rate** opens a dialog with the section's fields and a **From** date; saving starts the rate on
  that date and ends the one before it the day before (Bullhorn start and end); a rate starting the
  same day replaces it. Rates are never deleted.
- Fields that break a rule show it under the field; nothing is saved.

## States
- **No rate yet** for a section: the panel's one muted row says that burden for those lines counts as
  zero until one is added (Linear's empty panel).
- **Read only** for the accountant: the header's muted line says only the Owner changes them; no Add
  rate, no fields, no Save.

## Look (checked against Linear's screenshots, 2026-10-17)
As `_components/settings.md`. The rate tables became rows in a panel, as Linear lists dated items
(its SAML domains, "Added <date>"); every column's value is kept in the row.

## Never copy
Bullhorn's, TempWorks', Gusto's or Linear's wording, icons, colors or logos.

## Loading and errors (slice o)
- Loading: the page's outline in the settings shape (`_components/loading.md`); buttons that start
  work show a spinner in place of their icon (Primer Button `loading`).
- A failure: the frame stays; the failed content's place says so with "Try again"
  (`_components/error.md`).

Deviations allowed: none
