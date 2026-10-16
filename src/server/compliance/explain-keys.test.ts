import { describe, expect, it } from "vitest";
import { citationCodeOf, equalPayExplain, noteKeyOf, sayInEnglish } from "./explain-keys";

describe("Shiftbook's notes read back into keys (decision 0028)", () => {
  it("each note Shiftbook writes becomes keys that say exactly it", () => {
    const person = (kind: string) => ({ kind, closedBySystem: false });
    const shiftbook = (kind: string) => ({ kind, closedBySystem: true });
    for (const [note, where] of [
      ["Reverified on 2026-10-01.", person("i9_reverify")],
      ["The work authorization's end was changed from 2026-12-31 to 2027-06-30.", person("i9_reverify")],
      ["The work authorization's end (2026-12-31) was removed.", person("i9_reverify")],
      ["Equal-pay rate entered from 2026-10-05.", person("il_equal_pay_720h")],
      ["Renewed: IL-0003, expires 2027-12-31.", shiftbook("il_registration_renewal")],
      ["Renewed: WC-2, from 2027-01-01 to 2027-12-31.", shiftbook("wc_policy_renewal")],
      ["Section 2 completed on 2026-08-05.", shiftbook("i9_section2")],
    ] as const) {
      const key = noteKeyOf(note, where);
      expect(key, note).not.toBeNull();
      expect(sayInEnglish(key!)).toBe(note);
    }
  });

  it("a person's own words stay as typed, even when they read like Shiftbook's", () => {
    expect(noteKeyOf("Renewal filed online.", { kind: "il_registration_renewal", closedBySystem: false })).toBeNull();
    expect(noteKeyOf("Reverified on 2026-10-01 by phone.", { kind: "i9_reverify", closedBySystem: false })).toBeNull();
    expect(noteKeyOf("Renewed: online portal, expires 2027-06-30.", { kind: "il_registration_renewal", closedBySystem: false })).toBeNull();
    expect(noteKeyOf("Reverified on 2026-10-01.", { kind: "ma_job_order", closedBySystem: false })).toBeNull();
  });
});

describe("citations in the reader's language", () => {
  it("only while the rule table's text is the one the messages translate", () => {
    expect(citationCodeOf("i9_section1", "8 C.F.R. § 274a.2(b)(1)(i); USCIS Handbook M-274, 3.0 (Section 1 no later than the first day of employment)")).toBe("i9_section1");
    expect(citationCodeOf("i9_section1", "8 C.F.R. § 274a.2(b)(1)(i) (a newer reading)")).toBeNull();
    expect(citationCodeOf("not_a_rule", "anything")).toBeNull();
  });
});

describe("the Illinois equal-pay sentence", () => {
  it("as the engine writes it, with and without the time and the earlier hours", () => {
    const o = { kind: "il_equal_pay_720h", workerName: "Marcus Bell", crossedOn: "2026-10-07", crossedAtMinute: 600, windowStart: "2025-10-08", thresholdMinutes: 43_200, earlierMinutesAfter: 0 };
    expect(sayInEnglish(equalPayExplain(o, "Prairie Line Manufacturing (demo)", 12))).toMatch(/^Marcus Bell passed 720 hours of work at Prairie Line Manufacturing \(demo\) on 2026-10-07 at 10:00 \(the 12 months from 2025-10-08\): from then on/);
    expect(sayInEnglish(equalPayExplain({ ...o, kind: "il_equal_pay_4160h", crossedAtMinute: null, earlierMinutesAfter: 90 }, "Client", 48))).toMatch(/on 2026-10-07 \(the 48 months.*\(56 Ill\. Adm\. Code 260\.505\(b\)\)\. 1h 30m were worked there after it before this pay period\.$/);
  });
});
