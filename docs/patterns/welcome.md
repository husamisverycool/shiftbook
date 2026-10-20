# Pattern: Set up your agency, three questions (`/welcome`)

Status: adopted — slice ab, onboarding (2026-10-20; `.claude/plans/onboarding.md`).
Reference product and screen: Gusto's employer onboarding (one question per screen with Continue; the
company address and the pay schedule asked early; "Add another admin", optional; then "Finish setting
up" as a list of remaining tasks); Mercury's application (a visible progress indicator, answers kept as
you go); Linear's workspace setup (short centred screens, each optional step skippable, "invite your
team" last).
Source URL: https://support.gusto.com/article/100758300100000/gusto-onboarding-guide-for-employers
Source URL: https://productonboarding.com/examples/mercury-new-user-onboarding
Source URL: https://supademo.com/user-flow-examples/linear
Researched: 2026-10-20. Confidence: high for the order and one-question screens; medium for exact sizes
(described, not measured).

## Purpose in Tabulado
A new agency's Owner, right after two-step sign-in, answers the three things Tabulado needs before the
first week: where the agency is (its address, time zone and pay week), which payroll system it uses,
and who else works in it. Every answer is saved to the agency's real settings (Settings › Agency,
Settings › Payroll file, Settings › Members), so nothing is asked twice.

## Hierarchy
Inside the sign-in frame (`_layouts/auth.md`: the mark, one narrow column, the language at the foot).
1. A progress bar of three equal parts, the current and done parts filled, and "Step N of 3" in muted
   text above it (Mercury).
2. **H1** the question, centred; one muted line under it saying why it is asked.
3. The answer:
   1. **Where is your agency?** — Address (two lines: street; city, state and ZIP), Phone (optional),
      Time zone (the browser's guess chosen when it is a US one), Pay week starts on (Monday chosen).
   2. **Which payroll system do you use?** — one card per system in a single column (Gusto, ADP
      Workforce Now, RUN Powered by ADP, Paychex Flex, QuickBooks Online, QuickBooks Desktop,
      Paylocity, Something else), each a radio with the system's name and one muted line; the chosen
      card shows the one detail its file needs under it (ADP's company code, RUN's company code,
      Paychex's client ID, the QuickBooks Online customer, the QuickBooks Desktop version).
   3. **Invite your team** — Name, Email, Role (Coordinator chosen); after sending, "Invite sent to
      {email}" and **Invite another**.
4. **Continue** (primary, full width); **Skip for now** (quiet, centred under it) on every step; **Back**
   (quiet, top left of the column) from the second step.
5. After the third step: Home, with "Finish setting up" (`home.md`).

## Interactions
- Continue saves the step, then shows the next; a refusal stays on the step, under the field it names.
- Skip for now saves nothing and moves on; the step stays open in Home's guide.
- Something else, or QuickBooks Desktop 2021 or earlier: nothing is saved; the guide's payroll step
  opens Settings › Payroll file to finish there.
- Enter submits the step.

## States
- Only the Owner (the one person who changes settings); anyone else is sent to Home.
- The demo: the page opens with the demo agency's answers; saving behaves as in Settings.
- Answers already saved (coming back later): the fields show them.
- Spanish: every word in Spanish (usted).

## Never copy
Gusto's, Mercury's or Linear's wording, icons, colors or illustrations.

Deviations allowed: none
