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
Source URL: https://docs.stripe.com/get-started/account/teams
Source URL: https://docs.github.com/en/organizations/keeping-your-organization-secure/managing-two-factor-authentication-for-your-organization/viewing-whether-users-in-your-organization-have-2fa-enabled
Source URL: https://docs.github.com/en/organizations/managing-membership-in-your-organization/inviting-users-to-join-your-organization
Source URL: https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/sudo-mode
Researched: 2026-10-16 (`docs/research/roster-audit-language-slice-k.md` §3, §5). Confidence: high
for the list, the filters, the row menu and the invite dialog's fields.

## Purpose in Shiftbook
The agency's people and their roles (SPEC §2). Only the Owner invites, changes roles and suspends;
everyone else sees the list.

## Hierarchy
1. **Page header:** "Settings" above, H1 "Members"; on the right **Invite** (primary; the Owner only).
2. **Roles** line under the header: the four roles with one line each on what they do (Stripe: what
   each role can do).
3. **Filters** (Linear: role or status; GitHub: two-factor): **Role** (All, Owner, Coordinator,
   Billing, Accountant) and **Status** (All, Active, Invited, Suspended) as selects, and a search box
   for name or email.
4. **Table**, one row per person, sorted by name: name (and "You" for oneself) with the email under
   it; role; status badge (Active, Invited — "expires <date>", Suspended); authenticator (On / Off,
   and "Needed" when the role needs one and it is off); last seen.
5. **Row overflow menu (⋯)**, the Owner only (Linear):
   - Active or suspended: **Change role…** (a dialog with the four roles and their lines; Save) ·
     **Suspend…** / **Restore access** (a confirmation; suspension signs them out at once). Not on
     oneself; the last active Owner can be neither suspended nor given another role.
   - Invited: **Send invite again** · **Cancel invite** (a confirmation) · demo only: **Open the
     invite email** (the copy from the demo mailbox, with its link).
6. **Invite dialog** (Linear Invite; Stripe Add member): **Name**, **Email**, **Role** (radio list
   with each role's line), **Language** of the email and their screens (English, Español),
   **Send invite**. The line under the title: the invite works for 10 days (Stripe).

## Interactions
- Every change (invite, send again, cancel, change role, suspend, restore) first asks the Owner to
  confirm it's them when they have not given their password or a code in the last 15 minutes
  (GitHub's sudo mode covers organization invitations and roles; `_components/confirm-access.md`).
- Filters and search narrow the table as they change.
- Send invite → the dialog closes, a toast, the person appears as Invited. Demo: the toast offers
  **Open the invite email**.

## States
- No one matches the filters: a line saying so with **Clear filters**.
- The email already belongs to someone: a message under the Email field.
- Not the Owner: no Invite button and no row menus; a line says only the Owner manages members.
- Saving: buttons show they are working.

## Related
- The agency's single sign-on is its own page beside Members in the agency menu
  (`settings/sso.md`, decision 0033), as Linear keeps it under Security and Notion under Identity.

## Never copy
Linear's, Stripe's or GitHub's wording, icons, colors or logos.

Deviations allowed: none
