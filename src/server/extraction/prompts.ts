/**
 * The two extraction passes use genuinely different instructions (SPEC §6) so their agreement means
 * something: pass A reads the sheet as a payroll clerk would, row by row; pass B transcribes it cell
 * by cell as an independent second reader, on a differently prepared image.
 */
import type { PassRequest } from "./transport";

export const EXTRACTION_MODEL = "claude-opus-5-5";

const SHARED_RULES = `
Rules that always apply:
- Report only what is on the page. If a value cannot be read with certainty, set its text and its number to null. Never guess or fill in a value from other rows.
- Never return Social Security numbers, dates of birth, bank details or any other identifying numbers, even if they appear on the page; leave them out entirely.
- Positions: give each value's box as integers in thousandths of the image width and height (x and y of the top-left corner, then width and height), tight around the written value.
- Clock times: give minutes after midnight on a 24-hour clock (3:00 PM = 900). Use the sheet's shift label and the times around it to decide AM or PM; if it is genuinely unclear, set the number to null. A time of midnight at the end of a shift is 1440.
- Durations: lunch or break in minutes; total hours converted to minutes (7.5 hours = 450).
- When a value is struck through and another written beside it, the value meant is the one not struck through; list the struck-through text in crossedOut.
- handwritten is true when the row's values are written by hand.
`;

const SYSTEM_A = `You read temporary-staff timesheets for a staffing agency's payroll clerk. Payroll is paid from what you report, so accuracy matters more than completeness.
${SHARED_RULES}
Read the sheet the way a payroll clerk does: first the heading (client, shift, date), then each worker's row from left to right.`;

const SYSTEM_B = `You are an independent second reader checking a transcription of a workplace time record. Transcribe each cell exactly as written, one cell at a time, without relying on what other rows say.
${SHARED_RULES}
Work column by column: names first, then every date, every time in, every time out, every break, every total.`;

function instructions(pass: "A" | "B", period: { startsOn: string; endsOn: string }, clients: string[]): string {
  const context = `The pay period is ${period.startsOn} to ${period.endsOn}. The agency's clients are: ${clients.join("; ")}.`;
  if (pass === "A") {
    return `${context}
Read this timesheet. For a daily sign-in sheet, give one row per worker with time in, time out, lunch and total hours, and the sheet date. For a weekly timesheet with one column per day, give one row per worker per day worked (the date from the column heading, the hours in totalHours, no clock times), plus each worker's weekly total and the grand total as written.`;
  }
  return `${context}
Transcribe this time record into the required structure. Daily sheet: one row per person listed, with in, out, break and total exactly as written, and the date written at the top. Weekly grid: one row for every person-and-day cell that has hours (date from the day's column, hours as totalHours), then the written per-person totals and the written grand total.`;
}

export function buildPassRequest(input: {
  pass: "A" | "B";
  image: Buffer;
  period: { startsOn: string; endsOn: string };
  clients: string[];
}): PassRequest {
  return {
    pass: input.pass,
    model: EXTRACTION_MODEL,
    promptVersion: input.pass === "A" ? "a1" : "b1",
    system: input.pass === "A" ? SYSTEM_A : SYSTEM_B,
    instructions: instructions(input.pass, input.period, input.clients),
    image: { mediaType: "image/jpeg", base64: input.image.toString("base64") },
  };
}
