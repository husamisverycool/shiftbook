/** Links that carry a secret in the path are never cached, indexed or sent on as a referrer (next.config.ts). */
import { describe, expect, it } from "vitest";
import config from "../../next.config";

describe("secret links' headers", () => {
  it("invite, reset, client approval and sign-up links (security review) carry no-referrer, no-store and noindex", async () => {
    const rules = await config.headers!();
    const sources = rules.map((r) => r.source);
    for (const source of ["/:locale(en|es)/approve/:token*", "/:locale(en|es)/invite/:token*", "/:locale(en|es)/sign-in/reset/:token+", "/:locale(en|es)/sign-up/:token+"]) {
      expect(sources).toContain(source);
      const headers = Object.fromEntries(rules.find((r) => r.source === source)!.headers.map((h) => [h.key, h.value]));
      expect(headers).toEqual({ "Referrer-Policy": "no-referrer", "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" });
    }
  });
});
