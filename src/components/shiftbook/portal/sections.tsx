"use client";

// The portal's sections (slice v). Patterns: docs/patterns/portal/[token].md (Stripe portal overview,
// Avionté Home counters), portal/[token]/invoices.md (TempWorks Invoices with its side panel, Avionté
// columns), payments.md (Avionté Payments, expanded to the invoices each settled), hours.md,
// documents.md.
import { ArrowDownIcon, ArrowUpIcon, ChevronRightIcon, DownloadIcon, FileTextIcon, FolderIcon, MoreHorizontalIcon, ReceiptIcon, CalendarCheckIcon, XIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { reviewHoursAction } from "@/app/[locale]/(portal)/portal/[token]/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import type { PortalDocument, PortalHoursRequest, PortalInvoice, PortalOverview, PortalPayment } from "@/server/portal/service";
import { Collapse, TURNING } from "../collapse";
import { EmptyState } from "../empty-state";
import { hoursMinutes, money, shortDate, tableDate } from "../format";
import { KeyFigure, KeyFigures } from "../key-figures";
import { Section } from "../page";
import { Status, type Tone } from "../status";

const TONES: Record<PortalInvoice["state"], Tone> = { open: "info", overdue: "critical", paid: "success" };
const fileHref = (token: string, path: string) => `/api/portal/${token}/${path}`;

function Title({ children }: { children: React.ReactNode }) {
  return <h1 className="text-[28px] leading-9 font-bold tracking-tight">{children}</h1>;
}

// ---------- Overview ----------

export function PortalOverviewView({ token, view, agencyName }: { token: string; view: PortalOverview; agencyName: string }) {
  const t = useTranslations("clientPortal");
  const locale = useLocale();
  const base = `/portal/${token}`;
  return (
    <>
      <Title>{t("overview.title")}</Title>
      <KeyFigures data-testid="portal-figures">
        <KeyFigure label={t("overview.owed")} value={money(view.owedCents, locale)} testId="portal-owed" />
        <KeyFigure label={t("overview.overdue")} value={<span className={cn(view.overdueCents > 0 && "text-destructive")}>{money(view.overdueCents, locale)}</span>} testId="portal-overdue" />
        <KeyFigure
          label={t("overview.nextDue")}
          size="sm"
          value={view.nextDue ? t("overview.nextDueValue", { amount: money(view.nextDue.balanceCents, locale), number: view.nextDue.number, date: shortDate(view.nextDue.dueOn, locale) }) : t("overview.nothingDue")}
          testId="portal-next-due"
        />
      </KeyFigures>
      <Section
        id="portal-open-invoices"
        title={t("overview.openInvoices")}
        accessory={view.openInvoices.length > 0 ? view.openInvoices.length : undefined}
        actions={
          <Link href={`${base}/invoices`} className="rounded-sm text-sm font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/50">
            {t("overview.viewAll")}
          </Link>
        }
      >
        {view.openInvoices.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("overview.noOpen")}</p>
        ) : (
          <ul className="flex flex-col divide-y" data-testid="portal-open-list">
            {view.openInvoices.map((i) => (
              <li key={i.id}>
                <Link href={{ pathname: `${base}/invoices`, query: { open: i.id } }} className="group flex items-center gap-4 rounded-sm py-3 text-sm outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring/50">
                  <FileTextIcon className="size-4 text-muted-foreground" aria-hidden />
                  <span className="font-medium group-hover:underline">{i.number}</span>
                  <span className="text-muted-foreground">{t("invoices.due")} {shortDate(i.dueOn, locale)}</span>
                  <Status tone={TONES[i.state]} className="ml-auto">
                    {t(`invoices.states.${i.state}`)}
                  </Status>
                  <span className="w-28 text-right font-semibold tabular-nums">{money(i.balanceCents, locale)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <ul className="flex flex-col divide-y border-y text-sm">
        {[
          { icon: CalendarCheckIcon, text: t("overview.hoursWaiting", { count: view.waitingHours }), href: `${base}/hours`, testId: "portal-hours-count" },
          { icon: ReceiptIcon, text: t("overview.requestsPending", { count: view.pendingRequests, agency: agencyName }), href: `${base}/request`, testId: "portal-requests-count" },
        ].map((row) => (
          <li key={row.href} className="flex items-center gap-3 py-3" data-testid={row.testId}>
            <row.icon className="size-4 text-muted-foreground" aria-hidden />
            <span>{row.text}</span>
            <Link href={row.href} className="ml-auto rounded-sm font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/50">
              {t("overview.view")}
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

// ---------- Invoices ----------

type Filter = "unpaid" | "paid" | "all";
const inFilter = (i: PortalInvoice, f: Filter) => (f === "all" ? true : f === "paid" ? i.state === "paid" : i.state !== "paid");

export function PortalInvoicesView({ token, invoices, filter, openId, agencyName }: { token: string; invoices: PortalInvoice[]; filter: Filter; openId: string | null; agencyName: string }) {
  const t = useTranslations("clientPortal");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const shown = useMemo(() => invoices.filter((i) => inFilter(i, filter)), [invoices, filter]);
  const [open, setOpen] = useState<string | null>(openId && invoices.some((i) => i.id === openId) ? openId : null);
  const at = shown.findIndex((i) => i.id === open);
  const current = open ? (invoices.find((i) => i.id === open) ?? null) : null;
  const move = useCallback(
    (d: number) => {
      if (at < 0) return;
      const next = shown[at + d];
      if (next) setOpen(next.id);
    },
    [at, shown],
  );
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest("input, textarea, select, [role=menu]")) return;
      if (e.key === "Escape") setOpen(null);
      else if (e.key === "ArrowDown") {
        e.preventDefault();
        move(1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        move(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, move]);
  const counts = { unpaid: invoices.filter((i) => inFilter(i, "unpaid")).length, paid: invoices.filter((i) => inFilter(i, "paid")).length, all: invoices.length };
  const empty = { unpaid: t("invoices.emptyUnpaid"), paid: t("invoices.emptyPaid"), all: t("invoices.emptyAll") }[filter];
  return (
    <>
      <Title>{t("invoices.title")}</Title>
      <div role="group" aria-label={t("invoices.filterLabel")} className="flex w-fit rounded-lg bg-muted p-[3px] text-sm" data-testid="portal-invoice-filters">
        {(["unpaid", "paid", "all"] as const).map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={f === filter}
            data-testid={`portal-filter-${f}`}
            onClick={() => {
              setOpen(null);
              router.replace({ pathname, query: f === "unpaid" ? {} : { show: f } }, { scroll: false });
            }}
            className={cn("flex items-center gap-1.5 rounded-md px-3 py-1 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50", f === filter ? "bg-background font-medium shadow-sm" : "text-foreground/60 hover:text-foreground")}
          >
            {t(`invoices.${f}`)}
            <span className="text-muted-foreground tabular-nums">{counts[f]}</span>
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <EmptyState icon={FileTextIcon} title={empty} description={t("invoices.emptyBody", { agency: agencyName })} className="min-h-[30svh]" testId="portal-invoices-empty" />
      ) : (
        <div className="flex min-w-0 gap-6">
          <div className="min-w-0 flex-1 overflow-x-auto">
            <Table data-testid="portal-invoices">
              <TableHeader>
                <TableRow>
                  <TableHead>{t("invoices.number")}</TableHead>
                  <TableHead>{t("invoices.issued")}</TableHead>
                  <TableHead>{t("invoices.due")}</TableHead>
                  <TableHead className="hidden lg:table-cell">{t("invoices.po")}</TableHead>
                  <TableHead className="text-right">{t("invoices.amount")}</TableHead>
                  <TableHead className="text-right">{t("invoices.balance")}</TableHead>
                  <TableHead>{t("invoices.status")}</TableHead>
                  <TableHead className="w-10">
                    <span className="sr-only">{t("invoices.download")}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((i) => (
                  <TableRow
                    key={i.id}
                    tabIndex={0}
                    aria-label={t("invoices.open", { number: i.number })}
                    data-state={i.id === open ? "selected" : undefined}
                    data-testid={`portal-invoice-${i.number}`}
                    className="cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset"
                    onClick={() => setOpen(i.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && e.target === e.currentTarget) setOpen(i.id);
                    }}
                  >
                    <TableCell className="font-medium">{i.number}</TableCell>
                    <TableCell>{tableDate(i.issuedOn, locale)}</TableCell>
                    <TableCell>{tableDate(i.dueOn, locale)}</TableCell>
                    <TableCell className="hidden lg:table-cell">{i.poNumber ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{money(i.totalCents, locale)}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{money(i.balanceCents, locale)}</TableCell>
                    <TableCell>
                      <Status tone={TONES[i.state]}>{t(`invoices.states.${i.state}`)}</Status>
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={t("invoices.actions", { number: i.number })} />}>
                          <MoreHorizontalIcon />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52">
                          <DropdownMenuItem render={<a href={fileHref(token, `invoice/${i.id}`)} download />}>
                            <DownloadIcon /> {t("invoices.download")}
                          </DropdownMenuItem>
                          {i.hasCsv && (
                            <DropdownMenuItem render={<a href={fileHref(token, `invoice/${i.id}?file=csv`)} download />}>
                              <DownloadIcon /> {t("invoices.downloadCsv")}
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {current && (
            <aside aria-label={current.number} data-testid="portal-invoice-panel" className="sticky top-6 hidden w-80 shrink-0 self-start rounded-lg border bg-background motion-enter starting:opacity-0 motion-safe:starting:translate-x-4 transition-[opacity,translate] lg:block">
              <div className="flex items-center gap-1 border-b px-3 py-2 text-sm">
                <span className="mr-auto text-muted-foreground tabular-nums">{at >= 0 ? t("invoices.position", { n: at + 1, total: shown.length }) : ""}</span>
                <Button variant="ghost" size="icon-sm" aria-label={t("invoices.previous")} disabled={at <= 0} onClick={() => move(-1)}>
                  <ArrowUpIcon />
                </Button>
                <Button variant="ghost" size="icon-sm" aria-label={t("invoices.next")} disabled={at < 0 || at >= shown.length - 1} onClick={() => move(1)}>
                  <ArrowDownIcon />
                </Button>
                <Button variant="ghost" size="icon-sm" aria-label={t("invoices.close")} onClick={() => setOpen(null)}>
                  <XIcon />
                </Button>
              </div>
              <div className="flex flex-col gap-4 p-4 text-sm">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold">{current.number}</h2>
                  <Status tone={TONES[current.state]}>{t(`invoices.states.${current.state}`)}</Status>
                </div>
                <dl className="grid grid-cols-2 gap-4">
                  {[
                    [t("invoices.issued"), shortDate(current.issuedOn, locale)],
                    [t("invoices.due"), shortDate(current.dueOn, locale)],
                    [t("invoices.po"), current.poNumber ?? "—"],
                    [t("invoices.amount"), money(current.totalCents, locale)],
                    [t("invoices.balance"), money(current.balanceCents, locale)],
                  ].map(([label, value]) => (
                    <div key={label} className="grid gap-0.5">
                      <dt className="text-[13px] text-muted-foreground">{label}</dt>
                      <dd className="tabular-nums">{value}</dd>
                    </div>
                  ))}
                </dl>
                <a href={fileHref(token, `invoice/${current.id}`)} download className={cn(buttonVariants({ variant: "outline" }), "w-fit")} data-testid="portal-invoice-download">
                  <DownloadIcon /> {t("invoices.download")}
                </a>
                <p className="text-[13px] text-muted-foreground">{t("invoices.backupNote")}</p>
                {current.state !== "paid" && <p className="text-[13px] text-muted-foreground">{t("invoices.howToPay", { agency: agencyName })}</p>}
              </div>
            </aside>
          )}
        </div>
      )}
    </>
  );
}

// ---------- Payments ----------

export function PortalPaymentsView({ token, payments, agencyName }: { token: string; payments: PortalPayment[]; agencyName: string }) {
  const t = useTranslations("clientPortal");
  const tm = useTranslations("payments.methods");
  const locale = useLocale();
  const [openRows, setOpenRows] = useState<Set<string>>(new Set());
  return (
    <>
      <Title>{t("payments.title")}</Title>
      {payments.length === 0 ? (
        <EmptyState icon={ReceiptIcon} title={t("payments.empty")} description={t("payments.emptyBody", { agency: agencyName })} className="min-h-[30svh]" testId="portal-payments-empty" />
      ) : (
        <div className="min-w-0 overflow-x-auto">
          <Table data-testid="portal-payments">
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <span className="sr-only">{t("payments.show")}</span>
                </TableHead>
                <TableHead>{t("payments.date")}</TableHead>
                <TableHead>{t("payments.method")}</TableHead>
                <TableHead>{t("payments.reference")}</TableHead>
                <TableHead className="text-right">{t("payments.amount")}</TableHead>
                <TableHead className="text-right">{t("payments.applied")}</TableHead>
                <TableHead>
                  <span className="sr-only">{t("payments.remittance")}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.map((p) => {
                const isOpen = openRows.has(p.id);
                const toggle = () =>
                  setOpenRows((cur) => {
                    const next = new Set(cur);
                    if (next.has(p.id)) next.delete(p.id);
                    else next.add(p.id);
                    return next;
                  });
                return [
                  <TableRow key={p.id} data-testid="portal-payment">
                    <TableCell>
                      <Button variant="ghost" size="icon-sm" aria-expanded={isOpen} aria-controls={`pay-${p.id}`} aria-label={isOpen ? t("payments.hide") : t("payments.show")} onClick={toggle}>
                        <ChevronRightIcon className={cn(TURNING, isOpen && "rotate-90")} />
                      </Button>
                    </TableCell>
                    <TableCell>{tableDate(p.receivedOn, locale)}</TableCell>
                    <TableCell>{tm.has(p.method) ? tm(p.method) : p.method}</TableCell>
                    <TableCell>{p.reference ?? "—"}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{money(p.amountCents, locale)}</TableCell>
                    <TableCell className="text-right tabular-nums">{money(p.appliedCents, locale)}</TableCell>
                    <TableCell className="text-right">
                      <a href={`${fileHref(token, `remittance/${p.id}`)}?locale=${locale}`} download className="inline-flex items-center gap-1 rounded-sm text-sm font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/50" data-testid="portal-remittance">
                        <DownloadIcon className="size-3.5" aria-hidden />
                        {t("payments.remittance")}
                      </a>
                    </TableCell>
                  </TableRow>,
                  <TableRow key={`${p.id}-lines`} className="hover:bg-transparent">
                    <TableCell colSpan={7} className="p-0">
                      <Collapse open={isOpen} id={`pay-${p.id}`}>
                        <div className="bg-muted/30 px-12 py-3 text-sm" data-testid="portal-payment-lines">
                          {p.lines.length > 0 && (
                            <table className="w-full">
                              <thead className="text-[13px] text-muted-foreground">
                                <tr>
                                  <th className="py-1 text-left font-medium">{t("payments.invoice")}</th>
                                  <th className="py-1 text-left font-medium">{t("payments.invoiceDate")}</th>
                                  <th className="py-1 text-right font-medium">{t("payments.invoiceTotal")}</th>
                                  <th className="py-1 text-right font-medium">{t("payments.applied")}</th>
                                </tr>
                              </thead>
                              <tbody>
                                {p.lines.map((l) => (
                                  <tr key={l.invoiceId}>
                                    <td className="py-1">{l.number}</td>
                                    <td className="py-1">{tableDate(l.issuedOn, locale)}</td>
                                    <td className="py-1 text-right tabular-nums">{money(l.totalCents, locale)}</td>
                                    <td className="py-1 text-right tabular-nums">{money(l.appliedCents, locale)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                          {p.amountCents > p.appliedCents && <p className="mt-1 text-muted-foreground">{t("payments.notApplied", { amount: money(p.amountCents - p.appliedCents, locale) })}</p>}
                        </div>
                      </Collapse>
                    </TableCell>
                  </TableRow>,
                ];
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}

// ---------- Hours to approve ----------

export function PortalHoursView({ token, requests, agencyName }: { token: string; requests: PortalHoursRequest[]; agencyName: string }) {
  const t = useTranslations("clientPortal");
  const locale = useLocale();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <Title>{t("hours.title")}</Title>
      {requests.length === 0 ? (
        <EmptyState icon={CalendarCheckIcon} title={t("hours.empty")} description={t("hours.emptyBody", { agency: agencyName })} className="min-h-[30svh]" testId="portal-hours-empty" />
      ) : (
        <ul className="flex flex-col divide-y border-y" data-testid="portal-hours">
          {requests.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-x-6 gap-y-2 py-4 text-sm" data-testid="portal-hours-row">
              <div className="flex min-w-0 flex-col">
                <span className="font-medium">{t("hours.period", { start: shortDate(r.startsOn, locale), end: shortDate(r.endsOn, locale) })}</span>
                <span className="text-muted-foreground">{t("hours.waiting", { count: r.waitingShifts, hours: hoursMinutes(r.waitingMinutes) })}</span>
              </div>
              <div className="ml-auto">
                {r.mine && r.waitingShifts > 0 ? (
                  <Button
                    loading={pending && busy === r.id}
                    loadingLabel={t("hours.review")}
                    data-testid="portal-review-hours"
                    onClick={() => {
                      setBusy(r.id);
                      setError(null);
                      start(async () => {
                        const res = await reviewHoursAction(token, r.id);
                        if (res.ok) window.location.assign(res.href);
                        else setError(t.has(`errors.${res.error}`) ? t(`errors.${res.error}`) : t("errors.generic"));
                      });
                    }}
                  >
                    {t("hours.review")}
                  </Button>
                ) : !r.mine ? (
                  <span className="text-muted-foreground">{t("hours.notYours", { name: r.approverName })}</span>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </>
  );
}

// ---------- Documents ----------

export function PortalDocumentsView({ token, documents, agencyName }: { token: string; documents: PortalDocument[]; agencyName: string }) {
  const t = useTranslations("clientPortal");
  const locale = useLocale();
  return (
    <>
      <Title>{t("documents.title")}</Title>
      {documents.length === 0 ? (
        <EmptyState icon={FolderIcon} title={t("documents.empty")} description={t("documents.emptyBody", { agency: agencyName })} className="min-h-[30svh]" testId="portal-documents-empty" />
      ) : (
        <ul className="flex flex-col divide-y border-y" data-testid="portal-documents">
          {documents.map((d) => (
            <li key={d.id} className="flex items-center gap-4 py-3 text-sm">
              <FileTextIcon className="size-4 text-muted-foreground" aria-hidden />
              <div className="flex min-w-0 flex-col">
                <span className="font-medium">{d.kind === "registration" ? t("documents.registration", { state: d.jurisdiction ?? "", number: d.number ?? "" }) : t("documents.proof")}</span>
                <span className="text-muted-foreground">{t("documents.dated", { date: shortDate(d.effectiveOn, locale) })}</span>
              </div>
              <a href={fileHref(token, `document/${d.id}`)} download className={cn(buttonVariants({ variant: "outline", size: "sm" }), "ml-auto")}>
                <DownloadIcon /> {t("documents.download")}
              </a>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
