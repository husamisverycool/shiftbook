# 0018 — Receivables: payments applied to invoices, a bank CSV matched by suggestion, aging from balances

Status: accepted
Date: 2026-10-16

## Context
SPEC §14 asks for aging buckets, days to pay by client, reminder templates (copy or mailto), a bank
CSV import with suggested matches that a person confirms, and short-pay tracking. SPEC §22 rules out
money movement and live bank connections. Until this slice an invoice had no balance: nothing
recorded what a client paid. The research (`docs/research/receivables-slice-h.md`) found the same
shape in QuickBooks Online, Zoho Books, Xero, FreshBooks, Stripe, Business Central and the staffing
back offices (TempWorks, Avionté). Plan: `.claude/plans/slice-h-receivables.md`, decisions H1–H11.

## Decision
- **A payment is money received from one client** (`payments`: date, amount in cents, method,
  reference, memo), applied to that client's invoices by `payment_matches` (a trigger refuses a
  match to another client's invoice). What is not applied is the client's credit, applied later. A
  payment is never deleted: it is voided with a reason, which reopens what it paid and sends its
  bank line back for review.
- **An invoice's balance is computed, not stored**: its total, less the credit notes that name it,
  less the live payments applied to it, less write-offs (`balances.ts`). The invoice's status
  (`paid` or not) follows the balance after every change (`settleStatuses`). As of a date, only what
  is dated on or before it counts — invoices issued, credit notes, payments and write-offs.
- **Short pays stay open** until paid or written off; the reason is recorded on its own row
  (`short_pays`, one per invoice). A write-off has an amount no more than the balance, a reason and a
  note (`write_offs`).
- **Aging by due date** (Current, 1–30, 31–60, 61–90, 91+), credits in Current; **days to pay** is
  the simple average, half up, of issue-to-paid-off days for invoices paid off by payments in the
  365 days before the date (a written-off invoice is not counted), with its explain string.
- **The bank file is a CSV read without floating point**: a header row anywhere in the first ten
  lines or none; one signed amount column, deposits and withdrawals columns, or an amount and a type;
  three date formats. The mapping is guessed, editable and remembered (`bank_imports.mapping`). Each
  line has a fingerprint (date, amount, description, reference and its occurrence in the file) that
  is unique per agency, so a line is never imported twice. Withdrawals are kept as excluded.
- **Suggestions are computed when the page is shown**, never stored, in Stripe's order (invoice
  number or PO on the deposit; an exact sum of one to five of a client's invoices; the client named,
  oldest first), with Business Central's High or Medium confidence and an explain string. Nothing
  is recorded until a person posts it; posting records an ordinary payment tied to the line.
- **Reminders are prepared, not sent**: a stage from the days late, English or Spanish templates
  in `messages/*.json`, edited in the dialog, then copied or opened in the email app; the day and
  how are recorded (`reminders`).
- **One lock for all receivables changes** (`lockReceivables`, a transaction advisory lock per
  agency) so two people cannot apply the same money twice; all tables are tenant tables under RLS;
  rows can be deleted only in the demo agency (its reset).
- **Owner and Billing** change receivables; everyone else reads them.

## Alternatives considered
- **A stored balance column** on invoices: faster lists, but it can drift from its payments and
  would need recomputing after every void and credit note; balances are computed from their parts
  instead (the agencies are small).
- **Automatic posting of High-confidence matches**: SPEC §14 says the user confirms; QuickBooks
  Online also asks.
- **OFX/QFX bank files**: most banks also export CSV; CSV covers the agencies' banks without another
  parser. A later slice can add OFX if the owner asks.
- **Sending reminders by email from Shiftbook**: SPEC §14 says copy or mailto in version one.

## Consequences
- Every screen that shows money owed (aging, client page, invoice page, payments) reads the same
  `invoiceBalances`, so they agree.
- Voiding is the only way to take back a payment; a wrong application is voided and recorded again.
- A bank file with more than 1,000 lines or over 1 MB must be split by date.
- Margin analytics (slice i) can use payments for "cash you are floating".
