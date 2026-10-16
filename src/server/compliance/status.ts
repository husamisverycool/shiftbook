/**
 * What a duty shows (decision J1): worked out from its dates when shown, never stored (Vanta: "Due
 * soon" once the reminder is sent, "Overdue" once the renewal date passes).
 */
export type DisplayStatus = "overdue" | "due_soon" | "upcoming" | "done" | "not_applicable";

/** Most urgent first (Vanta sorts the most urgent to the top). */
export const STATUS_ORDER: readonly DisplayStatus[] = ["overdue", "due_soon", "upcoming", "done", "not_applicable"];

export function displayStatus(o: { status: "open" | "done" | "not_applicable"; dueOn: string; remindOn: string | null }, today: string): DisplayStatus {
  if (o.status !== "open") return o.status;
  if (today > o.dueOn) return "overdue";
  if (today >= (o.remindOn ?? o.dueOn)) return "due_soon";
  return "upcoming";
}
