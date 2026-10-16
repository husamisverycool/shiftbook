# Slice k: reference research notes (fetched 2026-10-16)

Rule followed: every URL listed under "Fetched" was fetched and read in this session. Pages that
were blocked are named by domain only and are **not** usable as citations.

## 0. Access problems (read first)

- **Gusto** (support.gusto.com, gusto.com): every request returned a Cloudflare "Just a moment..." 403
  page. Nothing from Gusto was read, so **Gusto cannot be cited** from this environment.
- **Rippling** (help.rippling.com): a Salesforce site that only renders with JavaScript. Its public
  sitemap lists 13 shell pages and no article URLs. No help article was readable. Only two rippling.com
  marketing pages were read (below), and they are low-detail.
- Also blocked with 403: Justworks help, Mercury support, California leginfo, Justia. Two pages
  returned 404: a Notion "language-and-region-settings" page and a Linear "adding-and-managing-members" page.
- **Effect:** SPEC's named references for the Workers screens (Rippling People, Gusto People) can't be
  backed by any documentation we read. Toast Payroll (below) is the best-documented replacement, and the
  owner's 2026-10-15 rule allows any publicly documented product.

---

## 1. Workers directory (list) and worker profile

### 1a. Toast Payroll: Team page (list). Confidence: HIGH
Fetched:
- https://intercom.help/toast-central/en/articles/14726296-toast-payroll-team-page
- https://intercom.help/toast-central/en/articles/15695452-toast-payroll-employees-missing-from-team-page

Hierarchy and interactions:
- The page is reached from the app's "Team" navigation item. Header: an always-visible "Search employees" bar.
- Top-right controls: a primary "+Add employee" button, a "Filters" control, and an "Invite" button
  for bulk actions.
- Table: a checkbox column on the left. The "Name" column also shows the phone number. A Job column
  shows the job, with "+1, +2" when a person has more than one. A "Display position" toggle switches it to position.
- Each row has an envelope icon (send invite) and a three-dot menu of row actions.
- Default filter: "Active employees appear on the Team page by default." Under "Filters", Status has
  checkboxes for "Leave of Absence" and "Terminated employees", plus an "Employees per page" setting.
- Statuses hidden from the list are still reachable by search: "Dormant, Pending Active, or Never
  Employed" people are found only through "Search employees". This means search covers more than the list does.
- Bulk select: the checkbox on the "Name" header selects all eligible rows **on this page only** and
  combines with the active filters. Clicking Invite opens a confirmation ("Send # invites"), and people
  without an email address are left out.
- Error/alert state: a red banner with "Learn more" appears when profiles are unmapped. Those rows carry an
  "Unpaid Employee" tag.
- The "missing person" article (symptom → cause → fix) is a good model for our "no results" state.

### 1b. Toast Payroll: employee profile and audited SSN reveal. Confidence: HIGH
Fetched:
- https://intercom.help/toast-central/en/articles/15483757-toast-payroll-update-employee-profile-information
- https://support.toasttab.com/en/article/Toast-Payroll-How-to-Make-Changes-to-an-Employee-s-Personal-Profile?lang=en_US (the same article)

Hierarchy:
- The record has tabs at the top: **Profile** and **Employment** (there is also a Profile > User Account page).
- The Profile tab has "separate sections for personal information, emergency contacts, employment status,
  and SSN, each with its own Edit control". The edit flow is per section: Edit → change fields → save, and
  the change "appears in that section of the profile right away".
- Employment tab: a "Status" tile with a ">" icon that opens a "Status Change wizard" (terminate, rehire, leave).
- Some fields are read-only for admins: name, Form W-4, and (after unified login) email and phone "are updated
  by the employee". The FAQ explains why the Edit button is missing (the field is employee-owned, or the user lacks the role).
- Profiles cannot be deleted. People are terminated or archived instead, and their records are kept.

**SSN reveal (the key pattern):**
- Steps: Profile tab → "**Retrieve SSN**" link → "Confirm the action is for business purposes" →
  "view (eyeball) icon" displays the SSN.
- Quote: "anyone who views or edits an SSN is tracked and listed on the Retrieve SSN pop-up, so you can
  also use this link to audit SSN activity for an employee."
- Expected outcome: "The SSN displays, and your view is recorded on the Retrieve SSN pop-up."
- Validation: a new SSN won't save if it is already on another profile. Toast treats an SSN as invalid if it
  "starts with 9, 000, or 666, has middle digits of 00, ends in 0000". **Conflict to flag:** our test SSNs
  are all 9xx, so a validator built like Toast's would reject every test number.

### 1c. Square: Team members (list and profile). Confidence: MEDIUM
Fetched: https://squareup.com/help/us/en/article/6455 and https://squareup.com/help/us/en/article/5591
(both are "Add and manage team members").
- List page: Staff > Team > Team members. "Export" lets the user choose fields and downloads
  `team-members-YYYY-MM-DD.csv` (account owners only). The article doesn't describe columns, search or filters.
- Profile sections, in order, each with its own "Edit": **Personal information** (name, email, phone) →
  **Permissions** (permission set, locations, access, passcode) → **Job and compensation** (primary job,
  wages & tips, commission).
- Deactivate: "(•••)" → "Deactivate" → confirm "Deactivate". "information isn't lost or deleted", and the
  person can be reactivated. Invitations must be accepted within 30 days.

### 1d. Rippling (marketing pages only). Confidence: LOW
Fetched: https://www.rippling.com/blog/configurable-profiles-launch and https://www.rippling.com/platform/permissions
- Admins can rename and reorder profile tabs. The layout "changes based on who is viewing it". Permissions
  combine "view, edit, and approve" with a scope of people. Neither page describes the list or an SSN reveal.

---

## 2. Audit log

### 2a. Stripe Workbench: Events tab. Confidence: HIGH
Fetched: https://docs.stripe.com/workbench/overview, https://docs.stripe.com/workbench/guides,
https://docs.stripe.com/development/dashboard/events, https://docs.stripe.com/api/events/object (and `?query=data`)
- Layout is two panes: "Click an event in the list on the left to review the event's details, payload,
  and attempted deliveries on the right".
- Filters: "Date of the event", "Delivery status", "Event type" (wildcards allowed, e.g.
  `customer.*`) and "API resource" (e.g. `cus_123`). In Workbench the type filter button is labeled
  "Event type". Each filter ends with an **Apply** button.
- The list does not live-update. A "**Refresh events**" button fetches new events.
- "Copy link" makes a shareable URL of the current filtered view.
- Payload is the event JSON. **Before/after:** `data.previous_attributes` is an "Object containing the names
  of the updated attributes and their values prior to the event (only included in events of type
  `*.updated`)". `request` holds "Information on the API request that triggers the event".
- Events are named `noun.verb`, e.g. `invoice.created` and `charge.refunded`.
- The Inspector shows "Logs" and "Events" tabs for a single object. This is the model for a per-record activity tab.

### 2b. Stripe Workbench: Logs tab (request logs). Confidence: HIGH
Fetched: https://docs.stripe.com/development/dashboard/request-logs
- Inline filters for Date, Status, Method and Endpoint. "More filters" adds **Source (Dashboard or API)**, IP,
  API version and error fields. There is a "Filter by resource ID" text field and a "Refresh logs" button.

### 2c. Stripe Security history and Activity Logs. Confidence: HIGH (API), LOW (UI)
Fetched: https://docs.stripe.com/activity-logs and https://docs.stripe.com/get-started/account/teams
- "Stripe logs the account activity of team members during the past 180 days. To review account
  activity information, go to Security history". The Security history page's columns are **not** documented.
- Useful action names to copy the pattern of: `user_invite_created`, `user_invite_accepted`, `user_roles_updated`,
  `user_two_step_authentication_backup_code_used`, `two_step_authentication_mandate_enabled`, and
  `api_key_viewed` ("When a user reveals the secret…"). **Revealing a secret is an audited event**, as our SSN reveal should be.
- Each entry has "the actor, timestamp, affected resources, and contextual metadata". Retention is 6 months.

### 2d. GitHub organization audit log. Confidence: HIGH
Fetched: https://docs.github.com/en/organizations/keeping-your-organization-secure/managing-security-settings-for-your-organization/reviewing-the-audit-log-for-your-organization
- Location: Settings sidebar → "Archive" → Logs → Audit log. Only owners can view it.
- Each entry shows the organization, the **actor**, the affected user, the repository, the **action**
  (`category.operation`, e.g. `repo.create`), the country, and the date and time.
- Free text search is not supported, only qualifiers: `actor:`, `action:` (a category like `action:team`
  or an exact event like `action:team.create`), `operation:` (access, authentication, create, modify, remove,
  restore, transfer), `repo:`, `country:` and `created:`. A leading `-` excludes a value.
- Dates: `created:2014-07-08`, `created:>=…` and ranges `created:2014-07-01..2014-07-31`. "By default it
  shows only the past three months". Retention is 180 days.
- Export: an "Export" dropdown offers JSON or CSV and **respects the current filters**. Exported keys include
  `action`, `actor`, `user`, `created_at` and `data.*`.

### 2e. Vercel audit log (export and before/after). Confidence: HIGH
Fetched: https://vercel.com/docs/audit-log
- Location: Team Settings > Security & Privacy > Audit Log. Owners only.
- Export flow: pick a timeframe → "Export CSV". The owner receives an email link that is "valid for 24 hours".
- CSV fields: `timestamp`, `action`, `actor_name`, `actor_email`, `location` (IP), `user_agent`,
  `request_id`, **`previous`** ("the object's previous state") and **`next`** ("the object's updated state").
- The log audits its own use (`auditlog.export.requested` and `auditlog.export.downloaded`) and logs
  secret decryption (`shared_env_variable.decrypted`).

### 2f. Linear audit log. Confidence: MEDIUM
Fetched: https://linear.app/docs/audit-log
- Location: Settings > Administration > Audit Log. Workspace owners only, "given the sensitive nature".
- Entry: event type, actor, time, metadata, IP and country. The UI filter is event type only. 90-day retention. No CSV export.

---

## 3. Sign-in, two-step verification and invites

### 3a. GitHub 2FA setup with an authenticator app. Confidence: HIGH
Fetched: https://docs.github.com/en/authentication/securing-your-account-with-two-factor-authentication-2fa/configuring-two-factor-authentication,
.../configuring-two-factor-authentication-recovery-methods, and .../accessing-github-using-two-factor-authentication
- Location: Settings → "Password and authentication" → "Enable two-factor authentication".
- One page with three numbered parts:
  1. "Scan the QR code". A "setup key" link shows the secret as text for manual entry.
  2. "Verify the code from the app": type the 6-digit code.
  3. "Save your recovery codes": a Download button, then "**I have saved my recovery codes**" turns 2FA on.
- Recovery codes: 16 codes with "Download", "Print" and "Copy" options. Each code works once, and
  "Generating a new set … will invalidate any codes you previously generated."
- Sign-in: password first, then a separate 2FA step. It asks again on a new device, a sensitive action or session expiry.

### 3b. GitHub: requiring 2FA for everyone. Confidence: HIGH
Fetched: https://docs.github.com/en/organizations/keeping-your-organization-secure/managing-two-factor-authentication-for-your-organization/requiring-two-factor-authentication-in-your-organization
and .../viewing-whether-users-in-your-organization-have-2fa-enabled
- The owner must have 2FA turned on first. Settings → Authentication security → checkbox "Require two-factor
  authentication for everyone in your organization" → Save.
- A confirmation dialog **lists the people who will be affected**. Members without 2FA keep their seat but
  "cannot access organization resources until they enable 2FA".
- The People list has a "Two-factor authentication" dropdown filter with the options Secure, Insecure and Disabled.
- Removals appear in the audit log.

### 3c. Stripe two-step authentication. Confidence: MEDIUM
Fetched: https://support.stripe.com/questions/enable-two-step-authentication-using-a-mobile-app,
https://support.stripe.com/questions/two-step-authentication-requirement and
https://support.stripe.com/questions/backup-codes-for-two-step-authentication
- Location: Personal details → "Two-step authentication" section → "Add authentication method" → "Use an
  authenticator app" → scan the QR code or choose "Enter code manually" → enter the code to confirm → "Write down the
  backup code".
- Stripe uses a **single** backup code: "It's only displayed once". Creating a new one "will invalidate the
  old code".
- Requirement: admins can "require two-step authentication for everyone" from Team settings. The docs don't
  say whether it can be required per role.

### 3d. Sign-in page options (Linear). Confidence: MEDIUM
Fetched: https://linear.app/docs/login-methods
- Sign-in options are Google, an email magic link or code (with an "Enter code" field), passkey, and SAML (Enterprise).
- Admins can restrict sign-in methods, but owners and admins "can always log in by any method" so they
  can't be locked out.

### 3e. Inviting team members (role picker). Confidence: HIGH
Fetched: https://docs.stripe.com/get-started/account/teams, https://linear.app/docs/invite-members and
https://docs.github.com/en/organizations/managing-membership-in-your-organization/inviting-users-to-join-your-organization
- **Stripe:** Team → "Add member" → one or more emails ("separated by a space or comma") → choose roles
  (a person can hold several) → review → "Send invites". Invites "expire after 10 days". To change a role
  later: overflow (⋯) → Edit.
- **Linear:** Members → "Invite" → emails separated by commas → an "Invite as…" role picker → optional teams
  → "Send invites".
- **GitHub:** People → "Invite member" → pick the role → optional team. The invite can be edited or cancelled
  until accepted, it expires after 7 days, and expired invites move to "Failed invitations" where they can be
  retried. If the org requires 2FA, the invitee must turn on 2FA before accepting.

---

## 4. Per-user language preference

### 4a. Slack. Confidence: HIGH
Fetched: https://slack.com/help/articles/215058658-Manage-your-language-preferences
- Path: profile picture → Preferences → "Language & region" → a "Language" dropdown.
- Spanish appears as two choices: "Spanish (Latin America or Spain)". There is a separate workspace default,
  and some messages "display in your workspace's default language".

### 4b. Notion. Confidence: MEDIUM
Fetched: https://www.notion.com/help/change-your-language
- Settings → Preferences → "Language & Time" → "Language" dropdown, with both Spanish (Spain) and Spanish (Latin America).

### 4c. Square. Confidence: MEDIUM
Fetched: https://squareup.com/help/us/en/article/5234
- Personal setting: Account & Settings → Personal information → Preferences → change language and time zone →
  "Submit".
- It "affects certain Square pages (such as the login page)" and the emails and texts sent to that person.
  A **separate business language** setting exists.

---

## 5. Members / Team settings page

### Linear Members. Confidence: HIGH
Fetched: https://linear.app/docs/members-roles
- Location: Settings > Administration > Members. It lists "all active and suspended members".
- Filter by role or by status (Pending invites, Suspended, Left).
- Row actions appear on hover in an overflow (⋯) menu: "Change role..." and "Suspend user...". Suspended
  people "lose all access immediately" but stay listed for history.
- Roles have one-line descriptions: Admin, Member, Guest (and Owner on Enterprise).

Also see the Stripe Team flow in 3e (overflow → Edit) and the GitHub People 2FA filter in 3b.

---

## 6. Legal facts on SSNs (only sources read)

- **California guidance:** "Recommended Practices on Protecting the Confidentiality of Social Security
  Numbers" from the CA Office of Privacy Protection, Apr 2008 (PDF read):
  https://www.oag.ca.gov/sites/all/files/agweb/pdfs/privacy/ssn_rec.pdf
  - "Limit access to records containing SSNs only to those who need to see the numbers".
  - "Use logs or electronic audit trails to monitor employees' access to records with SSNs."
  - Encrypt stored SSNs. Don't put SSNs on "time cards, employee rosters". Use your own identifier instead of
    the SSN. Don't email an SSN unless the connection is secure or the SSN is encrypted.
  - It summarizes Civil Code 1798.85, which applies to any person or entity. It bans publicly posting or
    displaying SSNs, printing them on ID cards, requiring them to be sent over the Internet unless secure or
    encrypted, requiring an SSN to log in without a password, and printing them on mailings (with some exceptions).
  - The federal laws it lists (FOIA, the Privacy Act, and SSA amendments) cover **government agencies**. None
    of them governs how a private employer's software displays SSNs.
- **California pay stubs:** the DLSE "Pay Days" handout (PDF read): https://www.dir.ca.gov/dlse/PayDays.pdf
  - A stub may show "only the last four digits of their social security number or an existing employee ID
    number". Payroll records must be kept for three years (Labor Code § 1174).
- **New York Labor Law § 203-d:** https://newyork.public.law/laws/n.y._labor_law_section_203-d
  - Employers may not "Publicly post or display" an SSN, print it on an ID badge or card "including any time
    card", or "Place a social security number in files with unrestricted access".
  - The penalty is up to $500 per knowing violation. A violation is presumed knowing if the employer has no policies.
- **Federal (IRS):** https://www.irs.gov/irb/2019-30_IRB (partly read)
  - Employers **may** truncate SSNs to the last four digits on the employee's copies of W-2 (a "TTIN").
    The copies filed with SSA must carry the full SSN.
  - This applies to statements filed after Dec 31, 2020.
- **Design consequences:** no SSN column in the Workers list; the profile shows the last four only; reveal is
  role-limited and audited; the full SSN goes only into exports that SSA or IRS filing requires.

---

## 7. Recommendation summary (10 lines)

1. Workers list: **Toast Payroll Team page**. Rippling and Gusto docs couldn't be read (Cloudflare / JavaScript-only), and Toast's is detailed: search, a Status filter that defaults to Active, bulk select and a row menu.
2. Worker profile: **Toast Payroll profile** (Profile/Employment tabs, an Edit per section, read-only employee-owned fields), plus Square's ordered sections as a secondary reference.
3. SSN reveal: **Toast "Retrieve SSN"**. Steps are confirm business purpose, then the eye icon, then the view is logged and earlier viewers are listed in the same pop-up. This matches CA's audit-trail advice.
4. Audit log list and detail: **Stripe Workbench Events**. List on the left, detail on the right, filters for date, type (wildcards) and resource, and `previous_attributes` for before/after.
5. Audit log search and export: **GitHub org audit log**. Qualifier syntax (actor/action/created ranges) and an Export that respects filters. Vercel's `previous`/`next` CSV columns are a backup.
6. Sign-in: **Linear login page** (method list, code entry), with GitHub's two-step sign-in (password, then a separate 2FA step).
7. 2FA setup: **GitHub**. A single page with three steps: QR plus setup key, 6-digit code, then recovery codes with Download/Print/Copy and an "I have saved" button. It is the most completely documented flow.
8. 2FA enforcement: **GitHub "Require 2FA"**. The confirmation dialog lists who is affected, and the Members list has a 2FA status filter. Stripe only documents an account-wide requirement, not one per role.
9. Members/Team settings: **Linear Members** (filters by role and status, row overflow with Change role/Suspend), with **Stripe Add member** for multi-email invites, a role picker and 10-day expiry.
10. Language toggle: **Slack Preferences > Language & region** (a dropdown with Spanish Latin America and Spain). Square shows that the setting should also apply to login pages and emails.
