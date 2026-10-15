import sharp from "sharp";
import { afterAll, describe, expect, it } from "vitest";
import { closeOcr, findSensitiveRegions, ocrText, redact, sensitiveSpans } from "./redact";

// Only 9xx test SSNs anywhere (a hook enforces this).
const TEST_SSN = "912-34-5678";

async function printedForm(): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="520">
    <rect width="100%" height="100%" fill="#ffffff"/>
    <g font-family="DejaVu Sans, Arial, sans-serif" font-size="44" fill="#111111">
      <text x="60" y="110">Employee: Example Worker</text>
      <text x="60" y="210">SSN: ${TEST_SSN}</text>
      <text x="60" y="310">DOB: 04/12/1988</text>
      <text x="60" y="410">Work date: 10/06/2026  Hours: 8.0</text>
    </g></svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 95 }).toBuffer();
}

afterAll(() => closeOcr());

describe("sensitiveSpans (text rules)", () => {
  it("finds SSN-shaped numbers of every range, with or without separators", () => {
    expect(sensitiveSpans(`SSN ${TEST_SSN}`, 2026).map((s) => s.kind)).toEqual(["ssn"]);
    expect(sensitiveSpans("id 912345678 here", 2026).map((s) => s.kind)).toEqual(["ssn"]);
  });
  it("finds dates of birth by keyword or by an old year, and leaves work dates alone", () => {
    expect(sensitiveSpans("DOB: 04/12/1988", 2026).map((s) => s.kind)).toEqual(["dob"]);
    expect(sensitiveSpans("Fecha de nacimiento 3/7/01", 2026).map((s) => s.kind)).toEqual(["dob"]);
    expect(sensitiveSpans("born 1990-05-02", 2026).map((s) => s.kind)).toEqual(["dob"]);
    expect(sensitiveSpans("Week of 10/05/2026 – 10/11/2026", 2026)).toEqual([]);
    expect(sensitiveSpans("3:00 11:30 30 8", 2026)).toEqual([]);
  });
});

describe("redaction before any model call", () => {
  it("blacks out the SSN and date of birth on the image and keeps the work date", async () => {
    const image = await printedForm();
    const regions = await findSensitiveRegions(image, 2026);
    expect(regions.map((r) => r.kind).sort()).toEqual(["dob", "ssn"]);
    const redacted = await redact(image, regions);
    const after = await ocrText(redacted);
    expect(after).not.toContain("912");
    expect(after).not.toContain("1988");
    expect(after).toContain("10/06/2026");
  }, 60_000);
});
