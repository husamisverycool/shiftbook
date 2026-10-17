# Research — worker onboarding and the worker app (slice t, SPEC §27 items 5–6)

Read live on 2026-10-17. Only what each product documents itself; wording and visuals are not copied.

## 1. Gusto employee self-onboarding
Sources: https://support.gusto.com/article/210728164125837/add-new-employees-to-gusto ·
https://support.gusto.com/article/106622106100000/view-and-update-form-w-4-tax-withholding-elections-for-employees-and-admins ·
https://gusto.com/product/faq ("How does self-onboarding work?")

- The admin adds the person with a few basics and chooses **Send and continue** ("we'll email them a
  link to enter their details") or enters it themselves.
- The person's steps, in order: **Personal information** (legal name, SSN, birthday, phone, home
  address) → **Taxes** (federal Form W-4 withholdings, state withholding) → **Payment** (direct
  deposit into an external account — routing and account numbers — or paper check) → **Extras**
  (optional) → **Review** (confirm personal, payment and tax information).
- Default onboarding forms: Federal Form W-4 and the Direct Deposit Authorization; the I-9 is
  e-signed in self-onboarding too ("employees can e-sign their W-4 (and I-9)").
- Signing a form: **Documents** → the form → **Sign**: "Type your full name and check the box to sign
  electronically", then **Sign**.
- The admin sees each new person's onboarding checklist with its tasks (People › Onboarding ›
  the person › Tasks).

## 2. Gusto mobile app — employee experience
Source: https://support.gusto.com/article/207607681100000/gusto-mobile-app-employee-experience

- Tabs at the bottom (**Pay**, **Time**, **More**), a **Profile** icon at the top right (personal
  information, tax elections, get help).
- **Time**: **Clock in** (or clock in for an unscheduled shift); the **Current pay period** card;
  **Clock out** when the shift is done; "Gusto will automatically calculate your time worked for the
  day and log it in your timesheet for your manager or admin to review and approve"; hours can be
  edited until approved; no future hours; a shift past midnight counts on the day it began.
- **Pay**: a list of paystubs with pay dates and net pay; tap one for the breakdown; **Show paystub
  PDF**; a payday tracker with statuses.
- **More** › **Documents**: tax documents and employee documents (W-4 to view and sign).

## 3. Gusto pay stub
Sources: https://gusto.com/resources/articles/payroll/how-to-read-your-pay-stub ·
https://support.gusto.com/article/260428150612093/view-and-understand-your-paystub-for-us-employees

Sections in order: **employer and employee information with the pay period**; **earnings** — each
earning type with rate, hours and the current amount, and **year to date**; gross pay ("before
taxes, contributions, and deductions"); then taxes, deductions, net pay. Common earnings codes:
Regular, Overtime (1.5×), Double time, Holiday, Shift differential, Bonus.
Granite computes gross earnings only (SPEC §22: no payroll processing or tax filing), so its stub
stops at gross pay and says that taxes and deductions are calculated by the agency's payroll
provider — the earnings section and year-to-date follow Gusto's layout exactly.

## 4. Square Team app
Sources: https://squareup.com/us/en/staff/shifts/features · https://apps.apple.com/us/app/square-team/id1435368303 ·
https://squareup.com/help/us/en/article/8392-edit-employee-timecards

- **Home**: clock in for an upcoming shift; **Shifts**: timecards, scheduled hours and **estimated
  pay**; clock in and out, breaks, notifications.
- Timecards show times clocked in and hours worked (regular, overtime, double time, total).
- Team members request changes to past timecards; managers review the requests.

## 5. Messages — WhatsApp's simplicity
Source: https://faq.whatsapp.com/ (chats: one thread per person, newest at the bottom, the message
field at the bottom with Send, each message with its time; read state). Granite: one thread per
worker with their agency; the worker's language shown, a translation under each message for the
other side.

## 6. Phone one-time-code sign-in
Sources: NIST SP 800-63B §5.1.3 (out-of-band via SMS is "restricted", acceptable with throttling and
expiry); https://support.gusto.com/article/260514162521870 (SMS verification as the backup for secure
changes). Granite: a six-digit code by text message, 10 minutes, once, five wrong tries end it, the
same HMAC storage as emailed codes (decision 0033), throttled per phone and per address.

## What is not documented (so not built)
Gusto's and Square's exact spacing and colours; any reference's wording. Granite's screens use the
shadcn base, its own plain words, and the motion tokens (decision 0037).
