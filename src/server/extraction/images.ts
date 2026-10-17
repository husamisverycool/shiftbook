/**
 * Page images for extraction: HEIC → JPEG, camera orientation applied, PDF pages rendered, size
 * capped. Pass B reads a differently prepared copy (margins cropped, grayscale, contrast stretched)
 * so the two readings are independent (SPEC §6: different crops for images).
 */
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import sharp from "sharp";
import type { Box } from "../db/schema";
import { packageDir } from "../package-dir";

export interface PageImage {
  pageNumber: number;
  jpeg: Buffer;
  width: number;
  height: number;
}

const MAX_SIDE = 2000;
/** Pass B sees the page with 4% trimmed from every edge (in thousandths of the page). */
export const PASS_B_CROP: Box = { x: 40, y: 40, w: 920, h: 920 };

async function normalize(input: Buffer, pageNumber: number): Promise<PageImage> {
  const { data, info } = await sharp(input)
    .rotate() // honor the EXIF orientation from phone cameras
    .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 90 })
    .toBuffer({ resolveWithObject: true });
  return { pageNumber, jpeg: data, width: info.width, height: info.height };
}

async function heicToJpeg(bytes: Uint8Array): Promise<Buffer> {
  const { default: convert } = await import("heic-convert");
  return Buffer.from(await convert({ buffer: Buffer.from(bytes), format: "JPEG", quality: 0.92 }));
}

async function renderPdf(bytes: Uint8Array): Promise<Buffer[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const { createCanvas } = await import("@napi-rs/canvas");
  const pdfRoot = packageDir("pdfjs-dist", "standard_fonts", [() => dirname(createRequire(import.meta.url).resolve("pdfjs-dist/package.json"))]);
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(bytes),
    useSystemFonts: false,
    standardFontDataUrl: `${join(pdfRoot, "standard_fonts")}/`,
  });
  const doc = await loadingTask.promise;
  const pages: Buffer[] = [];
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const scale = MAX_SIDE / Math.max(base.width, base.height);
      const viewport = page.getViewport({ scale });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas: canvas as unknown as HTMLCanvasElement, viewport }).promise;
      pages.push(Buffer.from(canvas.toBuffer("image/png")));
      page.cleanup();
    }
  } finally {
    await loadingTask.destroy();
  }
  return pages;
}

export async function toPageImages(bytes: Uint8Array, mediaType: string): Promise<PageImage[]> {
  if (mediaType === "application/pdf") {
    const rendered = await renderPdf(bytes);
    return Promise.all(rendered.map((png, i) => normalize(png, i + 1)));
  }
  if (mediaType === "image/heic" || mediaType === "image/heif") {
    return [await normalize(await heicToJpeg(bytes), 1)];
  }
  return [await normalize(Buffer.from(bytes), 1)];
}

export async function passBImage(jpeg: Buffer): Promise<{ jpeg: Buffer; crop: Box }> {
  const meta = await sharp(jpeg).metadata();
  const w = meta.width!;
  const h = meta.height!;
  const left = Math.round((w * PASS_B_CROP.x) / 1000);
  const top = Math.round((h * PASS_B_CROP.y) / 1000);
  const width = Math.round((w * PASS_B_CROP.w) / 1000);
  const height = Math.round((h * PASS_B_CROP.h) / 1000);
  const out = await sharp(jpeg)
    .extract({ left, top, width, height })
    .grayscale()
    .normalise()
    .sharpen()
    .toColourspace("b-w")
    .jpeg({ quality: 90 })
    .toBuffer();
  return { jpeg: out, crop: PASS_B_CROP };
}
