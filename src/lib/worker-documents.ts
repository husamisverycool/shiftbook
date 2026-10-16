/**
 * The kinds of file a worker's profile keeps (slice k, decision 0027). No Form I-9 or identity
 * documents: the I-9 is dates only (decision J4). Pure, for the screens and the schema alike.
 */
export const WORKER_DOCUMENT_KINDS = ["w4", "state_w4", "direct_deposit", "other"] as const;
export type WorkerDocumentKind = (typeof WORKER_DOCUMENT_KINDS)[number];
