# Pattern: Members (`/settings/members`)

Status: adopted — slice (k) plan, decisions K1 and K4 (2026-10-16, under the owner's "just keep going")
Reference product and screen: Linear — Settings › Members (all active and suspended members; filter
by role or by status — pending invites, suspended; a row's overflow menu (⋯) holds "Change role…"
and "Suspend user…"; suspended people lose access at once and stay listed; "Invite" opens: email,
"Invite as…" role, "Send invites"); Stripe — Team (Add member, roles to choose with what each can
do, "Send invites"; invites expire after 10 days; overflow (⋯) → Edit to change a role); GitHub —
the people list's two-factor filter, and invitations that can be cancelled or sent again
Source URL: https://linear.app/docs/members-roles
Source URL: https://linear.app/docs/invite-members
Source URL: https://linear.app/docs/profile
Source URL: https://docs.stripe.com/get-started/account/teams
Source URL: https://docs.github.com/en/organizations/keeping-your-organization-secure/managing-two-factor-authentication-for-your-organization/viewing-whether-users-in-your-organization-have-2fa-enabled
Source URL: https://docs.github.com/en/organizations/managing-membership-in-your-organization/inviting-users-to-join-your-organization
Source URL: https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/sudo-mode
Researched: 2026-10-16 (`docs/research/roster-audit-language-slice-k.md` §3, §5); the list's layout
from Linear's own Members screenshot on linear.app/docs/invite-members (2026-10-17). Confidence: high
for the list, the filters, the row menu and the invite dialog's fields.

## Purpose in Shiftbook
The agency's people and their roles (SPEC §2). Only the Owner invites, changes roles and suspends;
everyone else sees the list.

## Hierarchy
The page's frame as the other settings pages (`_components/settings.md`); the list as Linear's Members
screenshot (linear.app/docs/invite-members): the search and filters at the left and Invite at the right
on one line, then one row per person with hairlines between them, no box.
1. **Page header:** "Settings" above, H1 "Members"; for anyone but the Owner, the muted line under the
   title says only the Owner manages members (the read-only notice of `page-header.md`).
2. **One line over the list** (Linear): a search box for name or email; **Filter** (Linear: role or
   status; GitHub: two-factor), a menu of **Role** (All, Owner, Coordinator, Billing, Accountant) and
   **Status** (All, Active, Invited, Suspended); each filter in use as a chip with × (Linear's applied
   filters); then how many people are shown; **Invite** (primary; the Owner only) at the right.
3. **The list**, one row per person, sorted by name (Linear's member rows): their **initials** in a
   circle; **name** (and "You" for oneself) over their **email**; **role** over the authenticator
   ("Authenticator on" / "off", and "Authenticator needed" as a warning when the role needs one and it
   is off); **status** badge (Active, Invited, Suspended) over when they were **last seen** ("Never
   signed in"), or for an invite when it expires ("invite expired"); the overflow menu (⋯) at the end.
   On a phone the role joins the email line and the authenticator column is not shown.
4. **Row overflow menu (⋯)**, the Owner only (Linear):
   - Active or suspended: **Change role…** (a dialog with the four roles and their lines; Save) ·
     **Suspend…** / **Restore access** (a confirmation; suspension signs them out at once). Not on
     oneself; the last active Owner can be neither suspended nor given another role.
   - Invited: **Send invite again** · **Cancel invite** (a confirmation) · demo only: **Open the
     invite email** (the copy from the demo mailbox, with its link).
5. **Roles** section under the list (Stripe: what each role can do), as a settings panel of rows: each
   role's name over its one line.
6. **Invite dialog** (Linear Invite; Stripe Add member): **Name**, **Email**, **Role** (radio list
   with each role's line), **Language** of the email and their screens (English, Español),
   **Send invite**. The line under the title: the invite works for 10 days (Stripe).

## Interactions
- Every change (invite, send again, cancel, change role, suspend, restore) first asks the Owner to
  confirm it's them when they have not given their password or a code in the last 15 minutes
  (GitHub's sudo mode covers organization invitations and roles; `_components/confirm-access.md`).
- Filters and search narrow the list as they change; a chip's × removes its filter.
- Send invite → the dialog closes, a toast, the person appears as Invited. Demo: the toast offers
  **Open the invite email**.

## States
- No one matches the filters: a line saying so with **Clear filters**.
- The email already belongs to someone: a message under the Email field.
- Not the Owner: no Invite button and no row menus; a line says only the Owner manages members.
- Saving: buttons show they are working.

## Look (checked against Linear's Members screenshot, 2026-10-17)
Rows at least 60px with a hairline between them across the column, no box (Linear's members); the
initials 32px; the name 14px medium over the email 13px muted; role and status columns 160px and 192px;
the ⋯ menu a 32px ghost button. Remaining differences: Linear shows a photo where Shiftbook shows
initials (Linear's own default avatar is the initials, linear.app/docs/profile); Shiftbook shows more per
person (authenticator, last seen) in two-line columns where Linear shows name, email and role on one line.

## Related
- The agency's single sign-on is its own page beside Members in the agency menu
  (`settings/sso.md`, decision 0033), as Linear keeps it under Security and Notion under Identity.

## Never copy
Linear's, Stripe's or GitHub's wording, icons, colors or logos.

Deviations allowed: none
