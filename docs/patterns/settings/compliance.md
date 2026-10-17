# Pattern: Compliance settings (`/settings/compliance`)

Status: adopted — slice (j) plan (2026-10-16, under the owner's "just keep going")
Reference product and screen: Vanta — document renewal settings (each document renews on a
cadence counted from the effective date of its file; "remind me this number of days before"; Due
soon, then Overdue) and managing documents (upload a new version; the old one moves to History);
Bullhorn — workers' compensation codes (dated rows, ended rather than deleted; as Margin settings);
Jira — configure working days (select the days the team usually works under "Standard working days")
Source URL: https://help.vanta.com/en/articles/11345476-document-renewal-settings
Source URL: https://help.vanta.com/en/articles/11345479-managing-documents
Source URL: https://support.atlassian.com/jira-software-cloud/docs/configure-working-days/
Source URL: https://www.ecfr.gov/current/title-26/chapter-I/subchapter-D/part-54/section-54.4980H-3
Source URL: https://linear.app/docs/account-preferences
Source URL: https://linear.app/docs/saml-and-access-control
Source URL: https://linear.app/docs/scim
Researched: 2026-10-16 (`docs/research/compliance-slice-j.md` §1–§5, §7). Confidence: high for the
renewal behavior; low for the page's layout (Vanta keeps these on each document, Shiftbook gathers
them on one page as Margin settings does). Laid out on 2026-10-17 as Linear's settings from Linear's own
screenshots (`_components/settings.md`).

## Purpose in Shiftbook
The facts the compliance duties are worked out from that are not elsewhere in Shiftbook: the
agency's state registrations, its workers' comp policy, and the Massachusetts statement sent with
job orders (SPEC §16).

## Hierarchy
Laid out as Linear's settings (`_components/settings.md`): each section a heading with its muted line,
its add action at the heading's right (Linear's IP restrictions), its items as rows in a panel (Linear's
SAML domains: the name over its details, the status at the right), each form in a panel with **Save** in
its foot.
1. **Header:** "Settings" above, H1 "Compliance settings", the muted line saying the duties are worked
   out from these and from the agency's clients, placements and workers (and, for others, that only the
   Owner changes them).
2. **Registrations** (one section), **Add registration** at the heading's right: a panel, one row per
   registration — its number ("Replaced" beside an old one, muted) over the state, for (the agency, or a
   branch), issued and expires dates, and the certificate (a link to the file); at the right the
   renewal duty: its status (Due soon on the date the state's rule says, else Upcoming) over its date, a
   link to the duty. The dialog: state, for, number, issued, expires, the certificate file. Renewing is
   adding the new registration; the old one stays listed as Replaced (Vanta: the old file goes to
   History).
3. **Workers' comp policy**, **Add policy** at the heading's right: one row per policy — the carrier over
   its address and phone (printed on Massachusetts job orders), then the policy number, states, starts
   to ends, and the policy file; at the right the renewal and the audit due (optional), each a status
   over its date. The dialog as above, with the insurer's address and phone (optional).
4. **Massachusetts job orders:** a panel with the Department of Labor Standards' contact details printed
   on each job order (as the Department publishes them; the agency keeps them current), **Save contact**
   in its foot; a second panel, one row: the Department's multilingual statement (a file the agency
   uploads once, sent with every Massachusetts job order) over when and by whom it was added, the file
   chooser and **Upload statement** in its foot.
5. **Business days for Form I-9** (Jira's standard working days): a panel with the days of the week as
   checkboxes, Monday to Friday checked and fixed (they always count), Saturday and Sunday for the Owner
   to tick when the agency is open then; a line that holidays count too (the earlier date); the foot with
   when it was last changed and **Save days**, from today.
6. **ACA look-back** (the fields are the regulation's, 26 C.F.R. § 54.4980H-3(d)): a panel with the
   standard measurement period's length in months and the month it starts, the administrative period in
   days, the stability period in months, two by two; their limits in words from the dated rule (3 to 12
   months; at most 90 days; at least 6 months and no shorter than the measurement period); a line that
   new workers are measured on an initial period of the same length; the foot with when it was last
   changed, a link to the ACA tab and **Save periods**, from today, which works the ACA duties out at once.
7. Each section's panel says in its foot when it was last changed and by whom.

## Interactions
- Saving a registration or policy works out its duties at once (the renewal, the audit) and says
  so; a past expiry is allowed (it is shown Overdue).
- Only the Owner changes these; others read them.

## States
- **Nothing entered:** each section says what is missing and which duties cannot be worked out
  without it (for example "No Illinois registration: its renewal and the client proof pages cannot be
  dated"; "No ACA periods yet: no one is measured"), in the panel's one muted row (Linear's empty panel).

## Look (checked against Linear's screenshots, 2026-10-17)
As `_components/settings.md`. The registration and policy tables became rows in a panel, as Linear lists
dated items (its SAML domains: "Added <date>", the status at the right); every column's value is kept.

## Never copy
Vanta's, Bullhorn's or Linear's wording, icons, colors or logos.

Deviations allowed: none
