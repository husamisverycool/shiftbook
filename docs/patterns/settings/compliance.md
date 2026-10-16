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
Researched: 2026-10-16 (`docs/research/compliance-slice-j.md` §1–§5, §7). Confidence: high for the
renewal behavior; low for the page's layout (Vanta keeps these on each document, Shiftbook gathers
them on one page as Margin settings does).

## Purpose in Shiftbook
The facts the compliance duties are worked out from that are not elsewhere in Shiftbook: the
agency's state registrations, its workers' comp policy, and the Massachusetts statement sent with
job orders (SPEC §16).

## Hierarchy
1. **Header:** "Settings" above, H1 "Compliance settings", a line saying the duties are worked out
   from these and from the agency's clients, placements and workers.
2. **Registrations** (one section): a table — state, for (the agency, or a branch), number, issued,
   expires, the certificate (a link to the file), the renewal duty's status (Due soon on the date the
   state's rule says, else Upcoming); **Add registration** opens a dialog: state, for, number, issued,
   expires, the certificate file. Renewing is adding the new registration; the old one stays listed
   as Replaced (Vanta: the old file goes to History).
3. **Workers' comp policy:** carrier (with its address and phone under the name, printed on
   Massachusetts job orders), policy number, states, starts, ends, audit due (optional), the policy
   file; **Add policy** as above, with the insurer's address and phone (optional).
4. **Massachusetts job orders:** the Department of Labor Standards' contact details printed on each
   job order (as the Department publishes them; the agency keeps them current), and the Department's
   multilingual statement (a file the agency uploads once, sent with every Massachusetts job order),
   with when and by whom it was added.
5. **Business days for Form I-9** (Jira's standard working days): the days of the week as checkboxes,
   Monday to Friday checked and fixed (they always count), Saturday and Sunday for the Owner to tick
   when the agency is open then; a line that holidays count too (the earlier date); **Save days**,
   from today.
6. Each section says when it was last changed and by whom.

## Interactions
- Saving a registration or policy works out its duties at once (the renewal, the audit) and says
  so; a past expiry is allowed (it is shown Overdue).
- Only the Owner changes these; others read them.

## States
- **Nothing entered:** each section says what is missing and which duties cannot be worked out
  without it (for example "No Illinois registration: its renewal and the client proof pages cannot be
  dated").

## Never copy
Vanta's or Bullhorn's wording, icons, colors or logos.

Deviations allowed: none
