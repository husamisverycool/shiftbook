/**
 * Decision 0030: a run's fingerprint leaves every `say` and `said` out, so a run computed before the
 * message keys keeps its fingerprint and an approval of it stands. For each approved answer key, the
 * engine's part of the fingerprint input — the result as JSON through the run service's own replacer —
 * is pinned to the SHA-256 of what the engine wrote before the keys: sha256(JSON.stringify(computePay(input)))
 * with the engine at commit b927d82. A later change to an answer key the owner approves changes its
 * fingerprint too, and this test says so: il-s42-720h-crossing-midweek carries the Illinois equal-pay
 * note, renamed "Tabulado's" with the owner's approval of the answer keys (2026-10-17, decision 0034).
 */
import { createHash } from "node:crypto";
import { computePay } from "@shiftbook/rules";
import { describe, expect, it } from "vitest";
import { loadRuleCases } from "../../../tests/golden-runners/shared";
import { withoutSay } from "./service";

const BEFORE_KEYS: Record<string, string> = {
  "below-minimum-wage-topped-up": "985c3f7e1387e3344ee7d85b9267612c3cdd6abc8b0202c4adea5be7ce5e00b3",
  "ca-daily-and-seventh-day": "149d4bea538e7b8df00d250f947969eaa085db6ef94d35300242afccafc3c576",
  "ca-flat-sum-bonus-overtime": "a4becc795792388256f6a3aac614e57e3b3a14af89601c614065b906f821b3cd",
  "ca-meal-rest-premium-at-regular-rate": "d0d09016dfb07e1d5bc8acfaa99d051820a93a543ee6a1e3955ad106f007117d",
  "ca-minimum-wage-rises-new-year": "916d67818f5b79021be0dc922959dbbbd2692e3a23aad1aa30d446011be938b2",
  "ca-reporting-time-pay": "615c4c7f72ed98c7237b0be50df5aa7e2314bd0ffdd8bef9a39317c40cb8567e",
  "ca-seven-days-across-two-workweeks": "9a71d2c8d3cd3d3fee5eaed3bc179a42ef5b38bf8b6b596d266c97613beeadfc",
  "ca-seventh-day-billing-variants": "2455599dd24e42ed7257a35457b99d457e23b94cf1636305d446bff10b2bf4ad",
  "chicago-minimum-wage-rises-july-1": "f9acbabebbf1429f812465a8f65beaa8ff3d6478b314e2b8d7a58a0a9d35cfe6",
  "client-overtime-billing-variants": "b53e9f3acbd5f8b276309a1e5a3fb93c26da00f63a0da36a789959adad86597f",
  "cook-county-minimum-wage": "feb9eabaedaa0d65b97b81a1854ede82ae3d3b9d11f2e60bb645e3d7c7258e40",
  "il-day-labor-four-hour-minimum": "eedc507e094ba66b9a85c4361002345895b2e4ec16da49de47482c1222b9e406",
  "il-nondiscretionary-bonus-in-regular-rate": "e986c0d64471f444bde0bd7402ebf3508d113d78b69bbc7120f33964c8bf485a",
  "il-s42-720h-crossing-midweek": "5964a9e045b828b9c31c1cd0789602765e11c8873f48b758764db673040d4ed0",
  "il-straight-time-38h": "c08f4f7cd3357bf3acbbddc10b54499394133c5e0e52b78afa2a73dbc0689a3a",
  "il-weekly-overtime-44h": "c6a81cf3eea77ca70ac75cd26e863db3d3ead6254bc4310d833a9c6cb21bae83",
  "ma-exactly-40h-no-overtime": "af69a8a0fa205f65b4deb11605182ab578c9a166a5902f6cb52f63d4d92c0471",
  "ma-overtime-rounding-shown": "ba29d683cea4f31b806814bc66b37316501406fb89b2fc715ab5f26fa40bbb71",
  "ma-thanksgiving-holiday-policy": "2b3c6a23bd4b023b0eaa354a1c4558226d8863acd4c36095a154177903a7ac56",
  "multi-rate-own-sites-overtime-billing": "d1b398fddb9206ed2073b8b2e4d0c49276e90764fdfd05bb2f576d5c1a9334a4",
  "multi-rate-regular-rate": "70022dd1a039c8c12dd52e77f90f388128a6583a5838f1612fd7f969926edd45",
  "overtime-falls-on-the-client-that-crossed-40h": "9075e4b0144cfcca60d1e17f27f9c7bfe1a620b298cf189fbb4e9f93dc04b4cf",
  "overtime-rounding-half-cent-tie": "69ddb748b40701359589b4721c779a2b662e6a97c8cdce225c1fd4d445bd71e0",
  "overtime-rounding-up": "a20c245a80eb8073b7e6547e98fe174c9dec34d41259b34181dc39f4132a3662",
  "unknown-jurisdiction-blocked": "0d702ec67420c1176b76dd69e4619897e2c858b2465841eaf50da3b4af20c9dc",
};

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");
const cases = loadRuleCases("tests/goldens/rules");

describe("an approved run keeps its fingerprint (decision 0030)", () => {
  it("every pinned answer key is still approved", () => {
    const names = new Set(cases.map((c) => c.name));
    expect(Object.keys(BEFORE_KEYS).filter((name) => !names.has(name))).toEqual([]);
    expect(Object.keys(BEFORE_KEYS).length).toBeGreaterThanOrEqual(25);
  });

  for (const c of cases.filter((x) => Object.hasOwn(BEFORE_KEYS, x.name))) {
    it(`${c.name}: the result without its keys is, byte for byte, what the engine wrote before them`, () => {
      const r = computePay(c.input);
      expect(sha256(JSON.stringify(r, withoutSay))).toBe(BEFORE_KEYS[c.name]);
      // The keys are there; only the replacer leaves them out.
      expect(sha256(JSON.stringify(r))).not.toBe(BEFORE_KEYS[c.name]);
    });
  }
});
