import { describe, expect, it } from "vitest";
import { DemoTranslator, redactForModel } from "./translate";

describe("message translation (slice t)", () => {
  it("takes out SSN-shaped numbers and dates before any model call (CLAUDE.md)", () => {
    expect(redactForModel("My SSN is 900-12-3456 and I was born 04/02/1995")).toBe("My SSN is [number removed] and I was born [date removed]");
    expect(redactForModel("born 1995-04-02, ssn 900123456")).toBe("born [date removed], ssn [number removed]");
    expect(redactForModel("I worked 8 hours")).toBe("I worked 8 hours");
  });

  it("the demo translates only its own messages, and nothing in the same language", async () => {
    const t = new DemoTranslator();
    expect(await t.translate("Sí, puedo trabajar el sábado. ¿Necesito llevar botas de seguridad?", "es", "en")).toBe("Yes, I can work Saturday. Do I need to bring safety boots?");
    expect(await t.translate("Something else", "en", "es")).toBeNull();
    expect(await t.translate("Payday is Friday. Your pay stub will be in the app.", "en", "en")).toBeNull();
  });
});
