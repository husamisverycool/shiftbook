/**
 * Reads photos, scans and PDFs (SPEC §6):
 *   page images → redact SSN/DOB text locally → store original + redacted → pass A and pass B on the
 *   redacted page (different prompts, different image preparation) → compare → raw entries.
 * Only the redacted image ever leaves the server. Any SSN-shaped text the model returns anyway is
 * removed before anything is stored, and the document notes say so.
 */
import type { ImageReader, ReadResult } from "../intake/service";
import type { RawEntry } from "../intake/types";
import type { DocumentStore } from "../storage";
import { comparePasses, mapCropBoxToPage } from "./compare";
import { passBImage, toPageImages } from "./images";
import type { ExtractionOutput } from "./output-schema";
import { buildPassRequest } from "./prompts";
import { findSensitiveRegions, redact } from "./redact";
import type { ExtractionTransport } from "./transport";

const SSN_SHAPE = /(?<![\d-])\d{3}[- ]?\d{2}[- ]?\d{4}(?![\d-])/g;

/** Removes SSN-shaped text from every string in a model answer; returns how many were removed. */
function scrub(output: ExtractionOutput): { output: ExtractionOutput; removed: number } {
  let removed = 0;
  const clean = (s: string | null) => {
    if (s === null) return s;
    return s.replace(SSN_SHAPE, () => {
      removed += 1;
      return "[removed]";
    }).replace(/\s*\[removed\]\s*/g, " ").trim();
  };
  const rows = output.rows.map((r) => ({
    ...r,
    workerName: { ...r.workerName, text: clean(r.workerName.text) },
    date: { ...r.date, text: clean(r.date.text) },
    timeIn: { ...r.timeIn, text: clean(r.timeIn.text) },
    timeOut: { ...r.timeOut, text: clean(r.timeOut.text) },
    breakMinutes: { ...r.breakMinutes, text: clean(r.breakMinutes.text) },
    totalHours: { ...r.totalHours, text: clean(r.totalHours.text) },
    crossedOut: r.crossedOut.map((c) => clean(c) ?? ""),
  }));
  return {
    output: {
      ...output,
      clientName: clean(output.clientName),
      shiftLabel: clean(output.shiftLabel),
      rows,
      workerTotals: output.workerTotals.map((t) => ({ ...t, workerName: clean(t.workerName) ?? "" })),
    },
    removed,
  };
}

export function createImageReader(deps: { transport: ExtractionTransport; store: DocumentStore }): ImageReader {
  return {
    async read(input): Promise<ReadResult> {
      const pages = await toPageImages(input.bytes, input.mediaType);
      const periodYear = Number(input.period.endsOn.slice(0, 4));
      const entries: RawEntry[] = [];
      const notes: string[] = [];
      const pageInfo: ReadResult["pages"] = [];
      let clientHint: string | null = null;

      for (const page of pages) {
        const regions = await findSensitiveRegions(page.jpeg, periodYear);
        const redacted = await redact(page.jpeg, regions);
        const prefix = `${input.agencyId}/documents/${input.documentId}`;
        const storageKey = `${prefix}/page-${page.pageNumber}.jpg`;
        const redactedStorageKey = `${prefix}/page-${page.pageNumber}-redacted.jpg`;
        await deps.store.put(storageKey, page.jpeg);
        await deps.store.put(redactedStorageKey, redacted);
        pageInfo.push({ pageNumber: page.pageNumber, storageKey, redactedStorageKey, width: page.width, height: page.height, redactions: regions.length });

        const b = await passBImage(redacted);
        const [rawA, rawB] = await Promise.all([
          deps.transport.run(buildPassRequest({ pass: "A", image: redacted, period: input.period, clients: input.clients })),
          deps.transport.run(buildPassRequest({ pass: "B", image: b.jpeg, period: input.period, clients: input.clients })),
        ]);
        const a = scrub(rawA);
        const bb = scrub(rawB);
        if (a.removed + bb.removed > 0) {
          notes.push(`Page ${page.pageNumber}: an identifying number in the reading was removed and not stored.`);
        }
        const reading = comparePasses(a.output, bb.output, (box) => mapCropBoxToPage(box, b.crop), page.pageNumber);
        clientHint ??= reading.clientHint;
        for (const e of reading.entries) entries.push({ ...e, rowIndex: entries.length });
      }

      return {
        parsed: { kind: input.mediaType === "application/pdf" ? "pdf" : "image", profileKey: null, clientHint, entries, notes },
        pages: pageInfo,
      };
    },
  };
}
