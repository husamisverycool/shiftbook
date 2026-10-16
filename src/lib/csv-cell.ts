/**
 * One CSV cell. A cell a spreadsheet would run as a formula (starting with = + - @, a tab or a
 * carriage return, and not a number) is kept as text with a leading apostrophe before it is quoted
 * (decision 0019).
 */
export function csvCell(v: string): string {
  const safe = /^[=+\-@\t\r]/.test(v) && Number.isNaN(Number(v)) ? `'${v}` : v;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}
