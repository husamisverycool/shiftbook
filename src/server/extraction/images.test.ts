import { readFileSync } from "node:fs";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { PASS_B_CROP, passBImage, toPageImages } from "./images";

const SAMPLES = "demo/samples/2026-10-05";

describe("toPageImages", () => {
  it("converts an iPhone HEIC photo to an upright JPEG page", async () => {
    const pages = await toPageImages(readFileSync(`${SAMPLES}/IL-prairie-line-sign-in-2026-10-05.heic`), "image/heic");
    expect(pages).toHaveLength(1);
    const meta = await sharp(pages[0]!.jpeg).metadata();
    expect(meta.format).toBe("jpeg");
    expect(pages[0]!.width).toBe(meta.width);
    expect(Math.max(meta.width!, meta.height!)).toBeLessThanOrEqual(2000);
  });

  it("keeps a JPEG photo as one page, no larger than 2000 px on its long side", async () => {
    const pages = await toPageImages(readFileSync(`${SAMPLES}/IL-prairie-line-sign-in-2026-10-06.jpg`), "image/jpeg");
    expect(pages.map((p) => p.pageNumber)).toEqual([1]);
    expect(Math.max(pages[0]!.width, pages[0]!.height)).toBeLessThanOrEqual(2000);
  });

  it("applies the camera's orientation flag", async () => {
    const tall = await sharp({ create: { width: 40, height: 80, channels: 3, background: "#fff" } }).jpeg().withMetadata({ orientation: 6 }).toBuffer();
    const [page] = await toPageImages(tall, "image/jpeg");
    expect([page!.width, page!.height]).toEqual([80, 40]);
  });

  it("renders each PDF page", async () => {
    const pages = await toPageImages(readFileSync(`${SAMPLES}/MA-harborview-weekly-hours-signed.pdf`), "application/pdf");
    expect(pages).toHaveLength(1);
    expect(pages[0]!.width).toBeGreaterThan(pages[0]!.height); // landscape
    const stats = await sharp(pages[0]!.jpeg).stats();
    expect(stats.channels[0]!.min).toBeLessThan(80); // there is dark ink on the page, not a blank render
  });
});

describe("passBImage", () => {
  it("crops the margins and enhances contrast for the independent second reading", async () => {
    const [page] = await toPageImages(readFileSync(`${SAMPLES}/IL-prairie-line-sign-in-2026-10-06.jpg`), "image/jpeg");
    const b = await passBImage(page!.jpeg);
    expect(b.crop).toEqual(PASS_B_CROP);
    const meta = await sharp(b.jpeg).metadata();
    expect(meta.width).toBeLessThan(page!.width);
    expect(meta.channels).toBe(1); // grayscale
  });
});
