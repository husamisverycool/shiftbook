import type { Tone } from "../status";

/** A pay period's state as one status (decision 0029): blocked needs action; files made is done. */
export const PERIOD_TONE: Record<string, Tone> = {
  none: "neutral",
  draft: "info",
  validating: "info",
  blocked: "critical",
  ready: "warning",
  approved: "warning",
  exported: "success",
  closed: "success",
  correcting: "info",
};
