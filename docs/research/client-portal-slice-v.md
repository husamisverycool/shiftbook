# Research V: Client portal (invoices, pay, remittance, request staff)

Prepared 2026-10-17 for the client portal slice (Slice V). Scope: what a staffing agency's client
sees when they log in: home, invoice history with PDF download, paying, payments/remittance, AR
aging, and a "request staff" form, plus order-request approval.

## How to read this

- **Source quality.** All pages fetched live on 2026-10-17 with Firecrawl. **High** = official
  page read in full; **Medium** = search excerpt or a partly rendered page; **Unverified** = not
  found publicly.
- **Stripe's live demo portal** (entry: https://billing.stripe.com/customer-portal-demo) was
  rendered; it redirects to a test session. Session URLs are not recorded here.
- Help-center screenshots were not viewed; staffing portal form fields that exist only in images
  are marked unverified.
- We copy hierarchy and interactions, never wording, names, icons or colors.

---

## 0. Summary

| Granite portal piece | Primary pattern | Supporting pattern |
|---|---|---|
| Portal shell (nav + home) | **Stripe customer portal** (left column: business back-link, 3 nav items, footer links; main: greeting + cards) | TempWorks WebCenter dashboard (tab nav, messages, record-type tiles, profile menu) |
| Invoices list | **TempWorks WebCenter Invoices tab** (quick filters Unpaid/Paid, More filters, row menu, side-panel detail with prev/next, Print/Download) | Avionté invoice columns; Stripe "History" empty state |
| Invoice detail / pay | **Stripe hosted invoice page** (view details, amounts, status; pay; download invoice and receipt PDFs) | Bill.com portal pay form (pay from, account, pay on date, editable total for partial pay) |
| Payment methods | **Stripe portal Wallet** (payment methods list with default badge + add; billing profile sections) | Bill.com gear menu (bank accounts, cards; private flag; delete-then-add instead of edit) |
| Payments / remittance | **Avionté Payments sub-page** (check number row expands to the invoices it paid) | Remittance-advice field norms (Corpay, HighRadius) |
| AR aging (client view) | **Avionté AR Aging sub-page** (outstanding invoices in aging buckets, click through) | n/a |
| Request staff | **Instawork "Book Pros" wizard** (staffing type → worksite → schedule → positions → attire → instructions → choose staff → pricing → confirm) | TempWorks "Create Job Order Request" + approval chain; Avionté New Order (Temporary vs Direct Hire) |
| Order list + approvals | **TempWorks Job Orders tab** (quick filters incl. Pending Approval, side-panel details, Approve / Reject-with-comment) | Avionté Job Orders / Assignments |

---

## 1. Stripe customer portal

- **Sources:**
  - Overview + features (High): https://docs.stripe.com/customer-management
  - Configure the portal (High): https://docs.stripe.com/customer-management/configure-portal
  - Deep links and flows (High, via query extraction): https://docs.stripe.com/customer-management/portal-deep-links
  - Live demo (High, rendered): https://billing.stripe.com/customer-portal-demo
  - Hosted invoice page (High, via query extraction): https://docs.stripe.com/invoicing/hosted-invoice-page

### Feature list (documented)
- Update billing information including tax IDs; update payment methods; update or cancel
  subscriptions; "Pay, download, and view current and past invoices".
- **Invoice-only support**: the portal works for standalone invoices (no subscriptions).
- Sessions are short-lived: "New portal sessions expire after a 5 minute period. If a customer uses
  it within that time period, the session expires within 1 hour of the most recent activity."
- Cannot be displayed inside an iframe. Localized by browser language.
- Configurable: invoice history visible (default on); billing information fields (name, email,
  billing address, phone on by default; shipping address and tax ID off by default); payment
  methods; headline; terms link; default redirect link (enables a "return to business" link);
  business name.

### Regions (rendered demo, top to bottom / left to right)
1. **Left column:** back link to the business (with business logo), then three nav items:
   **Overview**, **Wallet**, **History**; customer name below; footer with "Powered by", Terms,
   Privacy. On narrow screens the same column stacks above content (layout responsive; exact
   collapse behaviour unverified).
2. **Overview (main):** greeting heading; "Active plans" section with a card per subscription
   showing plan name, interval, amount due with date, and the payment method (brand + last 4).
   For an invoice-only customer this would be open invoices (unverified; not in demo).
3. **Wallet:** "Payment methods" heading with an **Add payment method** action; each method row
   shows brand, last 4, a **Default** badge and expiry. "Billing profile" with an Edit action and
   sub-sections: personal information, billing address, shipping address, tax ID, each with an
   empty-state line when blank.
4. **History:** heading; **empty state** = a short title and one sentence saying invoices will
   appear here. Populated rows not observed (demo had none); per docs each invoice can be viewed,
   paid and downloaded.

### Deep links / flows (useful for email links straight to an action)
- `payment_method_update`, `subscription_cancel`, `subscription_update`,
  `subscription_update_confirm`, `customer_update` (billing address, tax ID).
- After completion: redirect to your URL, a hosted confirmation page, or back to portal home.

### Hosted invoice page
- Shows "the details, amounts, and status of the invoice"; customer can "Pay the invoice using any
  of the enabled payment methods" and "Download PDF copies of the invoice and receipt". Shows the
  business's public contact info.
- **Link expiry**: "Invoice URLs expire 30 days after the due date ... never longer than 120 days";
  an expired link shows a page telling the customer to contact the business, with contact info.
  Granite should mirror this as an "expired link" state, not a 404.

---

## 2. Bill.com customer portal

- **Sources:**
  - Portal accounts: what the customer sees (High; rendered with wait): https://help.bill.com/direct/s/article/360000022643
  - Receivables via the Customer Portal (High): https://help.bill.com/direct/s/article/360000024926

### Entry
- Emailed invoice → "pay electronically" button → create portal account (password) → accept terms.
- **No account yet** path: the customer proves the invoice by entering: name as on invoice, ZIP,
  invoice #, due date, amount due; then email + password; then terms. (Good pattern for a
  first-time client contact with no login: verify against invoice facts, never ask for secrets.)
- Branded web address; returning users log in there.

### Home and pay
- Home has **Pay Outstanding Bills** and an **Auto Pay** entry.
- Pay form fields (exact list): **Pay From** (method type), **Choose account**, **Pay On** (debit
  date), **Total Payment** (defaults to full amount; customer can lower it for a partial payment),
  then **Pay**. A confirmation email follows.
- Portal shows **all** invoices created for that customer, emailed or not.
- Gear menu: bank accounts and credit cards; add; delete. "Bank accounts cannot be edited" (delete
  then add). A **private** checkbox hides a bank account from colleagues sharing the portal.
- Multiple customer accounts under one email: switch via the name in the upper-right.
- Features list: logo, custom URL, shared documents attached to invoices, notes back and forth,
  ACH/card as enabled by the business, Auto Pay on due date.

---

## 3. TempWorks WebCenter customer portal (staffing-native)

- **Sources (High):**
  - Home tab: https://kb.tempworks.com/help/customer-portal-the-home-tab
  - Invoices: https://kb.tempworks.com/help/customer-portal-invoices
  - Create and submit orders: https://kb.tempworks.com/help/customer-portal-how-to-create-and-submit-orders
  - Legacy create/submit orders: https://kb.tempworks.com/help/wc---customer-portal---how-to-create-and-submit-orders
  - Article index (titles, Medium): https://kb.tempworks.com/help/customer-portal

### Home (Dashboard)
- Regions listed by the doc: **Tab navigation** (left side), **Messages** (see, reply, send new),
  **Record Types** (tiles that open all records of a type), **Personal information** via the
  profile icon top-right: email, password, theme, notification preferences.
- Access is per-tab; missing tabs are explained as "contact your staffing partner".

### Invoices tab
- **Quick Filters** for Unpaid / Paid; **More Filters** reveals all filters; **Search** applies.
- Open detail by **double-clicking a row** or via a row icon menu → Details; detail opens in a
  **side window**; arrows at the bottom move to previous/next invoice and show position in list.
- **Print/Download** in the detail; also available from the row menu (Print or Download); opens
  in a separate window.

### Job Orders tab
- List of orders ("requests for staff") with basic info, who is assigned, status. Quick filters
  change the set. Double-click or row menu → Details opens a right sidebar with prev/next arrows.
- **Candidates** button (enabled only when candidates exist) opens a list where the client can set
  approve / reject / interview with comments, then Save. If none, the button is disabled and the
  client is pointed to assignments.
- Reports tab mentions **Open Order** and **Order Fill Ratio** reports (titles only, Medium).
- **Create Job Order Request** button top-right → "New Job Order Request" window → submit. Field
  list is shown only in a screenshot ("fields ... may be different", configurable per agency):
  **unverified**.
- **Approval chain**: approvers preset by the agency or chosen per request from a dropdown;
  approvers get email; they filter by Review + Pending Approval; open detail; **Approve** (shows a
  confirmation screen) or **Reject** (requires a comment).

---

## 4. Avionté (Classic) customer portal

- **Source (High):** https://avionteclassicsupport.zendesk.com/hc/en-us/articles/360045869733-Customer-Portal-Overview

### Top menu and sub-pages
- Home (Summary: announcements, counters with View, messages), Messages, Documents (add document
  with type + file), Update Account.
- Job Orders (list keyed by Order ID → detail), Assignments (by Assignment ID), **New Order**:
  pick customer (if several), then choose **Temporary** or **Direct Hire**, then fill the form,
  Create / Cancel.
- Candidates (search, expand an order, change candidate status, Update).
- **Invoices → Summary**: columns "invoice numbers, departments, invoice date, invoice due date,
  invoice amount, balance, and PO number (if applicable)"; click to view; Print.
- **Invoices → Payments**: "Click the '+' icon next to the check number to see additional check
  information"; click an invoice number to preview. This is the staffing-native **remittance view**:
  payment row (check number) expands to the invoices it settled.
- **Invoices → AR Aging**: outstanding invoices separated into aging categories; click to drill in.
- Time Entry (approve / submit / reject), Reports (none by default), Log Off.
- Visibility of each area is configured per contact ("IsVisible" per section).

---

## 5. Instawork "Book Pros" (request staff)

- **Source (High):** https://help.instawork.com/en/articles/4819315-how-do-i-post-a-shift

### Wizard steps (in order) and fields
1. **Staffing type:** short term (one-off, spikes, last minute) vs long term (over a month, same
   people).
2. **Worksite:** new or existing location (existing pre-fills everything). Fields: address, location
   name, parking/location details, meeting spot (drag map pin), geofence (polygon), onsite contact.
3. **Schedule:** date(s), start, end, break length; internal **shift name**; "+ Add schedule" for
   several schedules in one posting; a **recurring schedule** toggle.
4. **Positions:** search, Add, edit icon to change.
5. **Attire and grooming:** presets or custom (top, bottom, footwear, accessories); items provided
   onsite; restrictions; free-text extra.
6. **Instructions:** required abilities; job duties; free-text extra.
7. **Choose staff:** auto-assign (own roster first, then top workers, then all qualified;
   recommended), request from roster (hand-pick), open to all.
8. **Pricing:** hourly rate shown at top; optional bonus for top workers; tips flag.
9. **Confirm:** estimated total (final based on actual hours), payment method, **save for later**
   (one draft at a time), **save as template**; primary submit.
- Entry point: a primary button top-right of the dashboard. Advice to post 7-10 days ahead.

---

## 6. Remittance advice norms

- **Sources (Medium, vendor blogs; not product docs):**
  - Corpay: https://www.corpay.com/resources/blog/remittance-advice
  - HighRadius: https://www.highradius.com/resources/Blog/what-is-remittance-advice-how-do-you-use-them/
  - Stampli: https://www.stampli.com/resources/remittance-advice-best-practices/
- Agreed fields: payer name and account/vendor ID; payment amount; payment date; payment method
  (check, ACH, wire, card); **payment reference** (check or trace number); then one line per
  invoice: invoice number, invoice date, gross amount, discounts/credits, short-pay or disputed
  amount **with a reason code**, net amount applied.
- Corpay: the two fields suppliers ask about most are the payment reference and deduction reasons.

---

## Recommended hierarchy for Granite

### Portal shell (`/portal`)
- Left column: agency name/back link, nav **Overview · Invoices · Payments · Orders · Account**,
  contact name, footer links (Stripe customer portal shell; extra items from TempWorks/Avionté tab
  sets). On phones the column becomes a top bar (Stripe responsive; exact behaviour unverified).
- Overview: greeting; **balance card** (open total, overdue total, next due) and an "open invoices"
  card list with pay action (Stripe overview card pattern applied to invoices); messages panel
  (TempWorks Messages); counters with View links (Avionté Home counters).

### Invoices (`/portal/invoices`)
- Quick filters **Unpaid / Paid / All** + "More filters" (TempWorks) · columns: invoice #, week
  ending / department, invoice date, due date, amount, balance, PO # (Avionté column set) · row
  menu: View, Download PDF (TempWorks) · double-click/Enter opens a **side panel** with prev/next
  (TempWorks) · empty state: title + one sentence (Stripe History).
- Invoice detail: details, amounts, status; Pay; download invoice PDF and receipt PDF (Stripe hosted
  invoice page) · expired/invalid link state with agency contact info (Stripe expiry behaviour).
- Pay form: method, account, pay-on date, amount defaulting to balance and editable for partial
  pay (Bill.com) · confirmation email (Bill.com).

### Payments / remittance (`/portal/payments`)
- One row per payment: date, method, reference (check/trace #), amount; expand to see invoices
  settled (Avionté Payments "+" expand) · each child line: invoice #, invoice date, gross,
  deductions with reason, net applied (remittance norms) · download remittance PDF/CSV (norms).
- Client-side AR aging tab: buckets, click through (Avionté AR Aging).

### Account / Wallet (`/portal/account`)
- Payment methods list with default badge, expiry, Add (Stripe Wallet) · no edit of bank accounts,
  delete then add; "private to me" flag (Bill.com) · billing profile sections with empty lines
  (Stripe Wallet) · notification preferences (TempWorks profile).
- First-time access without login: verify by invoice #, ZIP, due date, amount due, then set
  password and accept terms (Bill.com no-account path).

### Request staff (`/portal/orders/new`)
- Stepper: type (temp vs direct hire / short vs long) (Avionté + Instawork) → worksite (saved
  sites pre-fill; meeting spot; onsite contact) → schedule (dates, start/end, break, several
  schedules, recurring toggle) → positions + headcount → attire/safety gear → duties/requirements →
  preferred workers (auto, from our roster, open) → review with **estimated** total → submit;
  save draft and save as template (all Instawork).
- Orders list: quick filters incl. **Pending approval**; side-panel detail with prev/next; Approve
  with confirmation, Reject with required comment; approver chosen per request or preset
  (TempWorks) · Candidates action disabled when none (TempWorks).

### Gaps
- No public screenshot-free text for TempWorks/Avionté order-request field lists (unverified).
- Stripe portal populated invoice-history row layout not observed (demo had no invoices).
- Bullhorn client portal docs are not public (only a marketing blog was found); not used.
