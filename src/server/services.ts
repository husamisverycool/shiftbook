/**
 * The app's wiring: one place that decides which implementations run. Demo mode reads photos and
 * PDFs only from readings recorded earlier (no outside calls); live mode calls the model.
 */
import { db, withAgency } from "./db";
import type { ApprovalDeps } from "./approvals/service";
import { env } from "./env";
import { DemoMailboxTransport, ResendTransport, type MailTransport } from "./mail/transport";
import { RecordedTransport, AnthropicTransport, type ExtractionTransport } from "./extraction/transport";
import { createImageReader } from "./extraction/pipeline";
import { queueWaitingDocuments, readStoredDocument, type ImageReader } from "./intake/service";
import { runPendingJobs, touchJob } from "./jobs";
import { isDemo, type Actor } from "./session";
import { documentStore } from "./storage";

/** Where demo mode reads recorded readings (end-to-end tests point it at their own fixtures). */
export const RECORDINGS_DIR = process.env.SHIFTBOOK_RECORDINGS_DIR ?? "demo/recordings";

function transport(): ExtractionTransport {
  return isDemo() ? new RecordedTransport(RECORDINGS_DIR) : new AnthropicTransport();
}

export function imageReader(): ImageReader {
  return createImageReader({ transport: transport(), store: documentStore });
}

/** Reads every queued upload for the agency, one at a time. Safe to call more than once. */
export async function processQueuedDocuments(actor: Actor): Promise<number> {
  const reader = imageReader();
  await withAgency(actor.agencyId, (tx) => queueWaitingDocuments(tx, actor));
  return runPendingJobs(withAgency, actor.agencyId, async (job) => {
    if (job.kind !== "read_document") throw Object.assign(new Error(`unknown job kind ${job.kind}`), { permanent: true });
    await readStoredDocument({ withAgency, store: documentStore, imageReader: reader }, actor, String(job.payload.documentId), () => touchJob(withAgency, actor.agencyId, job.id));
  });
}

/** Where an agency's email goes: the demo mailbox in demo mode (no outside calls), Resend when live (decision 0012). */
export function mailTransport(agencyId: string): MailTransport {
  return isDemo() ? new DemoMailboxTransport(withAgency, agencyId) : new ResendTransport({ apiKey: process.env.RESEND_API_KEY, fromAddress: process.env.MAIL_FROM });
}

/**
 * The app's address for links in emails. Live: only the configured address (never the request's
 * Host header, which a caller could forge to send a client a link to another site). Demo: the
 * address the page was opened at, when none is configured.
 */
export function linkBaseUrl(requestOrigin: string | null): string {
  if (env.appUrl) return env.appUrl;
  if (isDemo() && requestOrigin) return requestOrigin;
  throw new Error("SHIFTBOOK_APP_URL is not set in the environment settings, so links in emails cannot be made.");
}

export function approvalDeps(baseUrl: string): ApprovalDeps {
  return { db, withAgency, mailTransport, baseUrl };
}
