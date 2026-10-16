# 0017 — Corrections follow the documents as issued; the VMS file bills only time sheet hours

Status: accepted
Date: 2026-10-16

## Context
The second-opinion review of slice (g) (decision 0016) found these problems:
- A correction of hours first billed on a supplemental invoice looked only at the original
  invoices' lines, so it could credit an invoice that never billed those hours, or have nowhere to
  go.
- A supplemental printed the placement's PO today, not the PO the hours were invoiced under.
- Hours moved between two invoices of one client were judged by the client's total, which did not
  change, so the correction was refused as "nothing differs".
- The SAP Fieldglass upload billed a line on a time sheet when only some of its days came from it.
- A page with a line the intake could not place could be sent as a picture.
- Other gaps the review listed:
  - Holiday-not-worked lines on the VMS file.
  - The PO check on supplementals.
  - Correction numbering.
  - The approval fingerprint.
  - CSV formulas.

## Decision
- **A correction looks at every document the period issued:**
  - It looks at invoices, then the supplementals and credit notes made since.
  - A difference belongs to the invoice whose document (or whose correction's document) billed its
    placement and week.
  - The difference carries the PO those hours were billed under.
  - Hours never billed go to the invoice of the part the client's settings put them in. If there
    is none, they go to a new invoice, numbered as a run numbers them: the base number alone and
    first; otherwise the next numbers in PO, then worksite, order.
  - An invoice made before slice (g) kept no lines. It still takes its client's corrections, under
    its PO, or the placement's or the client's.
- **What differs is judged per invoice.** Hours moved between two invoices of one client are a
  real difference to each: a credit note on one, a supplemental on the other. A correction is "no
  differences" only when no invoice and no worker's pay changes.
- **More billed needs a PO** wherever the client requires one: a supplemental as much as a new
  invoice.
- **The SAP Fieldglass upload bills a line on a time sheet only when every day of the line came
  from that one time sheet.**
  - A line that is not worked hours (a holiday not worked, a guarantee) goes on the worker's single
    time sheet for that placement and week, or is refused.
  - A refusal names the worker, who can be skipped and paid by hand.
  - A correction of a client on the upload is a warning: the VMS invoices each time sheet once, so
    the correction is recorded there by hand. No upload file is made for it.
- **A timesheet page is sent as a picture only when every line read from it is billed to the
  client.** A line with no placement may be anyone's.
- **The approval fingerprint covers what the backup and the VMS file are made of:** time sheet ids,
  statuses, pictures and who else is on them, and the client's approval decisions.
- **Text in the invoice CSV and the upload that a spreadsheet would read as a formula** (a leading
  `=`, `+`, `-`, `@`, tab or carriage return) gets a leading apostrophe. Amounts keep their sign.

## Alternatives considered
- **Make an upload file for a correction's new time sheets:** this needs to know which time sheets
  every earlier upload carried, and Fieldglass has its own process for revised time sheets. A
  warning keeps the person in charge of what Fieldglass is told.
- **Split a holiday-not-worked amount across several time sheets:** this would invent a rounding.
  It is refused instead.

## Consequences
Corrections never move hours between invoices or POs they were not billed under. A client on the
Fieldglass upload needs every hour from its time sheet download; anything else stops the run with
the worker named.
