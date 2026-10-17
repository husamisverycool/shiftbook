import { describe, expect, it } from "vitest";
import { ExtractionRefusedError, RecordingMissingError } from "../server/extraction/transport";
import { UnrecognisedFileError } from "../server/intake/structured";
import { READ_FAILED, UnsupportedFileError } from "../server/intake/service";
import { PeriodBusyError, PeriodLockedError } from "../server/run/period-lock";
import { readError } from "./read-errors";

describe("why a timesheet could not be read, said again in the reader's language", () => {
  it("knows each of Granite's own reasons, with the file's name where it has one", () => {
    expect(readError(new RecordingMissingError("a".repeat(64)).message)).toEqual({ key: "noRecording" });
    expect(readError(READ_FAILED)).toEqual({ key: "readFailed" });
    expect(readError(new PeriodLockedError().message)).toEqual({ key: "periodLocked" });
    expect(readError(new PeriodBusyError().message)).toEqual({ key: "periodBusy" });
    expect(readError(new UnsupportedFileError("week.docx").message)).toEqual({ key: "unsupported", values: { file: "week.docx" } });
    expect(readError(new UnrecognisedFileError("odd: columns.csv: the columns do not match any saved mapping profile.").message)).toEqual({ key: "unmapped", values: { file: "odd: columns.csv" } });
    expect(readError(new ExtractionRefusedError("policy").message)).toEqual({ key: "refused" });
  });

  it("leaves anything else as it was written", () => {
    expect(readError(null)).toBeNull();
    expect(readError("Some other reason.")).toBeNull();
  });
});
