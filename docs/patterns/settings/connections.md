# Pattern: Settings › Connections (`/settings/connections`)

Status: adopted — slice (s), decision 0040 (2026-10-17)
Reference product and screen: Zapier — App Connections page (Connections and Apps tabs; each
connection's name, app, what uses it, last modified; a status of active or expired; a row menu with
Test, Reconnect, Rename, Replace and Delete); Stripe — the apps catalogue (grouped by category, each
entry a name and one sentence of what it does) and installed apps (administrators install and
remove, everyone uses); Linear settings for the page's look (`_components/settings.md`)
Source URL: https://help.zapier.com/hc/en-us/articles/8496290788109-Manage-your-app-connections
Source URL: https://help.zapier.com/hc/en-us/articles/8496258785421-Connect-your-app-accounts-to-Zapier
Source URL: https://docs.stripe.com/use-stripe-apps.md
Source URL: https://support.stripe.com/questions/who-can-use-stripe-apps-on-my-account
Source URL: https://linear.app/docs/api-and-webhooks
Source URL: https://support.ramp.com/how-to-automatically-forward-receipts-to-ramp
Source URL: https://support.ramp.com/submitting-receipts-memos-and-accounting-for-your-ramp-transactions
Researched: 2026-10-17 (`docs/research/connections-exports-slice-s.md` §1–2; the forwarding address
`docs/research/forwarding-email-slice-y.md` §3, decision 0042). Confidence: high for
Zapier's columns, statuses and row menu and Stripe's catalogue; the look follows Tabulado's settings
pages (decision 0029 rule 11).

## Purpose in Tabulado
One place to see every system Tabulado exchanges files with — recruiting systems' placement files,
the payroll system's file, time clocks and VMS files, invoice uploads, and (slice w) partners — what
each is used for, when it was last used, whether it is ready, and where to set one up.

## Hierarchy
1. The settings page header: "Settings" above the title **Connections** (decision 0029 rule 2).
2. **Tabs** (Zapier: Connections | Apps): **Connected** with its count · **Available**.
3. **Connected** opens with the **forwarding address** (decision 0042; Ramp's Profile settings ›
   Receipt forwarding), three sections 48px apart:
   - **Forwarding address**: heading, one muted line (what to send and where it goes), and at the
     heading's right in the demo **Send a test email**; one row — a mail tile, the address in a code
     chip with a copy button (the check for a moment after copying, decision 0037), the demo's note
     under it, and at the right **New address** (Owner) with a confirmation that the old one stops.
   - **Accepted senders** (Ramp's list of forwarding emails with a plus): heading, one muted line, at
     the right **Add sender** (Owner); one row per address or @domain with a remove button; empty: one
     muted row "Anyone who has the address"; adding opens one field with Add and Cancel, a wrong value
     said under it.
   - **Recent emails** (the last 20, newest first): the subject over a muted line (from, when), each
     file with what happened to it (Added · Already added · Waiting · Not a timesheet file · Too large
     · Over 10 files), a refusal's reason; at the right **Open the week** for a filed one and the
     status badge (Filed = success, Needs a week = warning, Not taken = neutral). A held email shows
     why and a week chooser with **Add to week** (hours ability). Empty: one muted row.
4. Then the connections: one panel of rows (Linear's rows; Zapier's columns as the row's lines): a 32px
   tile with the kind's icon; the connection's name over one muted line — its kind (Recruiting
   system · Payroll system · Time file · Invoice upload · Partner) and when it was last used, or
   "Not used yet" (Zapier: last modified); at the right the status badge (`_components/status.md`:
   Ready = success; Needs attention = warning, with the reason as the row's second line) and a ⋯
   menu (Zapier's row menu). Rows are grouped in this order: Payroll system, Recruiting systems,
   Time files, Invoice uploads. An empty Connected tab is one muted row pointing to Available.
5. **Available** (Stripe's catalogue): one section per category — Payroll systems, Recruiting systems,
   Time clocks and VMS, Partners — each a heading with one muted line and a panel of rows: the
   system's name over one sentence of what Tabulado exchanges with it, and at the right **Set up**
   (a link to where it is set up) or "In use" for one already connected, or "Not available yet"
   (muted) for one Tabulado cannot read yet. Each VMS (Fieldglass, Beeline, Coupa, Magnit; decision
   0043) is available, with **Edit columns** for those who may.

## Interactions
- ⋯ menu per connection (Zapier): **Test** (Tabulado checks the connection now and says Ready, or
  what needs attention, in a message — payroll: the settings, the codes and every active worker's
  id; recruiting: the saved mapping still names every required field); **Open** (its settings or
  import page, Zapier's "edit"); **Download template** for a recruiting system; **Forget saved
  mapping** for a recruiting system, with a confirmation (Zapier's Delete: "automations that use it
  must be repointed" — here: the next import maps columns again). No Rename: Tabulado names each
  connection after its system.
- **Edit columns** (a VMS row's ⋯ menu, or its Available row; decision 0043; Zapier's field mapping
  as "the column in your file" per field): a dialog with one field per Tabulado field holding the
  column name in the agency's export (optional fields may be left empty), the statuses that count
  (comma separated), and the date format; **Save** keeps a new version (the next file is read with
  it), **Restore** brings back the usual names, **Cancel**. A missing, duplicated or invalid name
  is said under its field. Owner and Coordinator (the hours ability).
- Who changes what (Stripe's installed-apps rule): everyone sees the page; Forget saved mapping is
  the placements ability's; the payroll system is changed on Payroll settings by those who may.
- Tabs keep their place in the address (`?tab=available`).

- **Partner packages** (Available › Partners; slice w, integration): each row says when a package was
  last recorded and how many, or that nothing is recorded yet; **Open** goes to its Money page
  (Payroll, Wage access, Funding, Insurance). Nothing moves in Tabulado.

## States
- Loading: the settings outline (`_components/loading.md`); failure: `_components/error.md`.
- Forwarding address not set up (live without INBOUND_EMAIL_DOMAIN): the row says so in place of the
  address; nothing else changes.
- A partner row says partner handoffs arrive with the partner-ready money flows (SPEC §27 item 9).

## Never copy
Zapier's or Stripe's wording, icons, colors or illustrations.

## Loading and errors (slice o)
- Loading: the page's outline in the settings shape (`_components/loading.md`); buttons that start
  work show a spinner in place of their icon (Primer Button `loading`).
- A failure: the frame stays; the failed content's place says so with "Try again"
  (`_components/error.md`).

Deviations allowed: none
