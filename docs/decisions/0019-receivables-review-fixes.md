# 0019 — Receivables after the second opinion: credit from credit notes, bank files read safely, past reports kept

Status: accepted
Date: 2026-10-16

## Context
A second-opinion review of slice (h) (decision 0018) found eight defects with concrete failure paths
and a dozen smaller ones. The ones that change behavior or the data model are recorded here; each
has a test that failed before the fix (`tests/integration/receivables.test.ts` "second-opinion
review", `src/server/receivables/{matching,bank-csv,aging-csv}.test.ts`).

## Decision
- **A credit note can leave the client's credit.** When a credit note takes off more than an invoice
  still owed (it was already paid), the invoice's balance is negative: the client's credit. It is
  applied to the client's other open invoices from the invoice page (**Apply credit**), recorded in
  `credit_applications` (from invoice, to invoice, date, amount; same client by a database check;
  kept like every receivables row). Balances count it both ways, as of its date, which is never
  before the credit note or the invoice it pays. Reference: Stripe — a credit note on a paid invoice
  credits the customer's balance, which is applied to the next invoice. Issuing credit notes now takes
  the receivables lock, so no payment is applied while an original's balance changes.
- **Suggestions search by group size.** The exact-sum step looks at every single invoice before any
  pair, then pairs, up to five, each size bounded; many small invoices no longer hide one that
  matches alone. A client is named only by its name as whole words.
- **Bank files are never read short silently.** A file whose header names nothing known gets a first
  mapping from what its cells hold (no header row when the first line is already a transaction). A
  remembered mapping keeps its columns but takes this file's header row. A header row that reads as a
  transaction is shown as a problem; when no line reads at all, each line says why. A type column
  sets the sign only when it says credit or debit (`ACH_CREDIT` reads as "ACH credit"); the date
  order is guessed from every line.
- **A deposit carries the bank's date**, even ahead of the agency's today; a payment typed in by hand
  still cannot be dated in the future. A problem with a field the dialog does not show (a deposit's
  date or amount) is said in the dialog.
- **Past reports stay as they were.** As of a date, a payment applied later to an invoice issued after
  that date is still the client's credit then, and a payment voided after that date still counted
  then (the void's date in the agency's time zone).
- **Write-off and a short pay's reason are for an invoice a payment left short** (the pattern's
  words); otherwise the service answers `not_short_paid` and the page does not offer them.
- **The aging CSV keeps formulas as text** (a leading apostrophe for `= + - @`, tab or carriage
  return, before quoting).
- Smaller: ids that are not ids are refused, not thrown; the bank preview checks the role; a mailto
  keeps several addresses; the header row list shows the ten lines searched; an emptied amount is
  left out like an untick; the match window is the one in force on the deposit's date.

## Alternatives considered
- **Recording a refund outside Shiftbook** for the extra credit (Stripe's "outside of Stripe"): it
  would record money moving, which SPEC §22 leaves out; applying the credit covers the usual case of
  a client taking it off its next invoice.
- **Treating the extra credit like an unapplied payment** (a synthetic payment row): payments are
  money received; a credit note is not, and the payments list would show money that never came in.

## Consequences
- Migration `0027_credit_applications`.
- An invoice with no payment cannot be written off from its page; a client that will never pay
  anything is a question for the owner (it is listed in the plan's open questions).
- The integration tests cover each finding; finding 8 (the lock) is covered by reading the code
  path: the payment path takes only the receivables lock, the files path takes it after the period
  lock, so there is no lock cycle.
