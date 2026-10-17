"use client";

import { CircleAlertIcon, CircleCheckIcon, CircleIcon, CircleSlashIcon, ClockIcon, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import type { DisplayStatus } from "@/server/compliance/status";
import { Status, type Tone } from "../status";
import { StatusIcon } from "../status-icon";

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

/** The status as the list's group band shows it (Linear's group headers lead with the status's icon). */
const STATUS_ICON: Record<DisplayStatus, LucideIcon> = { overdue: CircleAlertIcon, due_soon: ClockIcon, upcoming: CircleIcon, done: CircleCheckIcon, not_applicable: CircleSlashIcon };

export function ComplianceStatusIcon({ status }: { status: DisplayStatus }) {
  const t = useTranslations("compliance.statuses");
  return <StatusIcon status={{ icon: STATUS_ICON[status], tone: STATUS_TONE[status], label: t(status) }} decorative />;
}
