import { describe, expect, it } from "vitest";
import { MAP_HEIGHT, MAP_WIDTH, usDots } from "./us-dots";

/** The website's coverage map: a dot field of the contiguous states with the covered ones lit (slice aa). */
describe("the website's dot map", () => {
  const map = usDots();

  it("draws the country as a field of a few thousand dots", () => {
    expect(map.count.land).toBeGreaterThan(1500);
    expect(map.count.land).toBeLessThan(6000);
    expect(map.width).toBe(MAP_WIDTH);
    expect(map.height).toBe(MAP_HEIGHT);
  });

  it("lights every covered state, the big ones with more dots than the small ones", () => {
    for (const n of Object.values(map.count.lit)) expect(n).toBeGreaterThanOrEqual(3);
    expect(map.count.lit.CA).toBeGreaterThan(map.count.lit.IL);
    expect(map.count.lit.IL).toBeGreaterThan(map.count.lit.NJ);
  });

  it("puts each pin inside the map, California's west of Illinois's, New Jersey's south of Massachusetts's", () => {
    for (const p of Object.values(map.pins)) {
      expect(p.x).toBeGreaterThan(0);
      expect(p.x).toBeLessThan(map.width);
      expect(p.y).toBeGreaterThan(0);
      expect(p.y).toBeLessThan(map.height);
    }
    expect(map.pins.CA.x).toBeLessThan(map.pins.IL.x);
    expect(map.pins.NJ.y).toBeGreaterThan(map.pins.MA.y);
  });
});
