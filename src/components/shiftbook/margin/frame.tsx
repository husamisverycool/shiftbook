"use client";

// Pattern: docs/patterns/margin.md — Stripe Billing analytics (export the summary or the rows;
// configure the definitions), Stripe home (date range, as its pill "Date range | Last 7 days"),
// Mercury Insights (tabs; the time frame at the top right).
import { DownloadIcon, LockIcon, SettingsIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { EmptyState } from "../empty-state";
import { dateRange } from "../format";
import { FilterPill, PillChoices } from "../list-controls";
import { Page, PageHeader, PageTabs } from "../page";

export type MarginTab = "overview" | "overtime" | "cash" | "attendance";
export interface Period {
  from: string;
  to: string;
  preset: 4 | 13 | 52 | "custom";
}

const TABS: { tab: MarginTab; href: string }[] = [
  { tab: "overview", href: "/margin" },
  { tab: "overtime", href: "/margin/overtime" },
  { tab: "cash", href: "/margin/cash" },
  { tab: "attendance", href: "/margin/attendance" },
];
/** The address's period and grouping, carried between the tabs and into the exports. */
const KEPT = ["weeks", "from", "to", "group", "sort"];

export function MarginFrame({ tab, period, exports, children }: { tab: MarginTab; period: Period | null; exports: { label: string; kind: string }[]; children: ReactNode }) {
  const t = useTranslations("margin");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const kept = new URLSearchParams([...params.entries()].filter(([k]) => KEPT.includes(k)));
  const [custom, setCustom] = useState(period?.preset === "custom");
  const [from, setFrom] = useState(period?.from ?? "");
  const [to, setTo] = useState(period?.to ?? "");
  const go = (next: Record<string, string>) => {
    const q = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v) q.set(k, v);
      else q.delete(k);
    }
    const s = q.toString();
    router.replace(s ? `${pathname}?${s}` : pathname);
  };
  const exportHref = (kind: string) => `/api/files/margin?${new URLSearchParams([...kept.entries(), ["kind", kind], ["locale", locale]]).toString()}`;

  return (
    <Page>
      <PageHeader
        title={t("title")}
        actions={
          <>
        {period && (
          <div className="flex flex-wrap items-center gap-2">
            <FilterPill label={t("range")} value={custom ? (period.preset === "custom" ? dateRange(period.from, period.to, locale) : t("presets.custom")) : t(`presets.${period.preset as 4 | 13 | 52}`)} testId="margin-period" align="end">
              <PillChoices
                heading={t("range")}
                value={custom ? "custom" : String(period.preset)}
                options={[...(["4", "13", "52"] as const).map((w) => ({ value: w, label: t(`presets.${w}`) })), { value: "custom", label: t("presets.custom") }]}
                onChoose={(v) => {
                  if (v === "custom") setCustom(true);
                  else {
                    setCustom(false);
                    go({ weeks: v === "13" ? "" : v, from: "", to: "" });
                  }
                }}
              />
            </FilterPill>
            {custom && (
              <form
                className="flex flex-wrap items-end gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (from && to) go({ weeks: "", from, to });
                }}
              >
                <div className="flex flex-col gap-1">
                  <Label htmlFor="margin-from" className="text-xs text-muted-foreground">
                    {t("from")}
                  </Label>
                  <Input id="margin-from" type="date" className="w-40" value={from} onChange={(e) => setFrom(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="margin-to" className="text-xs text-muted-foreground">
                    {t("to")}
                  </Label>
                  <Input id="margin-to" type="date" className="w-40" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
                </div>
                <Button type="submit" size="sm" variant="outline" disabled={!from || !to || to < from}>
                  {t("apply")}
                </Button>
              </form>
            )}
          </div>
        )}
        {exports.length === 1 ? (
          <a href={exportHref(exports[0]!.kind)} download className={buttonVariants({ variant: "outline", size: "sm" })} data-testid={`export-${exports[0]!.kind}`}>
            <DownloadIcon />
            {exports[0]!.label}
          </a>
        ) : exports.length > 1 ? (
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" size="sm" data-testid="margin-export" />}>
              <DownloadIcon />
              {t("export")}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {exports.map((x) => (
                <DropdownMenuItem key={x.kind} render={<a href={exportHref(x.kind)} download data-testid={`export-${x.kind}`} />}>
                  {x.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
        <Link href="/settings/margin" className={buttonVariants({ variant: "outline", size: "sm" })} data-testid="margin-settings-link">
          <SettingsIcon />
          {t("settings")}
        </Link>
          </>
        }
        tabs={<PageTabs label={t("tabsLabel")} current={tab} tabs={TABS.map((x) => ({ key: x.tab, label: t(`tabs.${x.tab}`), href: kept.size > 0 ? `${x.href}?${kept.toString()}` : x.href, testId: `margin-tab-${x.tab}` }))} />}
      />
      {children}
    </Page>
  );
}

/** Margin is for the Owner and the accountant (SPEC §2). */
export function NotForRole() {
  const t = useTranslations("margin");
  return (
    <Page>
      <PageHeader title={t("title")} />
      <EmptyState icon={LockIcon} title={t("notForRoleTitle")} description={t("notForRole")} testId="margin-not-allowed" />
    </Page>
  );
}
