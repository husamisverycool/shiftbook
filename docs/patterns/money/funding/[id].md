# Pattern: An invoice's funding packet (`/money/funding/[id]`)

Status: adopted — slice (w) (2026-10-17)
Reference product and screen: Stripe Capital's offer anatomy (the amount received up front, a flat
one-time fee with no compounding interest, what is withheld until repaid) and its approved wording
("prequalified", "if approved", "flat fee"; never "preapproved" or "interest rate"); a factor's
Schedule of Accounts (debtor name and address, invoice number and date, PO, amount; the Compass form
and the SEC-filed definition) and the advance-and-reserve model (Scale Funding); Stripe detail page
(`_components/record-page.md`)
Source URL: https://docs.stripe.com/capital/how-capital-for-platforms-works.md
Source URL: https://docs.stripe.com/capital/marketing.md
Source URL: https://compassfs.net/_Old_Website/scac011.pdf
Source URL: https://www.sec.gov/Archives/edgar/data/1665300/000121390018004257/fs42018ex10-17_stellaracq3.htm
Source URL: https://getscalefunding.com/scale-funding-insights/get-cash-to-run-your-business/
Researched: 2026-10-17 (`docs/research/money-flows-slice-w.md` §2, §6). Confidence: high for the
offer's parts and wording; the hosted Capital page's layout is only an image (unverified).

## Purpose in Granite
One invoice's underwriting packet and the decision under the agency's rules; when eligible, the
offer as a funding partner would make it; submitting records the packet. Nothing is lent.

## Hierarchy
1. **Ancestors** "Money › Funding"; H1 "Invoice {number}"; the decision badge; facts line: client ·
   balance · issued · due.
2. The plain line (no money moves).
3. **Left column**, modules under hairlines:
   - **Offer** (when prequalified; Stripe Capital anatomy): "Prequalified, subject to the funding
     partner's review" then label-over-figure: Advance (bold), Flat fee, Held in reserve, Released
     when the client pays; under it the disclosure placeholder paragraph (the partner's own
     disclosure goes here; the fee is a flat amount, not an interest rate). When not eligible: the
     reasons as a list, each in one plain line.
   - **Schedule of accounts** (the factor's form): one row — Debtor, Invoice, Date, PO, Amount.
   - **Approval trail**: each client decision by link — who, when, shifts approved and disputed; or
     "No approval by link".
   - **Payment history**: invoices paid, average days to pay, average days late.
   - **Risk**: the client's share of all money owed, disputed shifts as a share of shifts decided,
     the aging bucket.
4. **Right column** (label over value): Client, Total, Balance, Issued, Due, Age; **Download packet**
   (JSON); the primary action **Submit to funding partner** (Owner only). Once submitted: Submitted
   (date), By, Fingerprint.

## Interactions
- **Submit to funding partner** opens a confirmation dialog: the advance, fee and reserve, the plain
  line; **Submit packet** / Cancel. Disabled with the reason when not eligible.

## States
- Not eligible, submitted, not found (`_components/error.md`).

## Loading and errors (slice o)
- Loading: the page's outline in the record shape (`_components/loading.md`).
- A failure: the frame stays; the failed content's place says so with "Try again" (`_components/error.md`).

Deviations allowed: none
