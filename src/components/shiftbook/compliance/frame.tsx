"use client";

// Pattern: docs/patterns/compliance.md — Vanta Tests page (subject areas at the side with counts;
// search by name; filters by status and framework; owner filter), Linear display options.
import { SearchIcon, SettingsIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import type { Area } from "@/server/compliance/queries";
import { typing } from "../app-sidebar";

export type ComplianceTab = "list" | "calendar" | "counters" | "workersComp" | "aca";
const TABS: { tab: ComplianceTab; href: string }[] = [
  { tab: "list", href: "/compliance" },
  { tab: "calendar", href: "/compliance/calendar" },
  { tab: "counters", href: "/compliance/counters" },
  { tab: "workersComp", href: "/compliance/workers-comp" },
  { tab: "aca", href: "/compliance/aca" },
];
/** The tabs that share the list's filters. */
const FILTERED: ComplianceTab[] = ["list", "calendar"];
const AREAS: (Area | "all")[] = [
  "all",
  "registrations",
  "clients",
  "placements",
  "workers",
  "equal_pay",
  "workers_comp",
  "aca",
];
/** The filters, kept in the address and carried between the tabs. */
const KEPT = ["area", "status", "state", "owner", "q"];
const STATUS_OPTIONS = [
  "open",
  "overdue",
  "due_soon",
  "upcoming",
  "done",
  "not_applicable",
  "all",
] as const;

export function ComplianceFrame({
  tab,
  counts,
  children,
}: {
  tab: ComplianceTab;
  counts: Record<string, number> | null;
  children: ReactNode;
}) {
  const t = useTranslations("compliance");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const search = useRef<HTMLInputElement>(null);
  const kept = new URLSearchParams(
    [...params.entries()].filter(([k]) => KEPT.includes(k)),
  );
  const go = (next: Record<string, string>) => {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    const s = p.toString();
    router.replace(s ? `${pathname}?${s}` : pathname);
  };
  const area = params.get("area") ?? "all";

  // "/" puts the cursor in the search box (Google Calendar's search key).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.key !== "/" ||
        e.metaKey ||
        e.ctrlKey ||
        e.altKey ||
        typing(e.target) ||
        document.querySelector("[role=dialog]")
      )
        return;
      e.preventDefault();
      search.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="mx-auto flex w-full max-w-7xl min-w-0 flex-col gap-4 px-4 py-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-2xl font-semibold">{t("title")}</h1>
        <Link
          href="/settings/compliance"
          className={buttonVariants({ variant: "ghost", size: "sm" })}
          data-testid="compliance-settings-link"
        >
          <SettingsIcon />
          {t("settings")}
        </Link>
      </div>
      <nav
        aria-label={t("tabsLabel")}
        className="flex w-fit gap-1 rounded-lg bg-muted p-[3px]"
      >
        {TABS.map((x) => (
          <Link
            key={x.tab}
            href={
              kept.size > 0 && FILTERED.includes(x.tab)
                ? `${x.href}?${kept.toString()}`
                : x.href
            }
            aria-current={x.tab === tab ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1 text-sm font-medium text-foreground/60 transition-colors hover:text-foreground dark:text-muted-foreground",
              x.tab === tab &&
                "bg-background text-foreground shadow-sm dark:text-foreground",
            )}
            data-testid={`compliance-tab-${x.tab}`}
          >
            {t(`tabs.${x.tab}`)}
          </Link>
        ))}
      </nav>
      {counts === null ? (
        children
      ) : (
        <div className="flex flex-col gap-4 md:flex-row">
          <nav aria-label={t("areasLabel")} className="md:w-48 md:shrink-0">
            <ul className="flex flex-wrap gap-1 md:flex-col">
              {AREAS.map((a) => (
                <li key={a}>
                  <button
                    type="button"
                    aria-current={area === a ? "true" : undefined}
                    onClick={() => go({ area: a === "all" ? "" : a })}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted",
                      area === a && "bg-muted font-medium",
                    )}
                    data-testid={`area-${a}`}
                  >
                    <span>{t(`areas.${a}`)}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {a === "all"
                        ? Object.values(counts).reduce((s, n) => s + n, 0)
                        : (counts[a] ?? 0)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </nav>
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <div className="flex flex-wrap items-end gap-2">
              <form
                role="search"
                className="flex flex-col gap-1"
                onSubmit={(e) => {
                  e.preventDefault();
                  go({ q: q.trim() });
                }}
              >
                <Label
                  htmlFor="compliance-search"
                  className="text-xs text-muted-foreground"
                >
                  {t("search")}
                </Label>
                <div className="relative">
                  <SearchIcon className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="compliance-search"
                    ref={search}
                    className="w-56 pl-8"
                    value={q}
                    placeholder={t("searchPlaceholder")}
                    onChange={(e) => setQ(e.target.value)}
                    onBlur={() =>
                      q.trim() !== (params.get("q") ?? "") &&
                      go({ q: q.trim() })
                    }
                    data-testid="compliance-search"
                  />
                </div>
              </form>
              <Filter
                id="compliance-status"
                label={t("statusFilter")}
                value={params.get("status") ?? "open"}
                onChange={(v) => go({ status: v === "open" ? "" : v })}
                options={STATUS_OPTIONS.map((o) => [
                  o,
                  t(`statusOptions.${o}`),
                ])}
              />
              <Filter
                id="compliance-state"
                label={t("stateFilter")}
                value={params.get("state") ?? ""}
                onChange={(v) => go({ state: v })}
                options={[
                  ["", t("anyState")],
                  ...(["IL", "MA", "NJ", "US"] as const).map(
                    (s) => [s, t(`states.${s}`)] as [string, string],
                  ),
                ]}
              />
              <Filter
                id="compliance-owner"
                label={t("ownerFilter")}
                value={params.get("owner") ?? ""}
                onChange={(v) => go({ owner: v })}
                options={[
                  ["", t("owners.any")],
                  ["me", t("owners.me")],
                  ["none", t("owners.none")],
                ]}
              />
            </div>
            {children}
          </div>
        </div>
      )}
    </div>
  );
}

function Filter({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: (readonly [string, string])[];
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <NativeSelect
        id={id}
        className="w-44"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        data-testid={id}
      >
        {options.map(([v, l]) => (
          <NativeSelectOption key={v} value={v}>
            {l}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </div>
  );
}
