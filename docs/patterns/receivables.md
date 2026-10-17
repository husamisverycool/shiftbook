# Pattern: Receivables (`/receivables`)

Status: adopted — slice (h) plan (2026-10-16, under the owner's "just keep going")
Reference product and screen: FreshBooks — Accounts Aging report (one row per client across the
aging columns with totals; a client opens its profile; any amount lists the invoices behind it;
export); QuickBooks Online — A/R Aging Summary and Detail (the columns Current, 1–30, 31–60, 61–90,
91 and over; aged as of a report date); TempWorks — Short Pay Invoices report (invoices that had a
payment and still have a balance)
Source URL: https://support.freshbooks.com/hc/en-us/articles/219118308-What-is-an-Accounts-Aging-report
Source URL: https://quickbooks.intuit.com/learn-support/en-us/help-article/accounts-receivable-reports/run-accounts-receivable-aging-report/L4N7PC2hg_US_en_US
Source URL: https://kb.tempworks.com/help/short-pay-invoices-report
Source URL: https://kb.tempworks.com/help/invoice-aging-report
Researched: 2026-10-16 (`docs/research/receivables-slice-h.md` §1, §6). Confidence: high for the
hierarchy and drill-down (FreshBooks), medium for the exact column labels (QuickBooks Online).

## Purpose in Granite
Who owes the agency what, and how late (SPEC §14, decision H1), and which invoices were paid short
(H4).

## Hierarchy
1. **View header:** H1 "Receivables"; at the right the **As of** date (QuickBooks Online report
   date; default today) and **Export CSV** (FreshBooks "Export for Excel").
2. **Tabs:** Aging · Short paid (TempWorks report), in the address.
3. **Aging tab:** a summary line of the total owed, overdue and credit; then a table, one row per
   client with anything open: client (opens the client page), Current, 1–30, 31–60, 61–90, 91+,
   Total, days to pay; a totals row. Credits (unapplied payments, credit notes beyond what they
   correct) show in Current as negative amounts, so totals tie (Xero detail includes them).
4. **Drill-down:** clicking an amount lists the invoices behind it under the row (FreshBooks): number
   (opens the invoice), issued, due, days past due, total, balance.
5. **Short paid tab:** one row per invoice with a payment and a balance: client, invoice, paid,
   balance, reason (if recorded), last reminder; the row opens the invoice.

## Interactions
- Changing **As of** recomputes from what happened on or before that date (QuickBooks Online).
- Export CSV downloads the aging table as shown.
- Keyboard: G then R opens the page (app frame).

## States
- **Nothing owed:** an empty state saying no client owes anything as of the date, with a link to
  Invoices.
- **Short paid tab empty:** "No short-paid invoices."

## Never copy
FreshBooks', Intuit's or TempWorks' wording, icons, colors or logos.

## Look (decision 0029, from the products' own screenshots)
The summary is set as Mercury's Transactions page sets its figures (https://mercury.com/blog/updated-transactions-page, its first screenshot: the headline figure, then "Money in" and "Money out" as rows under it): the amount owed large with its date under it, then overdue and unapplied credit as rows under it in the same narrow column, each label on the left and its amount on the right, with no line under them (what each means is on its label); Aging and Short pays as underline tabs; the aging table full width as Stripe's lists, an empty amount "—" in the totals row as in the clients' rows.

## Loading and errors (slice o)
- Loading: the page's outline in the dashboard shape (`_components/loading.md`); buttons that start
  work show a spinner in place of their icon (Primer Button `loading`).
- A failure: the frame stays; the failed content's place says so with "Try again"
  (`_components/error.md`).

Deviations allowed: none
