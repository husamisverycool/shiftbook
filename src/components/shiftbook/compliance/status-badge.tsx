"use client";

import { useTranslations } from "next-intl";
import type { DisplayStatus } from "@/server/compliance/status";
import { Status, type Tone } from "../status";

/** One status language (decision 0029): overdue must be acted on, due soon needs attention. */
export const STATUS_TONE: Record<DisplayStatus, Tone> = { overdue: "critical", due_soon: "warning", upcoming: "neutral", done: "success", not_applicable: "neutral" };

/** The status in words (never color alone): Overdue, Due soon, Upcoming, Done, Not applicable. */
export function StatusBadge({ status, size }: { status: DisplayStatus; size?: "default" | "lg" }) {
  const t = useTranslations("compliance.statuses");
  return (
    <Status tone={STATUS_TONE[status]} size={size} data-testid={`status-${status}`}>
      {t(status)}
    </Status>
  );
}
