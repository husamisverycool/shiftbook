"use client";

// Pattern: docs/patterns/margin.md — Stripe Billing analytics (export the summary or the rows;
// configure the definitions), Stripe home (date range), Mercury Insights (tabs; the time frame at
// the top right).
import { DownloadIcon, SettingsIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export type MarginTab = "overview" | "overtime" | "cash";
export interface Period {
  from: string;
  to: string;
  preset: 4 | 13 | 52 | "custom";
}

const TABS: { tab: MarginTab; href: string }[] = [
  { tab: "overview", href: "/margin" },
  { tab: "overtime", href: "/margin/overtime" },
  { tab: "cash", href: "/margin/cash" },
];
/** The address's period and grouping, carried between the tabs and into the exports. */
const KEPT = ["weeks", "from", "to", "group", "sort"];

export function MarginFrame({ tab, period, exports, children }: { tab: MarginTab; period: Period | null; exports: { label: string; kind: string }[]; children: ReactNode }) {
  const t = useTranslations("margin");
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
  const exportHref = (kind: string) => `/api/files/margin?${new URLSearchParams([...kept.entries(), ["kind", kind]]).toString()}`;

  return (
    <div className="mx-auto flex w-full max-w-7xl min-w-0 flex-col gap-4 px-4 py-6">
      <div className="flex flex-wrap items-end gap-3">
        <h1 className="mr-auto text-2xl font-semibold">{t("title")}</h1>
        {period && (
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="margin-period" className="text-xs text-muted-foreground">
                {t("period")}
              </Label>
              <NativeSelect
                id="margin-period"
                className="w-48"
                value={custom ? "custom" : String(period.preset)}
                onChange={(e) => {
                  if (e.target.value === "custom") setCustom(true);
                  else {
                    setCustom(false);
                    go({ weeks: e.target.value === "13" ? "" : e.target.value, from: "", to: "" });
                  }
                }}
                data-testid="margin-period"
              >
                {(["4", "13", "52"] as const).map((w) => (
                  <NativeSelectOption key={w} value={w}>
                    {t(`presets.${w}`)}
                  </NativeSelectOption>
                ))}
                <NativeSelectOption value="custom">{t("presets.custom")}</NativeSelectOption>
              </NativeSelect>
            </div>
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
        <Link href="/settings/margin" className={buttonVariants({ variant: "ghost", size: "sm" })} data-testid="margin-settings-link">
          <SettingsIcon />
          {t("settings")}
        </Link>
      </div>
      <nav aria-label={t("tabsLabel")} className="flex w-fit gap-1 rounded-lg bg-muted p-[3px]">
        {TABS.map((x) => (
          <Link
            key={x.tab}
            href={kept.size > 0 ? `${x.href}?${kept.toString()}` : x.href}
            aria-current={x.tab === tab ? "page" : undefined}
            className={cn("rounded-md px-3 py-1 text-sm font-medium text-foreground/60 transition-colors hover:text-foreground dark:text-muted-foreground", x.tab === tab && "bg-background text-foreground shadow-sm dark:text-foreground")}
            data-testid={`margin-tab-${x.tab}`}
          >
            {t(`tabs.${x.tab}`)}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}

/** Margin is for the Owner and the accountant (SPEC §2). */
export function NotForRole() {
  const t = useTranslations("margin");
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-2 px-4 py-6">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="text-sm text-muted-foreground" data-testid="margin-not-allowed">
        {t("notForRole")}
      </p>
    </div>
  );
}
