/**
 * Why a timesheet could not be read, in the reader's language. The reason is stored as Granite's own
 * English (intake/service.ts plainReason); each of those reasons is known here so a screen can say it
 * again from its key (convert.upload.readErrors), the file's name kept. Anything else shows as written.
 */
import { NO_RECORDING_PREFIX } from "./no-recording";

export type ReadErrorKey = "noRecording" | "readFailed" | "periodLocked" | "periodBusy" | "unsupported" | "unmapped" | "refused";

const KNOWN: [RegExp, ReadErrorKey][] = [
  [/^Something went wrong while reading this timesheet\./, "readFailed"],
  [/^This pay period's files were already created, so its hours and totals can no longer change\.$/, "periodLocked"],
  [/^Someone else is changing this pay period right now/, "periodBusy"],
  [/^(?<file>.+): only JPG, PNG, HEIC, PDF, CSV and XLSX files are accepted\.$/, "unsupported"],
  [/^(?<file>.+): the columns do not match any saved mapping profile\.$/, "unmapped"],
  [/^The model declined to read this document /, "refused"],
];

export function readError(error: string | null): { key: ReadErrorKey; values?: { file: string } } | null {
  if (!error) return null;
  if (error.startsWith(NO_RECORDING_PREFIX)) return { key: "noRecording" };
  for (const [pattern, key] of KNOWN) {
    const m = pattern.exec(error);
    if (m) return m.groups?.file ? { key, values: { file: m.groups.file } } : { key };
  }
  return null;
}
