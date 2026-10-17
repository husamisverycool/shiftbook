# Pattern: Bank deposits to review (`/bank`)

Status: adopted — slice (h) plan (2026-10-16, under the owner's "just keep going")
Reference product and screen: QuickBooks Online — bank transactions "For review" (each imported
line with a suggested match and its confidence; review, then post; "find other match"; a Posted
tab where a posted line can be undone; Excluded); Stripe — the documented order of automatic
reconciliation (reference, then an exact sum of one to five open invoices, then the oldest);
Microsoft Dynamics 365 Business Central — match confidence rules (related party, document number,
one amount within tolerance); Zoho Books — choosing several invoices for one deposit
Source URL: https://quickbooks.intuit.com/learn-support/en-us/help-article/bank-feeds/match-online-bank-transactions-quickbooks-online/L6qyw0PvP_US_en_US
Source URL: https://quickbooks.intuit.com/learn-support/en-us/help-article/bank-transactions/ai-suggestions-help-match-categorize-bank/L8FHOh4AD_US_en_US
Source URL: https://docs.stripe.com/payments/customer-balance/reconciliation
Source URL: https://learn.microsoft.com/en-us/dynamics365/business-central/receivables-how-set-up-payment-application-rules
Source URL: https://www.zoho.com/us/books/help/banking/matching-transactions.html
Researched: 2026-10-16 (`docs/research/receivables-slice-h.md` §3). Confidence: high.

## Purpose in Granite
Turn the bank's deposits into payments: Granite suggests, a person confirms (SPEC §14, H6).

## Hierarchy
1. **View header:** H1 "Bank"; at the right **Import bank file** (to `/bank/import`).
2. **Tabs** (in the address): For review · Posted · Excluded, with counts (QuickBooks Online).
3. **For review:** one row per deposit not yet posted: date, description, amount, the suggestion —
   client and invoices, with a confidence badge (High, Medium) and the reason in one line — and the
   row's actions: **Post** (primary when there is a suggestion), **Find match**, **Exclude**.
   Withdrawals are listed under Excluded as not deposits.
4. **Posted:** date, description, amount, the payment it became (client, invoices), **Undo**.
5. **Excluded:** date, description, amount, why, **Include** (back to review).

## Interactions
- **Post** records the payment from the suggestion (the date and amount of the deposit, method
  "bank deposit", the description as reference) and applies it; the line moves to Posted.
- **Find match** opens the Record payment dialog (`payments.md`) for the deposit: choose the
  client, tick invoices, amounts editable; what is not applied stays as the client's credit; a
  smaller amount leaves the invoice short-paid.
- **Exclude** asks why (not a client's payment, a transfer, a duplicate, other) (QuickBooks Online
  Exclude).
- **Undo** voids the payment and returns the line to review (QuickBooks Online Undo).
- No suggestion below Medium is shown (QuickBooks Online hides low confidence).
- Keyboard: G then B opens the page.

## States
- **Nothing imported yet:** empty state with Import bank file.
- **Nothing to review:** "Every deposit is posted or excluded."
- Read only for roles other than Owner and Billing.

## Never copy
Intuit's, Stripe's, Microsoft's or Zoho's wording, icons, colors or logos.

## Look (decision 0029, from the products' own screenshots)
For review, Posted and Excluded as underline tabs with counts under the title (Stripe's invoices list tabs); the suggestion's confidence as a tinted badge.

Deviations allowed: none
