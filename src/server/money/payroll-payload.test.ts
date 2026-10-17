import { describe, expect, it } from "vitest";
import { buildPayrollPayload, decimalCents, hoursOf, ratePerHour, type PayloadInput } from "./payroll-payload";

const run = { id: "run-1", version: 1, periodStart: "2026-10-05", periodEnd: "2026-10-11", payday: "2026-10-16", rulesVersion: "2026.10-c8", approvedAt: "2026-10-13T15:00:00.000Z" };
const site = { id: "site-1", name: "Joliet plant", state: "IL", county: "Will", city: "Joliet", address: "1 Example Way" };
const worker = (id: string, over: Partial<PayloadInput["workers"][number]> = {}) => ({ id, firstName: "Ana", lastName: id, hireDate: "2026-01-05", ssnLast4: "0001", ...over });
const line = (id: string, workerId: string, type: string, minutes: number, rate: { num: number; den: number }, amountCents: number) => ({
  id,
  workerId,
  type,
  minutes,
  rate,
  amountCents,
  workweekStart: "2026-10-05",
  workplaceId: "site-1",
  clientId: "client-1",
  clientName: "Client One",
  wcClassCode: "3632",
  explain: `${type} line`,
});

describe("payroll payload", () => {
  it("converts at the boundary only, exactly", () => {
    expect(decimalCents(72050)).toBe("720.50");
    expect(decimalCents(5)).toBe("0.05");
    expect(decimalCents(-150)).toBe("-1.50");
    // 37 minutes = 0.61666… h → 0.62 (half up); 2400 minutes = 40.00 h.
    expect(hoursOf(37)).toBe("0.62");
    expect(hoursOf(2400)).toBe("40.00");
    // $27.375/h is 5475/2 cents per hour.
    expect(ratePerHour({ num: 5475, den: 2 })).toBe("27.3750");
  });

  it("builds one item per worker whose amounts reconcile to the run to the cent", () => {
    // By hand: 40 h × $18.25 = $730.00; 4 h × $27.375 = $109.50; gross $839.50 = 83950 cents.
    const p = buildPayrollPayload({
      run,
      runGrossCents: 83950,
      workers: [worker("w1")],
      workplaces: [site],
      lines: [line("l1", "w1", "REG", 2400, { num: 1825, den: 1 }, 73000), line("l2", "w1", "OT", 240, { num: 5475, den: 2 }, 10950)],
    });
    expect(p.neutral.reconciliation).toEqual({ run_gross_cents: 83950, payload_gross_cents: 83950, equal: true });
    expect(p.neutral.totals).toMatchObject({ workers: 1, lines: 2, gross: "839.50", minutes_by_type: { OT: 240, REG: 2400 } });
    const items = (p.check as { items: { earnings: { type?: string; hours?: string; amount: string }[] }[] }).items;
    expect(items[0]!.earnings.map((e) => [e.type, e.hours, e.amount])).toEqual([
      ["overtime", "4.00", "109.50"],
      ["hourly", "40.00", "730.00"],
    ]);
    // Zeal recomputes 4 × 27.375 = 109.50 and 40 × 18.25 = 730.00: no difference.
    expect(p.zeal.differences).toEqual([]);
    expect(p.ready).toBe(true);
  });

  it("lists every cent Zeal's hours × wage would differ by", () => {
    // 37 minutes at $27.375/h is exactly 1688.125 cents, the run's line rounded once to 1688.
    // Zeal would get hours 0.6167 (four places) × wage 27.375 = 16.8822 dollars → 1688 cents: equal.
    // 50 minutes at $18.33/h is 1527.5 cents → 1528 on the line; Zeal 0.8333 × 18.33 = 15.2744 → 1527.
    const p = buildPayrollPayload({
      run,
      runGrossCents: 1688 + 1528,
      workers: [worker("w1")],
      workplaces: [site],
      lines: [line("l1", "w1", "OT", 37, { num: 5475, den: 2 }, 1688), line("l2", "w1", "REG", 50, { num: 1833, den: 1 }, 1528)],
    });
    expect(p.zeal.differences).toEqual([{ line_id: "l2", worker: "granite:worker:w1", exact_cents: 1528, partner_cents: 1527, difference_cents: -1 }]);
  });

  it("never carries an SSN, names what Granite is missing and what the partner collects", () => {
    const p = buildPayrollPayload({ run, runGrossCents: 100, workers: [worker("w1", { ssnLast4: null, hireDate: null })], workplaces: [site], lines: [{ ...line("l1", "w1", "REG", 60, { num: 100, den: 1 }, 100), workplaceId: null }] });
    const e = p.neutral.employees[0]!;
    expect(e.ssn).toEqual({ on_file: false, last_four: null });
    expect(e.readiness).toEqual({ missing: ["start_date", "workplace", "ssn"], partnerCollects: ["dob", "residence", "payment_method", "withholdings"] });
    expect(p.ready).toBe(false);
    expect(JSON.stringify(p)).not.toMatch(/\d{3}-\d{2}-\d{4}/);
  });

  it("carries wage access repaid from this paycheck as a deduction, the gross unchanged", () => {
    const p = buildPayrollPayload({ run, runGrossCents: 1000, workers: [worker("w1")], workplaces: [site], lines: [line("l1", "w1", "REG", 60, { num: 1000, den: 1 }, 1000)], recoveries: [{ workerId: "w1", handoffId: "h1", amountCents: 400 }] });
    expect(p.neutral.employees[0]!.deductions).toEqual([{ kind: "earned_wage_access_recovery", handoff_id: "h1", amount: "4.00", amount_cents: 400 }]);
    expect(p.neutral.reconciliation.equal).toBe(true);
    expect((p.check as { items: { metadata: Record<string, string> }[] }).items[0]!.metadata.wage_access_recovery).toBe("4.00");
  });

  it("holds a worker whose wage-access repayment is larger than this paycheck (money review B2)", () => {
    const p = buildPayrollPayload({ run, runGrossCents: 1500, workers: [worker("w1")], workplaces: [site], lines: [line("l1", "w1", "REG", 60, { num: 1500, den: 1 }, 1500)], recoveries: [{ workerId: "w1", handoffId: "h1", amountCents: 30000 }] });
    expect(p.neutral.employees[0]!.readiness.missing).toContain("covers_recovery");
    expect(p.ready).toBe(false);
  });

  it("refuses readiness when the payload does not equal the run's gross", () => {
    const p = buildPayrollPayload({ run, runGrossCents: 999, workers: [worker("w1")], workplaces: [site], lines: [line("l1", "w1", "REG", 60, { num: 1000, den: 1 }, 1000)] });
    expect(p.neutral.reconciliation.equal).toBe(false);
    expect(p.ready).toBe(false);
  });

  it("carries types the partner has no hour type for as the agency's own code or amount-only", () => {
    const p = buildPayrollPayload({
      run,
      runGrossCents: 400 + 5000,
      workers: [worker("w1")],
      workplaces: [site],
      lines: [line("l1", "w1", "MW_TRUEUP", 480, { num: 50, den: 1 }, 400), line("l2", "w1", "BONUS", 0, { num: 0, den: 1 }, 5000)],
    });
    const earnings = p.neutral.employees[0]!.earnings;
    expect(earnings.map((e) => [e.granite_type, e.partner_type, e.earning_code, e.hours])).toEqual([
      ["BONUS", "bonus", null, null],
      ["MW_TRUEUP", null, "MW_TRUEUP", "8.00"],
    ]);
    expect(p.zeal.amount_only.map((x) => [x.type, x.amount])).toEqual([
      ["BONUS", 50],
      ["MW_TRUEUP", 4],
    ]);
  });
});
