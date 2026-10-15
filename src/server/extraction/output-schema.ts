/**
 * The structured answer each extraction pass must return (validated by the API's structured
 * outputs and again here). Boxes are in thousandths of the page image's width and height.
 */
import { z } from "zod";

export const BoxSchema = z.object({
  x: z.number().int().min(0).max(1000),
  y: z.number().int().min(0).max(1000),
  w: z.number().int().min(0).max(1000),
  h: z.number().int().min(0).max(1000),
});

const Cell = z.object({
  /** Exactly what is written (after any crossing-out, the value that is meant). */
  text: z.string().nullable(),
  box: BoxSchema.nullable(),
});

const MinutesCell = Cell.extend({
  /** The value in minutes: clock times as minutes after midnight (24-hour), durations as minutes. */
  minutes: z.number().int().nullable(),
});

export const ExtractedRowSchema = z.object({
  workerName: Cell,
  /** The work date for this row as YYYY-MM-DD, when the row (or the column) gives one. */
  date: Cell.extend({ iso: z.string().nullable() }),
  timeIn: MinutesCell,
  timeOut: MinutesCell,
  breakMinutes: MinutesCell,
  totalHours: MinutesCell,
  handwritten: z.boolean(),
  /** Values written then struck through in this row, as written. */
  crossedOut: z.array(z.string()),
});

export const ExtractionOutputSchema = z.object({
  documentType: z.enum(["daily_sign_in_sheet", "weekly_timesheet", "other"]),
  clientName: z.string().nullable(),
  shiftLabel: z.string().nullable(),
  /** The date printed or written for the whole sheet (sign-in sheets), as YYYY-MM-DD. */
  sheetDate: z.string().nullable(),
  rows: z.array(ExtractedRowSchema),
  /** Per-worker weekly totals as written on the document (weekly timesheets). */
  workerTotals: z.array(z.object({ workerName: z.string(), minutes: z.number().int() })),
  /** The grand total as written, in minutes, if the document has one. */
  grandTotalMinutes: z.number().int().nullable(),
});

export type ExtractionOutput = z.infer<typeof ExtractionOutputSchema>;
export type ExtractedRow = z.infer<typeof ExtractedRowSchema>;
