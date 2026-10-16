# Slice (k) screens compared with their pattern files

Captured 2026-10-16 in demo mode (1280×860, full page). ✓ = matches the pattern file. Casey Rivera
is a coordinator invited during the capture (an invented person, a fresh email each run).

## Step 1 — signing in, members, your account, who may change what

### Sign in — `docs/patterns/sign-in.md` (GitHub sign-in; Linear's "Continue with …" list)
Screens: `slice-k/k01-sign-in.png`, `k02-sign-in-wrong.png`, `k03-sign-in-es.png`.
- ✓ The sign-in frame (`_layouts/auth.md`): the demo banner, "Shiftbook" and the language switch
  above one narrow column.
- ✓ H1 "Sign in to Shiftbook"; Email; Password with "Forgot password?" beside its label; Sign in
  (full width, off until both are typed).
- ✓ Wrong email or password: one message for both, the password cleared, the email kept (`k02`).
- ✓ Demo only: "Try the demo as" with one full-width button per demo person, the role under the
  name (Owner, Lena — coordinator, Rosa — billing, Morgan — accountant).
- ✓ Spanish (`k03`).
- The "too many tries" and "busy" states are covered by the Playwright test, not a screenshot.

### The code — `docs/patterns/sign-in/code.md` (GitHub's two-factor step)
Screens: `k14-code.png`, `k15-code-wrong.png`, `k16-recovery-code.png`.
- ✓ H1 "Enter your code", the one line, the six-digit field (sends itself at six digits), Verify.
- ✓ Wrong code: the message in place (`k15`).
- ✓ More options → "Use a recovery code" swaps the field (`k16`) and back.
- ✓ "Not you? Sign out" under a rule.

### Setting up the authenticator — `docs/patterns/sign-in/setup.md` (GitHub's three-part setup)
Screens: `k11-setup.png`, `k12-recovery-codes.png`, `k27-account-set-up-again.png`.
- ✓ H1 and the line saying the role needs it; 1. the QR code, "Setup key" showing the key in groups
  of four; 2. the six-digit field and Verify.
- ✓ 3. after Verify: "Your authenticator is on.", the ten recovery codes in two columns, Download,
  Print, Copy, then "I have saved my recovery codes" (`k12`).
- ✓ The same parts in place on the account page for "Set up again" (`k27`).

### Password reset — `docs/patterns/sign-in/reset.md`, `sign-in/reset/[token].md` (GitHub)
Screens: `k20-reset.png`, `k21-reset-sent.png`, `k22-new-password.png`, `k23-link-gone.png`.
- ✓ The request: the email carried over from sign-in, "Send reset link", "Back to sign in".
- ✓ "Check your email" with the same words whatever the address; demo only, the demo mailbox's copy
  with its link (`k21`).
- ✓ The link: H1 "Choose a new password", the email it is for, New password with its rule, Confirm
  password, Change password (`k22`). For someone with an authenticator the code comes first
  (Playwright and the integration test).
- ✓ A used, lapsed or wrong link: "This link no longer works", Ask for a new link, Back to sign in
  (`k23`).

### Accepting an invite — `docs/patterns/invite/[token].md` (Stripe and GitHub invitations)
Screen: `k10-invite.png`.
- ✓ H1 "Join Cedar Row Staffing (demo)", who invited them and the role with its line, the email they
  will sign in with, Password, Confirm password, "Join …", and the note that the role needs an
  authenticator next.

### Members — `docs/patterns/settings/members.md` (Linear Members; Stripe Add member)
Screens: `k04-members.png`, `k05-invite-dialog.png`, `k06-invite-demo-copy.png`,
`k07-members-invited.png`, `k08-member-menu.png`, `k09-change-role.png`, `k24-members-accountant.png`.
- ✓ "Settings" above H1 "Members", Invite at the right (the Owner only).
- ✓ The four roles with one line each; Role and Status filters and the search; the count.
- ✓ The table: name with "You" and the email, role, status badge (Invited with its expiry,
  `k07`), authenticator (On / Off / Needed), last seen; the row menu (⋯) with Change role… and
  Suspend… (`k08`), a role dialog with the four roles and their lines (`k09`).
- ✓ Invite dialog: Name, Email, Role (each with its line), Language, Send invite; "works for 10 days"
  (`k05`). Demo: the invite email's copy with its link opens straight after (`k06`).
- ✓ Not the Owner: no Invite, no row menus, the line saying only the Owner manages members (`k24`).
- Difference: the demo people (Demo Owner, Lena, Sam) show "Needed": their roles need an
  authenticator, and the demo's "Continue as" skips it. True, and left as it is.

### Your account — `docs/patterns/settings/account.md` (GitHub Password and authentication; Slack Language & region)
Screens: `k17-account-coordinator.png`, `k18-account-demo-billing.png`, `k19-account-es.png`,
`k28-confirm-access.png`, `k29-new-recovery-codes.png`.
- ✓ "Settings" above H1 "Your account", the name, email and role.
- ✓ Language: the select and what it sets (`k19`: Spanish).
- ✓ Password: when it was last changed; Current password, New password with its rule, Confirm new
  password, Update password (`k17`); a demo person without a password sees no current field and
  "Set password" (`k18`).
- ✓ Authenticator: on since a date; recovery codes left; Make new recovery codes (a confirmation,
  then the new ten, `k29`); Set up again with its line. Off: what it is, "Your role needs it." when
  so, Set up authenticator (`k18`).
- ✓ "Confirm it's you" (`_components/confirm-access.md`, GitHub sudo mode) before the new codes when
  nothing was confirmed in the last 15 minutes (`k28`).
- ✓ Sign out at the bottom.

### The agency menu — `docs/patterns/_layouts/app.md`
Screen: `k13-agency-menu.png`.
- ✓ Settings, Compliance settings, Members; below a rule, "Casey Rivera · Coordinator", Your
  account, Sign out. (Margin settings is not offered to a coordinator.)
- Difference (already listed in the pattern): Linear's docs do not say where its log-out item sits.

### Who may change what — decision 0026
Screens: `k24-members-accountant.png`, `k25-job-orders-accountant.png`, `k26-convert-accountant.png`.
- ✓ The accountant reads every page; job orders show "Only the Owner and coordinators change job
  orders." instead of New job order (`k25`); a converter step shows "You can look at everything
  here; the Owner and coordinators change hours." with no upload area (`k26`).
- Every server action names who may run it (a unit test reads them all); the services check the same
  table.

## Step 2 — the worker roster

### Workers — `docs/patterns/workers.md` (Toast Payroll Team page)
Screens: `slice-k/k30-workers.png`, `k31-workers-search.png`, `k32-workers-no-match.png`,
`k33-add-worker.png`, `k45-workers-es.png`.
- ✓ H1 "Workers", Add worker at the right (the Owner and coordinators).
- ✓ The search ("Search by name or payroll number"; `/` goes to it), and Include ended beside it.
- ✓ The table by last name: Name (last, first) as a link with the language under it; Assignment (job
  · client, "+1" when more); Hired; Payroll numbers ("Set", or "Missing for Gusto"); Status.
- ✓ A payroll number finds its worker (`k31`: SB-0002 → Maribel Torres); accents do not matter; the
  search finds ended workers too (Playwright).
- ✓ Nothing matches: the words searched and Clear search (`k32`); no active workers: the line and
  Include ended (Playwright).
- ✓ Under the table: "40 workers" ("2 of 41 workers" while searching).
- ✓ Add worker: first and last name, preferred language, hire date; Save opens the profile (`k33`).
- ✓ Spanish (`k45`).
- No SSN column anywhere on the list.

### A worker's profile — `docs/patterns/workers/[id].md` (Toast employee profile; Square's sections)
Screens: `k34-profile.png`, `k35-profile-edit-personal.png`, `k36-ssn-edit-error.png`,
`k37-retrieve-ssn.png`, `k38-ssn-revealed.png`, `k39-payroll-edit.png`, `k40-employment.png`,
`k41-end-employment.png`, `k42-documents.png`, `k43-add-document.png`, `k49-open-document.png`,
`k44-profile-es.png`, `k46-documents-billing.png`, `k47-profile-accountant.png`,
`k48-profile-coordinator.png`.
- ✓ The back link "Workers"; H1 the name with the Active / Ended badge; tabs Profile · Employment ·
  Documents (the tab in the address).
- ✓ Profile: Personal, Social Security number, Payroll numbers, each a section with its own Edit
  (`k34`); Edit turns the section's fields into inputs with Save and Cancel; Escape cancels (`k35`).
- ✓ The SSN as "•••-••-8564"; a number that breaks the rules says why under the field (`k36`);
  one already on another worker is refused, naming them (Playwright and the integration test).
- ✓ Retrieve SSN (the Owner only): the business reason first (`k37`), then the number in the dialog
  with "Closing this hides the number again", and the list of who viewed or changed it, when and
  why (`k38`). Closing it takes the number off the page (Playwright reads the page after).
- ✓ Payroll numbers: one row per system with the one in use marked; Gusto's job title with its
  number (`k39`).
- ✓ Employment: the status with End employment… (a last day; the current assignments named,
  `k41`) or Rehire; hire date and the I-9 dates (dates only) with Edit; the assignments with links
  to their job orders (`k40`).
- ✓ Documents: name, kind, effective date, who added it and when; Add document (file, kind,
  effective date, and the line about I-9 copies and SSNs in file names, `k43`); Remove (`k42`).
  The Owner opens a file with a business reason, recorded like Retrieve SSN (`k49`).
- ✓ Not the Owner: no Retrieve SSN and no opening of files (`k48`, a coordinator); Billing and the
  accountant: no Edit, no Add, no Remove, the line saying who changes the profile and the line
  saying the Owner opens a worker's files (`k46`, `k47`).
- ✓ Spanish (`k44`).
- Difference: Toast shows the number behind an eye icon in its pop-up; Shiftbook shows it in the
  dialog after Show. Same steps (reason, then the number, then the list).
