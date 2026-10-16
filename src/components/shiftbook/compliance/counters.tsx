"use client";

// Pattern: docs/patterns/compliance/counters.md — TempWorks ACA Employee Cycles (one row per employee
// and window: hours and the window's dates; filters by customer; Show); 820 ILCS 175/42's thresholds.
import { ChevronDownIcon, ChevronRightIcon, PlusIcon, SearchIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Fragment, useState } from "react";
import { toast } from "sonner";
import { addBalanceAction, removeBalanceAction } from "@/app/[locale]/(app)/compliance/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { parseHoursToMinutes } from "@/lib/amounts";
import type { CounterLine, CountersView } from "@/server/compliance/counter-balances";
import { hoursMinutes, longDate } from "../format";
import { useAct } from "./detail";

type Choice = { workerId: string; workerName: string; clientId: string; clientName: string };

export function Counters({ view, choices, canChange, today }: { view: CountersView; choices: Choice[]; canChange: boolean; today: string }) {
  const t = useTranslations("compliance.counters");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState<Choice | "pick" | null>(null);
  const go = (next: Record<string, string>) => {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    const s = p.toString();
    router.replace(s ? `${pathname}?${s}` : pathname);
  };
  const filtered = params.has("client") || params.has("show") || params.has("q");
  const rule = view.rule;
  if (!rule) return <p className="rounded-lg border py-14 text-center text-sm text-muted-foreground">{t("noRule")}</p>;
  const h = (m: number) => hoursMinutes(m);
  /** A threshold in whole hours ("720", "4,160"), else h:mm. */
  const limit = (m: number) => (m % 60 === 0 ? new Intl.NumberFormat(locale).format(Math.trunc(m / 60)) : hoursMinutes(m));
  const keyOf = (l: CounterLine) => `${l.workerId}|${l.clientId}`;
  const status = (l: CounterLine) => {
    if (l.crossed720 !== null) {
      const text = t("crossed", { date: longDate(l.crossed720, locale) });
      return l.dutyId ? (
        <Link href={`/compliance/${l.dutyId}`} className="text-destructive underline underline-offset-4">
          {text}
        </Link>
      ) : (
        <span className="text-destructive">{text}</span>
      );
    }
    const toGo = h(Math.max(0, l.triggerMinutes - l.minutes12));
    return l.near ? <span className="font-medium">{t("near", { hours: toGo })}</span> : <span className="text-muted-foreground">{t("toGo", { hours: toGo })}</span>;
  };
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{t("intro", { trigger: limit(rule.triggerMinutes), months: rule.windowMonths, longTrigger: limit(rule.longTriggerMinutes), longMonths: rule.longWindowMonths, warn: limit(rule.warnMinutes) })}</p>
      <div className="flex flex-wrap items-end gap-2">
        <form
          role="search"
          className="flex flex-col gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            go({ q: q.trim() });
          }}
        >
          <Label htmlFor="counters-search" className="text-xs text-muted-foreground">
            {t("search")}
          </Label>
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="counters-search" className="w-56 pl-8" value={q} placeholder={t("searchPlaceholder")} onChange={(e) => setQ(e.target.value)} onBlur={() => q.trim() !== (params.get("q") ?? "") && go({ q: q.trim() })} data-testid="counters-search" />
          </div>
        </form>
        <div className="flex flex-col gap-1">
          <Label htmlFor="counters-client" className="text-xs text-muted-foreground">
            {t("client")}
          </Label>
          <NativeSelect id="counters-client" className="w-56" value={params.get("client") ?? ""} onChange={(e) => go({ client: e.target.value })} data-testid="counters-client">
            <NativeSelectOption value="">{t("anyClient")}</NativeSelectOption>
            {view.clients.map((c) => (
              <NativeSelectOption key={c.id} value={c.id}>
                {c.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="counters-show" className="text-xs text-muted-foreground">
            {t("show")}
          </Label>
          <NativeSelect id="counters-show" className="w-44" value={params.get("show") ?? "all"} onChange={(e) => go({ show: e.target.value === "all" ? "" : e.target.value })} data-testid="counters-show">
            {(["all", "near", "crossed"] as const).map((o) => (
              <NativeSelectOption key={o} value={o}>
                {t(`shows.${o}`)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <span className="mr-auto" />
        {canChange && choices.length > 0 && (
          <Button size="sm" variant="outline" onClick={() => setAdding("pick")} data-testid="add-balance">
            <PlusIcon />
            {t("add")}
          </Button>
        )}
      </div>
      {view.total === 0 ? (
        <p className="rounded-lg border py-14 text-center text-sm text-muted-foreground" data-testid="counters-nothing">
          {t("nothing")}
        </p>
      ) : view.rows.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border py-14 text-sm text-muted-foreground" data-testid="counters-no-match">
          {t("noMatch")}
          {filtered && (
            <button type="button" className={buttonVariants({ variant: "outline", size: "sm" })} onClick={() => go({ client: "", show: "", q: "" })}>
              {t("clear")}
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table aria-label={t("tableLabel")} data-testid="counters-table">
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">
                  <span className="sr-only">{t("balances")}</span>
                </TableHead>
                <TableHead>{t("cols.worker")}</TableHead>
                <TableHead>{t("cols.client")}</TableHead>
                <TableHead className="text-right">{t("cols.twelve", { months: rule.windowMonths })}</TableHead>
                <TableHead className="text-right">{t("cols.fortyEight", { months: rule.longWindowMonths })}</TableHead>
                <TableHead className="text-right">{t("cols.before")}</TableHead>
                <TableHead>{t("cols.state")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {view.rows.map((l) => {
                const k = keyOf(l);
                const isOpen = open === k;
                return (
                  <Fragment key={k}>
                    <TableRow data-testid="counter-row">
                      <TableCell>
                        <Button variant="ghost" size="icon-sm" aria-expanded={isOpen} aria-controls={`balances-${k}`} aria-label={t("toggle", { worker: l.workerName, client: l.clientName })} onClick={() => setOpen(isOpen ? null : k)} data-testid="counter-toggle">
                          {isOpen ? <ChevronDownIcon /> : <ChevronRightIcon />}
                        </Button>
                      </TableCell>
                      <TableCell className="font-medium">{l.workerName}</TableCell>
                      <TableCell>{l.clientName}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {t("of", { hours: h(l.minutes12), limit: limit(l.triggerMinutes) })}
                        <span className="block text-xs text-muted-foreground">{t("since", { date: longDate(l.windowStart12, locale) })}</span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {t("of", { hours: h(l.minutes48), limit: limit(l.longTriggerMinutes) })}
                        <span className="block text-xs text-muted-foreground">{t("since", { date: longDate(l.windowStart48, locale) })}</span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{l.balanceMinutes > 0 ? h(l.balanceMinutes) : "—"}</TableCell>
                      <TableCell className="whitespace-normal">
                        {status(l)}
                        {l.crossed4160 !== null && <span className="block text-xs text-destructive">{t("crossedLong", { limit: limit(l.longTriggerMinutes), date: longDate(l.crossed4160, locale) })}</span>}
                      </TableCell>
                    </TableRow>
                    {isOpen && (
                      <TableRow id={`balances-${k}`} className="bg-muted/30 hover:bg-muted/30" data-testid="counter-balances">
                        <TableCell />
                        <TableCell colSpan={6} className="whitespace-normal">
                          <Balances line={l} canChange={canChange} onAdd={() => setAdding({ workerId: l.workerId, workerName: l.workerName, clientId: l.clientId, clientName: l.clientName })} />
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
      {adding !== null && <AddBalance pair={adding === "pick" ? null : adding} choices={choices} today={today} onClose={() => setAdding(null)} />}
    </div>
  );
}

function Balances({ line, canChange, onAdd }: { line: CounterLine; canChange: boolean; onAdd: () => void }) {
  const t = useTranslations("compliance.counters");
  const locale = useLocale();
  const [removing, setRemoving] = useState<string | null>(null);
  const date = (d: Date) => longDate(new Date(d).toISOString().slice(0, 10), locale);
  return (
    <div className="flex flex-col gap-2 py-1">
      <div className="flex items-center gap-3">
        <h3 className="text-sm font-semibold">{t("balancesTitle")}</h3>
        {canChange && (
          <Button size="sm" variant="outline" onClick={onAdd} data-testid="add-row-balance">
            <PlusIcon />
            {t("add")}
          </Button>
        )}
      </div>
      {line.balances.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noBalances")}</p>
      ) : (
        <ul className="flex flex-col gap-1 text-sm">
          {line.balances.map((b) => (
            <li key={b.id} className="flex flex-wrap items-center gap-x-3 gap-y-1" data-testid="balance">
              <span className={b.removedAt ? "text-muted-foreground line-through" : "font-medium tabular-nums"}>{t("balance", { hours: hoursMinutes(b.minutes), date: longDate(b.throughOn, locale) })}</span>
              <span className="text-muted-foreground">{b.note}</span>
              <span className="text-xs text-muted-foreground">{b.removedAt ? t("removed", { by: b.removedBy ?? "", date: date(b.removedAt), reason: b.removedReason ?? "" }) : t("addedBy", { by: b.by, date: date(b.at) })}</span>
              {canChange && !b.removedAt && (
                <Button variant="ghost" size="sm" onClick={() => setRemoving(b.id)} data-testid="remove-balance">
                  {t("remove")}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {removing && <RemoveBalance id={removing} onClose={() => setRemoving(null)} />}
    </div>
  );
}

function AddBalance({ pair, choices, today, onClose }: { pair: Choice | null; choices: Choice[]; today: string; onClose: () => void }) {
  const t = useTranslations("compliance.counters");
  const td = useTranslations("compliance.detail");
  const [chosen, setChosen] = useState(pair ? `${pair.workerId}|${pair.clientId}` : "");
  const [hours, setHours] = useState("");
  const [throughOn, setThroughOn] = useState("");
  const [note, setNote] = useState("");
  const { pending, act } = useAct();
  const minutes = parseHoursToMinutes(hours);
  const [workerId, clientId] = chosen.split("|");
  const ready = Boolean(workerId && clientId) && minutes !== null && minutes > 0 && throughOn !== "" && throughOn <= today && note.trim() !== "";
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("addTitle")}</DialogTitle>
          <DialogDescription>{t("addBody")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="balance-pair">{t("fields.pair")}</Label>
            {pair ? (
              <p id="balance-pair" className="text-sm">
                {pair.workerName} · {pair.clientName}
              </p>
            ) : (
              <NativeSelect id="balance-pair" className="w-full" value={chosen} onChange={(e) => setChosen(e.target.value)} data-testid="balance-pair">
                <NativeSelectOption value="">{t("fields.choose")}</NativeSelectOption>
                {choices.map((c) => (
                  <NativeSelectOption key={`${c.workerId}|${c.clientId}`} value={`${c.workerId}|${c.clientId}`}>
                    {c.workerName} · {c.clientName}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="balance-hours">{t("fields.hours")}</Label>
            <Input id="balance-hours" inputMode="numeric" value={hours} aria-invalid={hours !== "" && minutes === null ? true : undefined} onChange={(e) => setHours(e.target.value)} data-testid="balance-hours" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="balance-through">{t("fields.throughOn")}</Label>
            <Input id="balance-through" type="date" max={today} value={throughOn} onChange={(e) => setThroughOn(e.target.value)} data-testid="balance-through" />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="balance-note">{t("fields.note")}</Label>
            <Textarea id="balance-note" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} data-testid="balance-note" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {td("cancel")}
          </Button>
          <Button disabled={pending || !ready} onClick={() => act(() => addBalanceAction({ workerId, clientId, minutes, throughOn, note }), () => (toast.success(t("saved")), onClose()))} data-testid="save-balance">
            {td("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RemoveBalance({ id, onClose }: { id: string; onClose: () => void }) {
  const t = useTranslations("compliance.counters");
  const td = useTranslations("compliance.detail");
  const [reason, setReason] = useState("");
  const { pending, act } = useAct();
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("removeTitle")}</DialogTitle>
          <DialogDescription>{t("removeBody")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="balance-reason">{td("reason")}</Label>
          <Textarea id="balance-reason" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} data-testid="balance-reason" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {td("cancel")}
          </Button>
          <Button variant="destructive" disabled={pending || reason.trim() === ""} onClick={() => act(() => removeBalanceAction(id, reason.trim()), onClose)} data-testid="confirm-remove-balance">
            {t("remove")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
