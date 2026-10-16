import { describe, expect, it } from "vitest";
import { activityCsv } from "./csv";
import type { ActivityEvent } from "./events";

const event = (over: Partial<ActivityEvent>): ActivityEvent => ({
  id: 1,
  at: "2026-10-16T15:04:05.000Z",
  actor: "Demo Owner (demo)",
  action: "reveal",
  event: "ssn_viewed",
  entityType: "worker",
  entityId: "6f1c2a8e-0b4d-4c55-9a3e-2d7b8c9e0f11",
  record: { name: "Marcus Bell", href: "/workers/6f1c2a8e-0b4d-4c55-9a3e-2d7b8c9e0f11" },
  reason: "W-2 correction",
  before: null,
  after: { field: "ssn", last4: "8564" },
  ...over,
});

describe("the activity export", () => {
  it("one row per event: when, who, what, the record, the reason, before and after (Vercel's previous and next)", () => {
    const csv = activityCsv([event({}), event({ id: 2, action: "update", event: "update", reason: null, before: { lastName: "Bell" }, after: { lastName: "Bell-Park" }, record: { name: "Marcus Bell-Park", href: null } })]);
    const lines = csv.trimEnd().split("\r\n");
    expect(lines[0]).toBe("When (UTC),Who,Event,Action,Record type,Record,Record id,Reason,Before,After");
    expect(lines[1]).toBe('2026-10-16T15:04:05.000Z,Demo Owner (demo),ssn_viewed,reveal,worker,Marcus Bell,6f1c2a8e-0b4d-4c55-9a3e-2d7b8c9e0f11,W-2 correction,,"{""field"":""ssn"",""last4"":""8564""}"');
    expect(lines[2]).toContain('"{""lastName"":""Bell""}","{""lastName"":""Bell-Park""}"');
  });

  it("a run is named by its dates, a duty by its kind and subject", () => {
    const csv = activityCsv([event({ entityType: "pay_run", record: { name: null, href: null, period: { from: "2026-10-05", to: "2026-10-11" } } }), event({ entityType: "obligation", record: { name: "Marcus Bell", href: null, kind: "i9_section2" } })]);
    expect(csv).toContain(",pay_run,2026-10-05 – 2026-10-11,");
    expect(csv).toContain(",obligation,i9_section2 · Marcus Bell,");
  });

  it("a cell a spreadsheet would run as a formula is kept as text", () => {
    const csv = activityCsv([event({ actor: "=HYPERLINK(\"x\")", reason: "+1 check", record: { name: "@SUM(A1)", href: null } })]);
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csv).toContain("'+1 check");
    expect(csv).toContain("'@SUM(A1)");
  });
});
