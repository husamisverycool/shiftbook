"use client";

// Pattern: docs/patterns/margin.md — Stripe Billing analytics (metric cards opening how they are
// worked out; a table that opens its rows' lines), Brex (split by a dimension; weekly graph),
// TempWorks Gross Profit Summary (group by; sort by gross profit or gross profit %).
import { ChevronDownIcon, ChevronRightIcon, TrendingUpIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Fragment, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { formatPermille, GROUP_BYS, totalsOf, type GroupBy, type MarginLine, type MarginTotals, type SortBy } from "@/server/margin/margin";
import type { MarginView } from "@/server/margin/queries";
import { useEngineSay } from "../engine-say";
import { hoursMinutes, longDate, money } from "../format";
import { WeeklyChart } from "./weekly-chart";

type Metric = "billed" | "pay" | "burden" | "margin" | "percent";

export function MarginOverview({ view, groupBy, sort, floatingCents }: { view: MarginView; groupBy: GroupBy; sort: SortBy; floatingCents: number }) {
  const t = useTranslations("margin");
  const locale = useLocale();
  // The run's explanations in the reader's language (decision 0030); the English is the record.
  const say = useEngineSay();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [open, setOpen] = useState<string | null>(null);
  const [line, setLine] = useState<string | null>(null);
  const [metric, setMetric] = useState<Metric | null>(null);
  const kept = new URLSearchParams([...params.entries()].filter(([k]) => ["weeks", "from", "to", "group", "sort"].includes(k)));
  const keep = kept.size > 0 ? `?${kept.toString()}` : "";
  const go = (next: Record<string, string>) => {
    const q = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v) q.set(k, v);
      else q.delete(k);
    }
    const s = q.toString();
    router.replace(s ? `${pathname}?${s}` : pathname);
  };
  const T = view.totals;
  const pct = (p: number | null) => (p === null ? "—" : formatPermille(p));
  const name = (n: string | null) => (n === null ? t("none") : groupBy === "week" ? t("weekOf", { date: longDate(n, locale) }) : n);
  const cards: { key: string; label: string; value: string; metric?: Metric; href?: string }[] = [
    { key: "billed", label: t("cards.billed"), value: money(T.billedCents, locale), metric: "billed" },
    { key: "pay", label: t("cards.pay"), value: money(T.payCents, locale), metric: "pay" },
    { key: "burden", label: t("cards.burden"), value: money(T.burdenCents, locale), metric: "burden" },
    { key: "margin", label: t("cards.margin"), value: money(T.marginCents, locale), metric: "margin" },
    { key: "percent", label: t("cards.percent"), value: pct(T.marginPermille), metric: "percent" },
    { key: "overtime", label: t("cards.overtime"), value: money(view.overtimePremiumNotBilledCents, locale), href: `/margin/overtime${keep}` },
    { key: "cash", label: t("cards.cash"), value: money(floatingCents, locale), href: `/margin/cash${keep}` },
  ];

  if (view.lines.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-16 text-sm text-muted-foreground" data-testid="margin-empty">
        <TrendingUpIcon className="size-5" />
        <p>{t("empty", { from: longDate(view.from, locale), to: longDate(view.to, locale) })}</p>
        <Link href="/convert" className={buttonVariants({ variant: "link", size: "sm" })}>
          {t("emptyLink")}
        </Link>
      </div>
    );
  }

  const totalsCells = (x: MarginTotals) => (
    <>
      <TableCell className="text-right tabular-nums">{hoursMinutes(x.minutesPaid)}</TableCell>
      <TableCell className="text-right tabular-nums">{money(x.billedCents, locale)}</TableCell>
      <TableCell className="text-right tabular-nums">{money(x.payCents, locale)}</TableCell>
      <TableCell className="text-right tabular-nums">{money(x.burdenCents, locale)}</TableCell>
      <TableCell className={`text-right font-medium tabular-nums ${x.marginCents < 0 ? "text-destructive" : ""}`}>{money(x.marginCents, locale)}</TableCell>
      <TableCell className="text-right tabular-nums">{pct(x.marginPermille)}</TableCell>
    </>
  );
  const lineRow = (l: MarginLine) => (
    <Fragment key={l.key}>
      <TableRow className="bg-muted/30 hover:bg-muted/40">
        <TableCell>
          <button type="button" className="flex items-center gap-1 text-left underline-offset-4 hover:underline" aria-expanded={line === l.key} onClick={() => setLine(line === l.key ? null : l.key)} data-testid="margin-line">
            {line === l.key ? <ChevronDownIcon className="size-4" /> : <ChevronRightIcon className="size-4" />}
            <span>
              {l.workerName} · {l.clientName ?? t("none")} · {t("weekOf", { date: longDate(l.week, locale) })}
            </span>
          </button>
          {l.incomplete > 0 && <span className="ml-5 text-xs text-destructive">{t("lineIncomplete")}</span>}
        </TableCell>
        {totalsCells(totalsOf([l]))}
      </TableRow>
      {line === l.key && (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={7} className="whitespace-normal">
            <ul className="flex flex-col gap-2 py-1 text-xs" data-testid="margin-line-explain">
              {l.details.map((d, i) => (
                <li key={i} className="flex flex-col gap-0.5">
                  <span>
                    <span className="font-medium">{d.kind === "pay" ? t("payLine", { type: d.type }) : t("billLine", { type: d.type })}</span> {say(d)}
                  </span>
                  {d.burdenExplain && <span className="text-muted-foreground">{t("burdenOf", { explain: say({ explain: d.burdenExplain, said: d.burdenSaid }) })}</span>}
                </li>
              ))}
            </ul>
          </TableCell>
        </TableRow>
      )}
    </Fragment>
  );

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7" data-testid="margin-cards">
        {cards.map((c) =>
          c.href ? (
            <Link key={c.key} href={c.href} className="flex flex-col gap-1 rounded-lg border p-3 text-left hover:bg-muted/50" data-testid={`card-${c.key}`}>
              <span className="text-xs text-muted-foreground">{c.label}</span>
              <span className="text-lg font-semibold tabular-nums">{c.value}</span>
            </Link>
          ) : (
            <button key={c.key} type="button" onClick={() => setMetric(c.metric!)} className="flex flex-col gap-1 rounded-lg border p-3 text-left hover:bg-muted/50" data-testid={`card-${c.key}`}>
              <span className="text-xs text-muted-foreground">{c.label}</span>
              <span className="text-lg font-semibold tabular-nums">{c.value}</span>
            </button>
          ),
        )}
      </div>
      {T.incomplete > 0 && (
        <Alert data-testid="burden-incomplete">
          <AlertDescription>
            <span>
              {t("incomplete", { count: T.incomplete })}{" "}
              <Link href="/settings/margin" className="underline underline-offset-4">
                {t("settings")}
              </Link>
            </span>
          </AlertDescription>
        </Alert>
      )}
      <WeeklyChart weeks={view.weeks.map((w) => ({ week: w.week, billedCents: w.totals.billedCents, marginCents: w.totals.marginCents }))} />
      <div className="flex flex-wrap items-end gap-3">
        <Tabs value={groupBy} onValueChange={(v) => go({ group: v === "client" ? "" : String(v) })}>
          <TabsList aria-label={t("groupBy")}>
            {GROUP_BYS.map((g) => (
              <TabsTrigger key={g} value={g} data-testid={`group-${g}`}>
                {t(`groups.${g}`)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="ml-auto flex items-center gap-2">
          <Label htmlFor="margin-sort" className="text-sm text-muted-foreground">
            {t("sortBy")}
          </Label>
          <NativeSelect id="margin-sort" className="w-44" value={sort} onChange={(e) => go({ sort: e.target.value === "margin" ? "" : e.target.value })} data-testid="margin-sort">
            <NativeSelectOption value="margin">{t("sorts.margin")}</NativeSelectOption>
            <NativeSelectOption value="percent">{t("sorts.percent")}</NativeSelectOption>
          </NativeSelect>
        </div>
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <Table aria-label={t("tableLabel", { group: t(`groups.${groupBy}`) })} data-testid="margin-table">
          <TableHeader>
            <TableRow>
              <TableHead>{t(`groups.${groupBy}`)}</TableHead>
              {(["hours", "billed", "pay", "burden", "margin", "percent"] as const).map((c) => (
                <TableHead key={c} className="text-right" title={t(`formulas.${c}`)}>
                  <abbr title={t(`formulas.${c}`)} className="no-underline">
                    {t(`cols.${c}`)}
                  </abbr>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {view.groups.map((g) => (
              <Fragment key={g.key}>
                <TableRow data-testid="margin-row">
                  <TableCell className="font-medium">
                    <button type="button" className="flex items-center gap-1 text-left underline-offset-4 hover:underline" aria-expanded={open === g.key} onClick={() => setOpen(open === g.key ? null : g.key)}>
                      {open === g.key ? <ChevronDownIcon className="size-4" /> : <ChevronRightIcon className="size-4" />}
                      {name(g.name)}
                    </button>
                  </TableCell>
                  {totalsCells(g.totals)}
                </TableRow>
                {open === g.key && g.lines.map(lineRow)}
              </Fragment>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell className="font-semibold">{t("total")}</TableCell>
              {totalsCells(T)}
            </TableRow>
          </TableFooter>
        </Table>
      </div>
      {metric && (
        <Dialog open onOpenChange={(o) => !o && setMetric(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t(`cards.${metric}`)}</DialogTitle>
              <DialogDescription>{t(`formulas.${metric}`)}</DialogDescription>
            </DialogHeader>
            <p className="text-sm" data-testid="metric-working">
              {t(`working.${metric}`, {
                billed: money(T.billedCents, locale),
                pay: money(T.payCents, locale),
                burden: money(T.burdenCents, locale),
                margin: money(T.marginCents, locale),
                percent: pct(T.marginPermille),
                lines: view.lines.length,
                from: longDate(view.from, locale),
                to: longDate(view.to, locale),
              })}
            </p>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
