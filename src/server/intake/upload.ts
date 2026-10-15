/**
 * Receiving a batch of uploaded files (docs/patterns/inbox.md: refused files are listed with their
 * reason at once). Each file is stored in its own transaction, so the files taken before a refusal
 * stay taken; a period whose files exist, or that someone else is changing, stops the batch.
 */
import type { Tx } from "../db/client";
import { PeriodBusyError, PeriodLockedError, PeriodNotFoundError } from "../run/period-lock";
import type { Actor } from "../session";
import type { DocumentStore } from "../storage";
import { classifyUpload, receiveDocument } from "./service";

import { MAX_TIMESHEET_BYTES } from "../../lib/limits";

export const MAX_UPLOAD_BYTES = MAX_TIMESHEET_BYTES;

export interface UploadResult {
  accepted: string[];
  refused: { filename: string; reason: "unsupported" | "tooLarge" | "duplicate" }[];
  /** The period's files were already created: nothing more can be added. */
  locked?: true;
  /** Someone else is changing the period: the rest of the batch was not taken; try again. */
  busy?: true;
}

export async function receiveUploads(
  withAgency: <T>(agencyId: string, fn: (tx: Tx) => Promise<T>) => Promise<T>,
  actor: Actor,
  store: DocumentStore,
  payPeriodId: string,
  files: { name: string; size: number; bytes: () => Promise<Uint8Array> | Uint8Array }[],
): Promise<UploadResult> {
  const result: UploadResult = { accepted: [], refused: [] };
  for (const file of files) {
    if (!classifyUpload(file.name)) {
      result.refused.push({ filename: file.name, reason: "unsupported" });
      continue;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      result.refused.push({ filename: file.name, reason: "tooLarge" });
      continue;
    }
    const bytes = await file.bytes();
    try {
      const { duplicate } = await withAgency(actor.agencyId, (tx) => receiveDocument(tx, actor, store, { payPeriodId, filename: file.name, bytes }));
      if (duplicate) result.refused.push({ filename: file.name, reason: "duplicate" });
      else result.accepted.push(file.name);
    } catch (error) {
      if (error instanceof PeriodNotFoundError) {
        result.refused.push({ filename: file.name, reason: "unsupported" });
        break;
      }
      if (error instanceof PeriodLockedError) result.locked = true;
      else if (error instanceof PeriodBusyError) result.busy = true;
      else throw error;
      break;
    }
  }
  return result;
}
