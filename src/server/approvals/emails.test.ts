import { describe, expect, it } from "vitest";
import { renderDecisionEmail as renderDecision, renderLinkEmail as renderLink } from "./emails";

/** Intl puts thin and narrow no-break spaces in date ranges and times; compare with plain spaces. */
const plain = (m: { subject: string; text: string; html: string }) => ({ subject: m.subject.replace(/[\u2009\u202f]/g, " "), text: m.text.replace(/[\u2009\u202f]/g, " "), html: m.html });
const renderLinkEmail = (input: Parameters<typeof renderLink>[0]) => plain(renderLink(input));
const renderDecisionEmail = (input: Parameters<typeof renderDecision>[0]) => plain(renderDecision(input));

const agency = { name: "Cedar Row Staffing (demo)", phone: "(555) 010-0000", email: "office@cedar-row.example", timeZone: "America/Chicago" };
const period = { startsOn: "2026-10-05", endsOn: "2026-10-11" };
const link = "https://granite.example/en/approve/sbap_TESTTOKENTESTTOKENTESTTOKENTESTTOKENTESTTOK";

describe("approval link emails (docs/patterns/_emails/approval-request.md)", () => {
  it("asks for approval with the summary, one link, how long it lasts and the agency's contact", () => {
    const m = renderLinkEmail({
      kind: "approval_request",
      locale: "en",
      agency,
      clientName: "Prairie Molding (demo)",
      period,
      approverName: "Dana Approver",
      summary: { workers: 2, shifts: 8, minutes: 2_910 },
      link,
      expiresAt: new Date("2026-10-26T15:00:00Z"),
    });
    expect(m.subject).toBe("Hours to approve: Prairie Molding (demo), October 5 – 11, 2026");
    expect(m.text).toContain("Hello Dana Approver,");
    expect(m.text).toContain("Cedar Row Staffing (demo) asks you to review and approve the hours");
    expect(m.text).toContain("Waiting for approval: 2 workers, 8 shifts, 48:30 hours.");
    expect(m.text).toContain(link);
    expect(m.text).toContain("October 26, 2026");
    expect(m.text).toContain("(555) 010-0000");
    expect(m.text).not.toMatch(/[{}]/);
    expect(m.html).toContain(`href="${link}"`);
  });

  it("says one worker and one shift in the singular, and speaks Spanish when asked", () => {
    const m = renderLinkEmail({
      kind: "approval_reminder",
      locale: "es",
      agency,
      clientName: "Prairie Molding (demo)",
      period,
      approverName: "Dana",
      summary: { workers: 1, shifts: 1, minutes: 480 },
      link,
      expiresAt: new Date("2026-10-26T15:00:00Z"),
    });
    expect(m.subject).toBe("Recordatorio: horas por aprobar de Prairie Molding (demo), 5–11 de octubre de 2026");
    expect(m.text).toContain("Por aprobar: 1 trabajador, 1 turno, 8:00 horas.");
    expect(m.text).toContain("26 de octubre de 2026");
  });

  it("escapes names in the HTML copy", () => {
    const m = renderLinkEmail({
      kind: "approval_request",
      locale: "en",
      agency: { ...agency, name: "A & B <b>" },
      clientName: '<script>alert("x")</script>',
      period,
      approverName: "Dana",
      summary: { workers: 1, shifts: 1, minutes: 60 },
      link,
      expiresAt: new Date("2026-10-26T15:00:00Z"),
    });
    expect(m.html).not.toContain("<script>");
    expect(m.html).toContain("&lt;script&gt;");
    expect(m.html).toContain("A &amp; B &lt;b&gt;");
  });
});

describe("decision emails", () => {
  const base = {
    locale: "en" as const,
    agency,
    clientName: "Prairie Molding (demo)",
    period,
    typedName: "Dana Approver",
    approverEmail: "dana@prairie.example",
    decidedAt: new Date("2026-10-13T14:05:00Z"),
    approved: { shifts: 7, minutes: 3_360 },
  };

  it("confirms what was approved and lists what was disputed, with the reason", () => {
    const m = renderDecisionEmail({
      ...base,
      kind: "approval_confirmation",
      disputed: [{ workerName: "Marcus Bell", workDate: "2026-10-07", reason: "Left at 3 pm, not 5 pm" }],
    });
    expect(m.subject).toBe("Hours approved and disputed for Prairie Molding (demo), October 5 – 11, 2026");
    expect(m.text).toContain("Dana Approver (dana@prairie.example) approved 7 shifts (56:00 hours)");
    expect(m.text).toContain("Disputed, waiting for Cedar Row Staffing (demo):");
    expect(m.text).toContain("Marcus Bell, Wed, Oct 7: Left at 3 pm, not 5 pm");
    expect(m.text).toContain("To change anything, contact Cedar Row Staffing (demo).");
  });

  it("tells the agency, with a link into Granite, in the agency's language", () => {
    const m = renderDecisionEmail({ ...base, kind: "approval_notice", locale: "es", disputed: [], agencyLink: "https://granite.example/es/approvals/1" });
    expect(m.subject).toBe("Prairie Molding (demo) aprobó horas del 5–11 de octubre de 2026");
    expect(m.text).toContain("https://granite.example/es/approvals/1");
  });
});
