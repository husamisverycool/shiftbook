import { describe, expect, it } from "vitest";
import en from "../../../messages/en.json";
import es from "../../../messages/es.json";
import { decimalHours, marginCsvLabels, marginSummaryCsv } from "./csv";

describe("the margin as CSV", () => {
  it("hours to two places, half up; a name a spreadsheet would run is kept as text", () => {
    expect([decimalHours(2760), decimalHours(50), decimalHours(1), decimalHours(-90)]).toEqual(["46.00", "0.83", "0.02", "-1.50"]);
    const totals = { minutesPaid: 2760, billedCents: 129_850, payCents: 89_425, burdenCents: 18_000, marginCents: 22_425, marginPermille: 173, incomplete: 0 };
    expect(marginSummaryCsv([{ key: "x", name: "=cmd()", totals, lines: [] }, { key: "none", name: null, totals: { ...totals, billedCents: 0, marginPermille: null }, lines: [] }], "client", marginCsvLabels(en.margin)).split("\r\n")).toEqual([
      "Client,Hours,Billed,Pay,Estimated burden,Gross margin,Margin %",
      "'=cmd(),46.00,1298.50,894.25,180.00,224.25,17.3%",
      "None,46.00,0.00,894.25,180.00,224.25,",
      "",
    ]);
  });

  it("speaks the screen's language", () => {
    const totals = { minutesPaid: 60, billedCents: 100, payCents: 50, burdenCents: 10, marginCents: 40, marginPermille: 400, incomplete: 0 };
    expect(marginSummaryCsv([{ key: "none", name: null, totals, lines: [] }], "recruiter", marginCsvLabels(es.margin)).split("\r\n").slice(0, 2)).toEqual(["Reclutador(a),Horas,Facturado,Pago,Carga estimada,Margen bruto,Margen %", "Ninguno,1.00,1.00,0.50,0.10,0.40,40.0%"]);
  });
});
