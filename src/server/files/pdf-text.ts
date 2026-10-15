/** The text of a PDF, page by page, joined with spaces (used to check generated documents). */
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

export async function pdfText(bytes: Uint8Array): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdfRoot = dirname(createRequire(import.meta.url).resolve("pdfjs-dist/package.json"));
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: false, standardFontDataUrl: `${join(pdfRoot, "standard_fonts")}/` });
  const doc = await task.promise;
  try {
    const parts: string[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const content = await (await doc.getPage(n)).getTextContent();
      for (const item of content.items) if ("str" in item) parts.push(item.str);
    }
    return parts.join(" ").replace(/\s+/g, " ");
  } finally {
    await task.destroy();
  }
}
