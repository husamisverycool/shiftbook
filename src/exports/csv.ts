/** Minimal, deterministic CSV writing and reading (RFC 4180 quoting, "\n" line endings unless asked, no BOM). */

export function csvField(value: string, delimiter = ","): string {
  return value.includes(delimiter) || /["\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

export function csvLine(fields: string[], delimiter = ","): string {
  return fields.map((f) => csvField(f, delimiter)).join(delimiter);
}

export function writeCsv(rows: string[][], opts: { eol?: "\n" | "\r\n"; delimiter?: string } = {}): Uint8Array {
  const eol = opts.eol ?? "\n";
  return new TextEncoder().encode(rows.map((r) => csvLine(r, opts.delimiter)).join(eol) + eol);
}

/** Parses CSV text into rows (handles quoted fields with the delimiter, quotes and newlines). */
export function readCsv(text: string, delimiter = ","): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
