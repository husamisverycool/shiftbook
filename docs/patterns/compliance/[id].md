# Pattern: Obligation (`/compliance/[id]`)

Status: adopted — slice (j) plan (2026-10-16, under the owner's "just keep going")
Reference product and screen: Drata — control detail (tabs; an Overview with summary cards and
owners; Evidence: link, unlink, create new evidence, download); Vanta — test detail (tabs Evidence,
History, Notes) and documents (upload a file or a new version; "Mark as complete"; expired files
move to History; Download); Vanta — document renewal settings (Due soon when the reminder is sent,
Overdue when the date passes; renewal counted from the file's effective date)
Source URL: https://help.drata.com/en/articles/13372784-assess-and-manage-individual-controls-new-experience
Source URL: https://help.vanta.com/en/articles/11345374-the-tests-page
Source URL: https://help.vanta.com/en/articles/11345479-managing-documents
Source URL: https://help.vanta.com/en/articles/11345476-document-renewal-settings
Researched: 2026-10-16 (`docs/research/compliance-slice-j.md` §7). Confidence: high for the tabs,
evidence actions, statuses and History; medium for the layout of the Overview (Drata describes cards
and sections, not their arrangement).

## Purpose in Shiftbook
One duty: what the law asks and where it says so, who it is about, when it is due, who owns it, the
files that prove it was done, and what happened to it (SPEC §16: "each obligation with evidence
attachments").

## Hierarchy
1. **Header:** a link back to Compliance; H1 the duty and its subject; badges for the status
   (Overdue, Due soon, Upcoming, Done, Not applicable) and the state; at the right the actions for
   its status: **Mark done** (with an optional note; Vanta "Mark as complete") and **Not applicable**
   (with a reason) while open; **Reopen** once a person closed it (Owner only; what Shiftbook closed
   from the data, the data reopens).
2. **Tabs** (Drata, Vanta): Overview · Evidence · History · Notes, in the address.
3. **Overview:** summary cards (Drata's readiness cards): Due (date and how far away), Owner (a
   picker), Evidence (how many files), Status. Then **What the law asks** — the rule in plain words,
   its citation and a link to the official source; **About** — the subject with links (the client,
   the worker, the placement, the registration or the policy) and the facts the duty was worked out
   from (for example "Contract started 2026-03-02"; "Hired 2026-10-12; Section 2 due 2026-10-15,
   three business days later"). Where the duty needs data, its form is here: the I-9 dates; the
   Massachusetts job order's details (the worksite employer's phone, times, overtime, requirements,
   meals, transportation, strike; kept on the job order); the Illinois equal-pay rate (below); for a
   registration or policy, a link to Compliance settings; for an ACA offer, a link to the ACA tab.
   **Illinois equal-pay rate** (an equal-pay crossing's duty; Drata's control form): from a date (the
   crossing day for the first rate, today once one is on file); how the client compared (a comparable
   direct hire, the direct hire with the closest seniority, or the wage survey's median or 75th
   percentile); the rate; the hourly cash value of benefits paid in lieu of them (0 when the benefits
   are given); who it was compared with; a note — **Save rate**, which marks the duty done. Or **The
   client was asked** on a date (never in the future): the rate card is paid until the figures are
   in. Under the form, when the date matches a rate on file, a line says the new one replaces it.
   **Paid weeks to true up** (when there are any): the weeks already paid without the rate in force
   then, each linking to its files, where a correction starts (Drata: the control's failing items
   with a link to fix each). The rows on file below, newest first, each with who and when, and
   **Remove** (Drata: unlink, kept in history): a wrong row is removed with a reason and stays
   listed, struck through, with who removed it and why; a rate from the same date replaces the one
   before (kept as replaced); a request never replaces a rate.
4. **Evidence:** the files linked to this duty (Drata: link, unlink, create; Vanta: Download): name,
   effective date, added by and when, uploaded or generated; **Add file** (a file and its effective
   date); **Create** for duties with a document (the Illinois proof page, the Massachusetts job
   order, the workers' comp packet), which makes the file and links it. An unlinked file moves to
   **Past files** below (Vanta: History; Drata: past artifacts) and is never deleted. Form I-9 duties
   keep no files: the tab says copies are not kept here (they hold Social Security numbers and birth
   dates) and the dates go on the Overview.
5. **History:** what happened, newest first: created (and from what), owner changes, files linked
   and unlinked, done, not applicable, reopened — who and when.
6. **Notes:** notes newest first, each with who and when; a box to add one (Vanta "a space for
   updates and additional context").

## Interactions
- Mark done asks for an optional note; Not applicable asks for a reason (required); both appear in
  History. Removing an equal-pay row asks for a reason (required); with no rate left, a duty that
  entering the rate closed is open again (in History). A person's decision is never undone by the system; only the Owner reopens it. What
  Shiftbook closed from the data (a renewal, a recorded date, a placement that no longer applies),
  the data reopens or closes again.
- Files: PDF, images, spreadsheets, text, up to 20 MB; the effective date defaults to today.
- Keyboard: Esc goes back to the list.

## States
- **Overdue / Due soon:** the status badge and the Due card say so in words, not only color.
- **No files yet:** the Evidence tab says what would prove the duty (from its rule).
- **Create blocked:** the button says what is missing first (the job order's details, the
  Department's contact, the agency's phone, a registration in force on the duty's date).
- **Read only** (the accountant, or a role the duty is not for): no actions, pickers or forms.

## Never copy
Drata's or Vanta's wording, icons, colors or logos.

## Look (decision 0029, from the products' own screenshots)
The header as Stripe's detail header: back link, the duty's name with its status badge beside it, then whom it is for and its state; Overview, Evidence, History and Notes as underline tabs.

Deviations allowed: none
