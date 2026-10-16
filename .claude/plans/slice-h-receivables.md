# Slice (h) — Accounts receivable and cash application

Status: GO under the owner's "just keep going … I don't need to approve anything for you"
(2026-10-16). Choices the research left open are listed under "Decisions made for the owner"; the
owner can reverse any of them.
Contract: SPEC.md §4 (Payment, PaymentMatch), §14 (AR and cash application), §24 step 8 ("Bank CSV
is matched"). Research with sources: `docs/research/receivables-slice-h.md`.

## Goal (what the owner can do at the end)
See who owes what and how late (aging by client, current, 1–30, 31–60, 61–90, 90+ days past due),
how fast each client pays, and record what came in: a payment typed in, or the bank's CSV of
deposits matched to invoices with suggestions the person confirms. A payment can pay several
invoices; a short payment leaves a balance that is tracked with its reason until it is collected
or written off. Reminders are prepared from templates and copied or opened in the email program;
Shiftbook never sends them and never moves money.

## Done means (evidence I will paste)
1. `pnpm test` (unit + integration + goldens), `pnpm typecheck`, `pnpm lint` — real output, green.
2. Playwright, English and Spanish: after a week's files, the Owner imports the demo bank CSV,
   confirms the suggested matches (one exact, one short payment, one deposit left unmatched),
   records the short payment's reason, sees the aging and the client's days to pay change, and
   copies a reminder for an overdue invoice. Accessibility checks on every new screen.
3. Screenshots of every new screen and state, compared with the pattern files.
4. A second-opinion review of balances, aging, matching and write-offs (money), fixed.
5. Unit tests with hand arithmetic for the aging buckets, days to pay and the matching order.

## Steps (tests first)
1. Data: payments, payment matches, bank imports and their lines, short payments and write-offs;
   an invoice's balance (total − payments − credit notes − write-offs) and status from it.
2. Services: record a payment and apply it (oldest first unless chosen); void one; bank CSV import
   with column mapping and suggestions; confirm or ignore a line; short payment reason, collect or
   write off; aging; days to pay; reminders.
3. Screens per pattern files; sidebar.
4. Browser tests, accessibility, screenshots; second-opinion review; fixes.

## Screens and documents, with references
| Screen | Pattern file | Reference |
|---|---|---|
| Receivables: aging and short pays (`/receivables`) | `receivables.md` (new) | FreshBooks Accounts Aging (client rows × buckets, every amount drills to its invoices); QuickBooks Online A/R aging (buckets, as-of date); TempWorks Short Pay Invoices report |
| Payments list and Record payment (`/payments`) | `payments.md` (new) | QuickBooks Online sales transactions list and Receive payment; Zoho Books "unused amount"; TempWorks Quick Pay |
| Bank deposits to review (`/bank`) | `bank.md` (new) | QuickBooks Online bank transactions "For review" (suggestion, Post, find another match, Posted with Undo, Excluded); Stripe's reconciliation order; Business Central match confidence; Zoho Books multi-select |
| Bank file import (`/bank/import`) | `bank/import.md` (new) | QuickBooks Online Upload from file (upload → map columns → select rows → done); Zoho Books amount layouts and saved mapping |
| Invoice page: payments, short pay, write-off, reminder | `invoices/[id].md` (updated) | Stripe invoice payment history; QuickBooks Online Send reminder; TempWorks write-off with a reason |
| Client page: what the client owes | `clients/[id].md` (updated) | FreshBooks client profile (outstanding: overdue and not yet due, credit); Xero average days to pay |
| Sidebar | `_layouts/app.md` (updated) | Linear sidebar |

## Decisions made for the owner (2026-10-16, under "keep going"; any can be reversed)
- H1 **Aging by due date** (QuickBooks Online, Xero): Current (not yet due), 1–30, 31–60, 61–90 and
  91+ days past due (SPEC's "90+" read as 91 and over, as QuickBooks Online and Xero label it), as
  of a chosen date (default today). Payments, credits and write-offs dated after that date do not
  count (FreshBooks warns of future-dated payments).
- H2 **A payment is money received from one client** (date, amount, method, reference, memo),
  applied to that client's invoices; what is not applied is the client's credit, applied later
  (QuickBooks Online "Amount to Credit", Zoho "Unused Amount"). A payment is voided with a reason,
  never deleted (Stripe "unapply"; TempWorks negative payment).
- H3 **An invoice's balance** = its total, less the credit notes that name it, less the payments
  applied, less write-offs. Paid when the balance is zero.
- H4 **Short pays are tracked, never closed by themselves** (Business Central leaves the balance
  open by default; TempWorks Short Pay Invoices report): an invoice with a payment and a balance is
  short-paid; the person may record why (reason list) and later write off the rest with a reason
  (TempWorks small-balance write-off), or keep collecting.
- H5 **Bank file: CSV** (QuickBooks Online, Zoho): a header row anywhere in the first lines or none;
  amounts as one signed column, a deposits and a withdrawals column, or an amount and a type; the
  agency's mapping remembered. Lines already imported are skipped. Only deposits are matched.
- H6 **Suggestions, confirmed by a person** (SPEC §14), in Stripe's order: an invoice number (or
  PO) in the description; else a group of one to five of a client's open invoices that add up
  exactly to the deposit (smallest, then oldest); else the client named in the description with its
  oldest invoices. Confidence High or Medium by Business Central's rules (client named, reference
  matched, one candidate); no suggestion below Medium. Every suggestion says why (explain string).
  Date window 90 days before to 20 days after the deposit for amount-only matches, kept in the
  agency's settings with effective dates.
- H7 **Days to pay** (Xero, QuickBooks Desktop): for each invoice paid in full by payments in the
  last 365 days, the days from its issue date to the date of the payment that paid it off; the
  simple average, rounded half up once, shown with the count; average days late beside it.
- H8 **Reminders** (QuickBooks Online manual reminder; FreshBooks variables): from an open invoice,
  a message from the template for its stage (before due, overdue, final at 30+ days overdue), in
  English or Spanish, editable, then **Copy** or **Open in email app** (mailto). Shiftbook sends
  nothing; the day a reminder was prepared is recorded and shown.
- H9 **Roles:** Owner and Billing record payments, import and post bank lines, write off; everyone
  else sees receivables read only.
- H10 **Sidebar:** Receivables (G then R), Payments (G then Y), Bank (G then B).
- H11 **Demo:** the bank import page offers a sample bank file made from the demo agency's open
  invoices (one exact payment naming its invoice, one short payment naming the client, one
  deposit that is not a client's, one withdrawal) — invented data, no outside calls.

## Open questions (for the owner when convenient; from the research)
- Do any clients pay a factoring company instead of the agency?
- Below what amount should a small shortfall just be written off?
- Which bank's activity download does the agency use (a sample with fake numbers would help)?
- Days to pay: from the invoice date (as now) or from the due date?
- An invoice nothing was ever paid on (a client that closed): written off as bad debt from its page, or only after a payment (as now, decision 0019)?
