/** Shapes and constants shared by the converter's server page and client components (plain data only). */

export const STEPS = ["upload", "hours", "totals", "files"] as const;
export type Step = (typeof STEPS)[number];
export interface GridField {
  value: string | null;
  page: number | null;
  box: { x: number; y: number; w: number; h: number } | null;
  passA: string | null;
  passB: string | null;
  agree: boolean | null;
  handwritten: boolean;
  confidence: "high" | "medium" | "low";
  checks: string[];
  source?: { row: number; column: string };
  edited?: boolean;
}

export interface GridRow {
  id: string;
  workerId: string | null;
  workerName: string;
  workerNameRaw: string;
  clientName: string | null;
  workDate: string | null;
  inMinute: number | null;
  outMinute: number | null;
  breakMinutes: number | null;
  minutes: number | null;
  confidence: "high" | "medium" | "low";
  status: "extracted" | "needs_review" | "reviewed" | "client_approved" | "disputed" | "locked" | "rejected";
  reviewReasons: string[];
  fields: Record<string, GridField | undefined>;
  document: { id: string; filename: string; kind: string; pageCount: number | null } | null;
  rowIndex: number;
}

/** Rows a person must look at before totals: still to review, or not matched to a worker or hours. */
export const needsAttention = (r: Pick<GridRow, "status" | "workerId" | "minutes">) =>
  r.status === "needs_review" || (r.status !== "rejected" && r.status !== "locked" && (r.workerId === null || r.minutes === null));
