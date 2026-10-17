# Agency setup (completeness audit G1) — sources

Fetched 2026-10-17. Confidence: high where a product's own help page states it.

## Why
The completeness audit found that an agency that signs itself up (slice m) cannot add clients,
worksites or branches, has no business details or time zone, and gets no pay periods: only the demo
seed made them. This slice adds those screens, each copied from a product's documented flow.

## Stripe — Customers (the client list and record)
Source URL: https://docs.stripe.com/invoicing/customer
- "Click **Add customer**, or press **N**, on the **Customers** page … At a minimum, enter your
  customer's **Name** and **Account email** … Click **Add customer** in the dialog."
- Edit: "In the account information page, select **Actions** > **Edit information** … Click
  **Update customer**."
- Delete: from the customer's page, **Actions** > **Delete customer**. (Granite archives instead —
  runs, invoices and receivables name the client — and refuses while workers are still placed there.)
- "Use the address attributes to set a billing address for invoicing and credit notes … Invoices,
  credit notes, and receipts display the billing address."

## Gusto — company details and locations (the agency's details; worksites)
Source URL: https://support.gusto.com/article/106622257100000/edit-company-details-for-admins
- "A company location can be any address where your employees work … If you've added a new company
  location, enter it in Gusto." **Add location** → "Enter the new work address."
- "The address should be a physical location in the US and not a PO Box."
- Editing: from the location's "three-dot" menu, **Edit company location**; **Deactivate this
  location**. "If you still have employees actively working at an address, you will not be able to
  edit the address … If the employee used to work at that address, the address cannot be edited."
  Granite: a worksite's state, county and place (which decide its wage rules, decision 0008) are
  fixed once hours were worked there; a move is a new worksite; a site with workers placed cannot be
  archived.
- "Your company phone number must be a US-based number."

## Linear — settings pages (Settings › Agency, Settings › Branches, the pay week row)
Already the base of every settings page (`docs/patterns/_components/settings.md`, decision 0029 rule
11): one centred column, sections with a heading and a muted line, rows in a bordered panel; a list's
add action at the heading's right; forms in a padded panel with Save in its foot.

## Census place codes
Source URL: https://www2.census.gov/geo/docs/reference/codes2020/national_county2020.txt
Source URL: https://www2.census.gov/geo/docs/reference/codes2020/national_place2020.txt
3,235 counties; 19,726 incorporated places (census-designated places left out: they make no
ordinances; a worksite there is "outside any city or town"). Bundled in `src/server/places/`.

## The pay week
29 C.F.R. § 778.105: the workweek is "a fixed and regularly recurring period of 168 hours"; it "may
be changed if the change is intended to be permanent and is not designed to evade the overtime
requirements". Granite lets the day change only before any hours are filed or any run is made, and
says so; later, weeks already counted would no longer line up.
