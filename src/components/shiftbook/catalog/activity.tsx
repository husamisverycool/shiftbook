"use client";

// Pattern: docs/patterns/job-orders/[id].md — Activity (Attio activity tab; Linear activity feed):
// every change with who, when, what changed and the reason when one was given, newest first.
import { useLocale, useTranslations } from "next-intl";
import type { ActivityItem } from "@/server/catalog/queries";
import { money } from "../format";
import { useDateTime } from "../agency-zone";

const MONEY = new Set(["payRateCents", "billRateCents", "payMinCents", "payMaxCents"]);
const SHOWN = ["position", "shift", "headcount", "effectiveFrom", "effectiveTo", "payRateCents", "billRateCents", "startDate", "endDate", "status", "payMinCents", "payMaxCents", "prevailingWage", "socCode"];

export function ActivityList({ items, compact = false }: { items: ActivityItem[]; compact?: boolean }) {
  const t = useTranslations("activity");
  const locale = useLocale();
  const when = useDateTime();
  if (items.length === 0) return <p className="text-sm text-muted-foreground">{t("none")}</p>;
  const show = (key: string, v: unknown) => (v === null || v === undefined ? "—" : MONEY.has(key) && typeof v === "number" ? money(v, locale) : typeof v === "boolean" ? t(v ? "yes" : "no") : String(v));
  return (
    <ol className="flex flex-col gap-3" data-testid="activity">
      {items.map((e) => {
        const changes = SHOWN.filter((k) => (e.after && k in e.after) || (e.before && k in e.before)).filter((k) => e.action !== "update" || JSON.stringify(e.before?.[k]) !== JSON.stringify(e.after?.[k]));
        return (
          <li key={e.id} className="text-sm">
            <p>
              <span className="font-medium">{e.actor}</span> {t(`what.${e.entityType}.${e.action}`)}
              <span className="text-muted-foreground"> · {when(e.at)}</span>
            </p>
            {!compact && changes.length > 0 && (
              <ul className="mt-1 text-xs text-muted-foreground">
                {changes.map((k) => (
                  <li key={k}>
                    {t(`field.${k}`)}: {e.action === "update" && e.before ? `${show(k, e.before[k])} → ` : ""}
                    {show(k, (e.after ?? e.before)?.[k])}
                  </li>
                ))}
              </ul>
            )}
            {e.reason && <p className="mt-1 text-xs text-muted-foreground">{t("reason", { reason: e.reason })}</p>}
          </li>
        );
      })}
    </ol>
  );
}
