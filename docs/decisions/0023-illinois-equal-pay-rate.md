# 0023 — The Illinois equal-pay rate: dated rows per worker and client, paid from their date, never holding pay for the client's data

Status: accepted
Date: 2026-10-16

## Context
Slice (c) step 5 counts covered hours and records the 720- and 4,160-hour crossings of 820 ILCS
175/42 as duties. Slice (j) step 3b (plan J6) pays the rate: after the crossing the laborer is paid
at least the lowest paid comparable direct hire's straight-time rate (or, at the client's choice, the
wage survey's median, or its 75th percentile after 4,160 hours), with equal benefits or their hourly
cash value (§ 42(a), (b)); the client supplies the data before the laborer's next pay period begins
(§ 42(c); 56 Ill. Adm. Code 260.505(b)). A second-opinion review of the first build found thirteen
defects; each has a test that failed before the fix (`packages/rules/src/rules/il-equal-pay-rate.
test.ts`, `engine.test.ts` "the Illinois equal-pay rate", `tests/integration/equal-pay.test.ts`,
`tests/e2e/compliance.spec.ts` "compliance equal pay").

## Decision
- **Dated rows per worker and client** (`equal_pay_rates`): a rate (the comparator's or survey's
  hourly rate, the benefits' hourly cash value, how the client compared, who with, a note) or a
  record that the client was asked. One comparator covers the worker's covered jobs at that client
  (the Act speaks of the client, not the order). Only the Owner enters or removes rows (the rule
  names no other role). A row from the same date replaces the one before; a wrong row is removed with
  a reason; both stay on file. A request never replaces a rate. The database checks each kind's
  figures and caps rate plus benefits at $100,000 an hour.
- **The rate in force** on a date is the latest rate row on or before it. A request never lowers or
  undoes a rate; it only records that the figures were asked for.
- **The engine pays it** (`il-equal-pay-rate.ts`, pure): from a rate's date, a covered shift's pay
  rate rises to the rate plus the benefits' cash value when that is higher. Covered means day and
  temporary labor at a worksite whose state has the equal-pay rule in force that day, on a shift that
  is otherwise valid; Indiana or clerical work at the same client keeps the rate card. Cash paid in
  lieu of benefits is pay, so it is in the regular rate and overtime follows it (the safe reading;
  counsel may say otherwise). Every line priced from the raised rate — regular, overtime, the
  minimum-wage top-up, the holiday premium, the reporting-pay guarantee, the holiday not worked — ends
  with why. Billing stays on the rate card: equal pay is the agency's cost. A malformed or doubled row
  holds only its worker, saying why.
- **The run never holds pay for want of the client's data.** In a pay period that starts after a
  720-hour crossing, covered hours at that client need the rate in force or a recorded request (of
  any date, today's included); then the rate card is paid and a correction trues it up. A crossing a
  person set aside as not applicable (the § 43 collective-agreement exception, say) holds nothing.
  After a 4,160-hour crossing, a survey median dated before it holds the run until a newer rate (the
  75th percentile, § 42(a)(2)(B)) or a request on or after the crossing is on file.
- **Paid weeks to true up** are listed on the duty: periods whose latest paid version paid the worker
  at the client on or after a rate's date and was computed before that rate was entered. Each links
  to its files, where a correction starts (slice e, decisions E8–E13).
- **Removing the last rate reopens the duty** that entering it closed, logged.
- **The rules version stays `2026.10-c8`.** Outputs for inputs without equal-pay rows are
  byte-identical (all 45 approved answer keys pass unchanged, and they compare the version strictly);
  the new path has its own proposed answer key, `il-s42-equal-pay-rate-paid`, checked against hand
  arithmetic, waiting for the owner's approval.

## Alternatives considered
- **Holding pay until the client's figures arrive:** paying late is itself a violation and the data
  duty is the client's; recording the request releases the run.
- **A rate per job order:** the client chooses one comparator for the worker; per order would let two
  rates apply to the same hours.
- **Keying the raise to the crossing minute:** the rate is dated, so hours worked on the crossing day
  before the 720th hour are raised too when the rate starts that day. This errs toward the worker and
  keeps the rows simple.
- **One bill line per week whatever the pay rates:** when two pay rates meet in a week, bill lines
  follow the pay-rate groups at the same bill rate; each line rounds once, so totals can differ from a
  single line by a cent per group. Accepted: rounding stays at line level and each line explains.
- **Bumping the rules version:** every approved answer key would fail on the version string alone
  with no change in its numbers.

## Consequences
- Migration `0031` adds `equal_pay_rates` (and `hours_opening_balances`, decision context in step
  3a); `0032` tightens its checks and adds `removed_reason`.
- A new blocking issue, `equal_pay_rate_needed`, links from Exceptions to the equal-pay duties.
- Corrections for late figures are started by a person from the listed weeks; Shiftbook does not
  start them on its own (a correction re-opens a paid period, which is the Owner's call).
