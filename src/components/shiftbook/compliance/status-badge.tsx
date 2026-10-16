"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import type { DisplayStatus } from "@/server/compliance/status";

/** The status in words (never color alone): Overdue, Due soon, Upcoming, Done, Not applicable. */
export function StatusBadge({ status }: { status: DisplayStatus }) {
  const t = useTranslations("compliance.statuses");
  // Overdue is red text on the page's own background (a red tint behind small text fails contrast).
  const variant = status === "due_soon" ? "default" : status === "done" ? "secondary" : "outline";
  return (
    <Badge variant={variant} className={status === "overdue" ? "border-destructive text-destructive" : undefined} data-testid={`status-${status}`}>
      {t(status)}
    </Badge>
  );
}
