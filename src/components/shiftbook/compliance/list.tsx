"use client";

// Pattern: docs/patterns/compliance.md — Vanta Tests page (most urgent first; an owner picked in the
// row), Linear display options (grouped by status), the groups drawn as Linear's list draws them: a
// tinted band with the status's icon, its name and its count; rows edge to edge between hairlines.
import { useLocale, useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { setOwnerAction } from "@/app/[locale]/(app)/compliance/actions";
import { Button } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Link, useRouter } from "@/i18n/navigation";
import type { ComplianceItem } from "@/server/compliance/queries";
import { STATUS_ORDER } from "@/server/compliance/status";
import { listDate, longDate } from "../format";
import { ComplianceStatusIcon, StatusBadge } from "./status-badge";

export function ComplianceList({ items, users, nextUpcoming, filtered, today }: { items: ComplianceItem[]; users: { id: string; name: string }[]; nextUpcoming: string | null; filtered: boolean; today: string }) {
  const t = useTranslations("compliance");
  const locale = useLocale();
  const router = useRouter();
  const rows = useRef<(HTMLAnchorElement | null)[]>([]);
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 border-t py-16 text-center text-sm text-muted-foreground" data-testid="compliance-empty">
        {filtered ? (
          <>
            <p>{t("noMatch")}</p>
            <Button variant="outline" size="sm" onClick={() => router.replace("/compliance")}>
              {t("clear")}
            </Button>
          </>
        ) : (
          <>
            <p>{t("emptyOpen")}</p>
            {nextUpcoming && <p>{t("nextUpcoming", { date: longDate(nextUpcoming, locale) })}</p>}
          </>
        )}
      </div>
    );
  }
  const groups = STATUS_ORDER.map((status) => ({ status, items: items.filter((i) => i.status === status) })).filter((g) => g.items.length > 0);
  const ordered = groups.flatMap((g) => g.items.map((i) => i.id));
  // ↑/↓ move between rows, Enter opens one (the links are in order).
  const move = (from: number, by: number) => rows.current[Math.min(ordered.length - 1, Math.max(0, from + by))]?.focus();
  return (
    // Linear's grouped list: full-width tinted group bands with their count, rows edge to edge.
    <div className="flex flex-col border-t" aria-label={t("listLabel")}>
      {groups.map((g) => (
        <section key={g.status} aria-labelledby={`group-${g.status}`}>
          <h2 id={`group-${g.status}`} className="flex h-9 items-center gap-2 border-b bg-muted/70 px-3 text-sm font-medium">
            <ComplianceStatusIcon status={g.status} />
            {t(`statuses.${g.status}`)}
            <span className="font-normal text-muted-foreground tabular-nums">{g.items.length}</span>
          </h2>
          <ul>
            {g.items.map((i) => {
              const at = ordered.indexOf(i.id);
              return (
                <li key={i.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border/70 px-3 py-2 hover:bg-muted/50" data-testid="obligation-row">
                  <Link
                    href={`/compliance/${i.id}`}
                    ref={(el) => {
                      rows.current[at] = el;
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                        e.preventDefault();
                        move(at, e.key === "ArrowDown" ? 1 : -1);
                      }
                    }}
                    className="flex min-w-0 flex-1 flex-col rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="truncate text-sm font-medium">{t(`kinds.${i.kind}` as "kinds.ma_job_order")}</span>
                    <span className="truncate text-xs text-muted-foreground">{i.subject}</span>
                  </Link>
                  <span className="w-28 text-xs text-muted-foreground">{t(`states.${i.jurisdiction}` as "states.IL")}</span>
                  <span className="w-44 text-sm tabular-nums">
                    {listDate(i.dueOn, locale, today)}
                    {(i.status === "overdue" || i.status === "due_soon" || i.status === "upcoming") && <span className={`block text-xs ${i.status === "overdue" ? "text-destructive" : "text-muted-foreground"}`}>{dueIn(t, i.dueInDays)}</span>}
                  </span>
                  <OwnerPicker item={i} users={users} />
                  <span className="w-28">
                    <StatusBadge status={i.status} />
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function dueIn(t: ReturnType<typeof useTranslations<"compliance">>, days: number): string {
  if (days === 0) return t("due.today");
  return days > 0 ? t("due.in", { count: days }) : t("due.late", { count: -days });
}

/** Vanta: the owner is picked in the row; saves when chosen. */
export function OwnerPicker({ item, users }: { item: Pick<ComplianceItem, "id" | "kind" | "ownerUserId" | "ownerName" | "mayAct">; users: { id: string; name: string }[] }) {
  const t = useTranslations("compliance");
  const te = useTranslations("compliance.errors");
  const router = useRouter();
  const [value, setValue] = useState(item.ownerUserId ?? "");
  const [pending, run] = useTransition();
  if (!item.mayAct) return <span className="w-44 truncate text-sm text-muted-foreground">{item.ownerName ?? t("noOwner")}</span>;
  return (
    <NativeSelect
      className="w-44"
      value={value}
      disabled={pending}
      aria-label={t("ownerLabel", { duty: t(`kinds.${item.kind}` as "kinds.ma_job_order") })}
      onChange={(e) => {
        const before = value;
        const next = e.target.value;
        setValue(next);
        run(async () => {
          const r = await setOwnerAction(item.id, next === "" ? null : next);
          if (r.ok) {
            toast.success(t("ownerSaved"));
            router.refresh();
          } else {
            setValue(before);
            toast.error(te(r.error === "invalid" ? "generic" : r.error));
          }
        });
      }}
      data-testid="owner-picker"
    >
      <NativeSelectOption value="">{t("noOwner")}</NativeSelectOption>
      {users.map((u) => (
        <NativeSelectOption key={u.id} value={u.id}>
          {u.name}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  );
}
