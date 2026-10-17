"use client";

// Pattern: docs/patterns/settings/margin.md — Bullhorn workers' compensation codes (state, code, name,
// rate, start, end; end-dated, never deleted), TempWorks worker comp codes per state and Initial
// Burden, Gusto pay schedule (the pay date after the period ends).
import { PlusIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { addTaxRateAction, addWcRateAction, setOtPremiumAction, setPayDayAction, type MarginActionResult } from "@/app/[locale]/(app)/settings/margin/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useRouter } from "@/i18n/navigation";
import { parseFourPlaces } from "@/lib/amounts";
import { percentOf, perHundred } from "@/server/margin/burden";
import type { MarginSettings as View } from "@/server/margin/queries";
import { longDate } from "../format";
import { useDateTime } from "../agency-zone";

type Problem = { field: string; rule: string };

function useSave() {
  const t = useTranslations("marginSettings");
  const router = useRouter();
  const [pending, start] = useTransition();
  const save = (fn: () => Promise<MarginActionResult>, done: () => void, onProblems: (p: Problem[]) => void) =>
    start(async () => {
      const r = await fn();
      if (r.ok) {
        toast.success(t("saved"));
        done();
        router.refresh();
      } else if (r.error === "invalid") onProblems(r.problems);
      else toast.error(t(`errors.${r.error}` as "errors.generic"));
    });
  return { pending, save };
}

export function MarginSettingsView({ view, today, states, canChange }: { view: View; today: string; states: string[]; canChange: boolean }) {
  const t = useTranslations("marginSettings");
  const locale = useLocale();
  const when = useDateTime();
  const [adding, setAdding] = useState<"tax" | "wc" | null>(null);
  const date = (d: string | null) => (d ? longDate(d, locale) : "—");
  const changed = (c: { at: Date | string; by: string } | null) =>
    c ? <p className="text-xs text-muted-foreground">{t("changed", { date: when(c.at, { time: false }), by: c.by })}</p> : null;
  const section = (id: string, title: string, intro: string, action: ReactNode, body: ReactNode, foot: ReactNode) => (
    <section className="flex flex-col gap-3" aria-labelledby={id}>
      <div className="flex flex-wrap items-center gap-3">
        <h2 id={id} className="mr-auto text-lg font-semibold">
          {title}
        </h2>
        {action}
      </div>
      <p className="text-sm text-muted-foreground">{intro}</p>
      {body}
      {foot}
    </section>
  );
  return (
    <div className="mx-auto flex w-full max-w-5xl min-w-0 flex-col gap-8 px-4 py-6 md:px-8 md:py-8">
      <header className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">{t("above")}</p>
        <h1 className="text-[28px] leading-9 font-bold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
        {!canChange && <p className="text-sm text-muted-foreground">{t("readOnly")}</p>}
      </header>

      {section(
        "taxes-title",
        t("taxes.title"),
        t("taxes.intro"),
        canChange && (
          <Button size="sm" variant="outline" onClick={() => setAdding("tax")} data-testid="add-tax-rate">
            <PlusIcon />
            {t("addRate")}
          </Button>
        ),
        view.taxRates.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("taxes.none")}</p>
        ) : (
          <div className="min-w-0">
            <Table aria-labelledby="taxes-title" data-testid="tax-rates">
              <TableHeader>
                <TableRow>
                  <TableHead>{t("state")}</TableHead>
                  <TableHead className="text-right">{t("taxes.rate")}</TableHead>
                  <TableHead>{t("from")}</TableHead>
                  <TableHead>{t("to")}</TableHead>
                  <TableHead>{t("taxes.includes")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {view.taxRates.map((r) => (
                  <TableRow key={r.id} className={r.effectiveTo !== null && r.effectiveTo < today ? "text-muted-foreground" : undefined} data-testid="tax-rate">
                    <TableCell>
                      <span className="flex items-center gap-2">
                        {r.state ?? t("anyOtherState")}
                        {r.inForce && <Badge variant="secondary">{t("inForce")}</Badge>}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{percentOf(r.ratePpm)}</TableCell>
                    <TableCell className="whitespace-nowrap">{date(r.effectiveFrom)}</TableCell>
                    <TableCell className="whitespace-nowrap">{date(r.effectiveTo)}</TableCell>
                    <TableCell className="text-muted-foreground">{r.includes ?? ""}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ),
        changed(view.changed.taxes),
      )}

      {section(
        "wc-title",
        t("wc.title"),
        t("wc.intro"),
        canChange && (
          <Button size="sm" variant="outline" onClick={() => setAdding("wc")} data-testid="add-wc-rate">
            <PlusIcon />
            {t("addRate")}
          </Button>
        ),
        <>
          {view.missing.length > 0 && (
            <p className="text-sm text-destructive" data-testid="wc-missing">
              {t("wc.missing", { codes: view.missing.join(", ") })}
            </p>
          )}
          {view.wcRates.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("wc.none")}</p>
          ) : (
            <div className="min-w-0">
              <Table aria-labelledby="wc-title" data-testid="wc-rates">
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("state")}</TableHead>
                    <TableHead>{t("wc.classCode")}</TableHead>
                    <TableHead>{t("wc.description")}</TableHead>
                    <TableHead className="text-right">{t("wc.rate")}</TableHead>
                    <TableHead>{t("from")}</TableHead>
                    <TableHead>{t("to")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {view.wcRates.map((r) => (
                    <TableRow key={r.id} className={r.effectiveTo !== null && r.effectiveTo < today ? "text-muted-foreground" : undefined} data-testid="wc-rate">
                      <TableCell>
                        <span className="flex items-center gap-2">
                          {r.state}
                          {r.inForce && <Badge variant="secondary">{t("inForce")}</Badge>}
                        </span>
                      </TableCell>
                      <TableCell className="font-medium">{r.classCode}</TableCell>
                      <TableCell className="text-muted-foreground">{r.description ?? ""}</TableCell>
                      <TableCell className="text-right tabular-nums">{perHundred(r.ratePpm)}</TableCell>
                      <TableCell className="whitespace-nowrap">{date(r.effectiveFrom)}</TableCell>
                      <TableCell className="whitespace-nowrap">{date(r.effectiveTo)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <OtPremium view={view} today={today} canChange={canChange} />
        </>,
        changed(view.changed.wc),
      )}

      {section("payday-title", t("payDay.title"), t("payDay.intro"), null, <PayDay view={view} today={today} canChange={canChange} />, changed(view.changed.settings))}

      {adding === "tax" && <TaxDialog states={states} today={today} onClose={() => setAdding(null)} />}
      {adding === "wc" && <WcDialog states={states} today={today} onClose={() => setAdding(null)} />}
    </div>
  );
}

function OtPremium({ view, today, canChange }: { view: View; today: string; canChange: boolean }) {
  const t = useTranslations("marginSettings");
  const locale = useLocale();
  const [exclude, setExclude] = useState(view.otPremium.exclude);
  const [from, setFrom] = useState(today);
  const [problems, setProblems] = useState<Problem[]>([]);
  const { pending, save } = useSave();
  return (
    <div className="flex flex-col gap-2 rounded-xl border bg-card p-4" data-testid="ot-premium">
      <div className="flex items-center gap-2">
        <Checkbox id="ot-premium" checked={exclude} disabled={!canChange} onCheckedChange={(on) => setExclude(on === true)} />
        <Label htmlFor="ot-premium">{t("wc.otPremium")}</Label>
      </div>
      <p className="text-xs text-muted-foreground">{t("wc.otPremiumHint")}</p>
      {view.otPremium.next && <p className="text-xs">{t(view.otPremium.next.exclude ? "wc.otNextOn" : "wc.otNextOff", { date: longDate(view.otPremium.next.from, locale) })}</p>}
      {canChange && (
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor="ot-from" className="text-xs text-muted-foreground">
              {t("from")}
            </Label>
            <Input id="ot-from" type="date" className="w-44" value={from} onChange={(e) => setFrom(e.target.value)} aria-invalid={problems.length > 0 ? true : undefined} />
          </div>
          <Button size="sm" disabled={pending || (exclude === view.otPremium.exclude && from === today)} onClick={() => save(() => setOtPremiumAction(exclude, from), () => setProblems([]), setProblems)} data-testid="save-ot-premium">
            {t("save")}
          </Button>
        </div>
      )}
    </div>
  );
}

function PayDay({ view, today, canChange }: { view: View; today: string; canChange: boolean }) {
  const t = useTranslations("marginSettings");
  const locale = useLocale();
  const [days, setDays] = useState(view.payDay.days === null ? "" : String(view.payDay.days));
  const [from, setFrom] = useState(today);
  const [problems, setProblems] = useState<Problem[]>([]);
  const { pending, save } = useSave();
  const problem = (field: string) => problems.find((p) => p.field === field);
  return (
    <div className="flex flex-col gap-2 rounded-xl border bg-card p-4" data-testid="pay-day">
      <p className="text-sm">{view.payDay.days === null ? t("payDay.notSet") : t("payDay.current", { days: view.payDay.days, date: view.payDay.from ? longDate(view.payDay.from, locale) : "" })}</p>
      {view.payDay.next && <p className="text-xs">{t("payDay.next", { days: view.payDay.next.days, date: longDate(view.payDay.next.from, locale) })}</p>}
      {canChange && (
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor="pay-days" className="text-xs text-muted-foreground">
              {t("payDay.days")}
            </Label>
            <Input id="pay-days" inputMode="numeric" className="w-24" value={days} onChange={(e) => setDays(e.target.value)} aria-invalid={problem("days") ? true : undefined} data-testid="pay-days" />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="pay-from" className="text-xs text-muted-foreground">
              {t("from")}
            </Label>
            <Input id="pay-from" type="date" className="w-44" value={from} onChange={(e) => setFrom(e.target.value)} aria-invalid={problem("effectiveFrom") ? true : undefined} />
          </div>
          <Button size="sm" disabled={pending} onClick={() => save(() => setPayDayAction(/^\d+$/.test(days.trim()) ? Number(days.trim()) : -1, from), () => setProblems([]), setProblems)} data-testid="save-pay-day">
            {t("save")}
          </Button>
        </div>
      )}
      {canChange && <p className="text-xs text-muted-foreground">{t("payDay.fromHint")}</p>}
      {problem("days") && <p className="text-sm text-destructive">{t("rules.days")}</p>}
      {problem("effectiveFrom") && <p className="text-sm text-destructive">{t("rules.date")}</p>}
    </div>
  );
}

function StateSelect({ id, value, onChange, states, any }: { id: string; value: string; onChange: (v: string) => void; states: string[]; any?: boolean }) {
  const t = useTranslations("marginSettings");
  return (
    <NativeSelect id={id} className="w-full" value={value} onChange={(e) => onChange(e.target.value)}>
      {any ? <NativeSelectOption value="">{t("anyOtherState")}</NativeSelectOption> : <NativeSelectOption value="">{t("chooseState")}</NativeSelectOption>}
      {states.map((st) => (
        <NativeSelectOption key={st} value={st}>
          {st}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  );
}

function RuleUnder({ problems, field }: { problems: Problem[]; field: string }) {
  const t = useTranslations("marginSettings");
  const p = problems.find((x) => x.field === field);
  return p ? <p className="text-sm text-destructive">{t(`rules.${p.rule}` as "rules.date")}</p> : null;
}

function TaxDialog({ states, today, onClose }: { states: string[]; today: string; onClose: () => void }) {
  const t = useTranslations("marginSettings");
  const [state, setState] = useState("");
  const [rate, setRate] = useState("");
  const [includes, setIncludes] = useState("");
  const [from, setFrom] = useState(today);
  const [problems, setProblems] = useState<Problem[]>([]);
  const { pending, save } = useSave();
  const ppm = parseFourPlaces(rate);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("taxes.addTitle")}</DialogTitle>
          <DialogDescription>{t("addBody")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tax-state">{t("state")}</Label>
            <StateSelect id="tax-state" value={state} onChange={setState} states={states} any />
            <RuleUnder problems={problems} field="state" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tax-rate">{t("taxes.rate")}</Label>
            <Input id="tax-rate" inputMode="decimal" placeholder="11.75" value={rate} onChange={(e) => setRate(e.target.value)} aria-invalid={rate !== "" && ppm === null ? true : undefined} data-testid="tax-rate-input" />
            <RuleUnder problems={problems} field="ratePpm" />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="tax-includes">{t("taxes.includes")}</Label>
            <Input id="tax-includes" value={includes} maxLength={200} placeholder={t("taxes.includesHint")} onChange={(e) => setIncludes(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tax-from">{t("from")}</Label>
            <Input id="tax-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            <RuleUnder problems={problems} field="effectiveFrom" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button
            disabled={pending || ppm === null}
            onClick={() => save(() => addTaxRateAction({ state: state || null, ratePpm: ppm ?? -1, includes: includes.trim() || null, effectiveFrom: from }), onClose, setProblems)}
            data-testid="save-tax-rate"
          >
            {t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function WcDialog({ states, today, onClose }: { states: string[]; today: string; onClose: () => void }) {
  const t = useTranslations("marginSettings");
  const [state, setState] = useState("");
  const [classCode, setClassCode] = useState("");
  const [description, setDescription] = useState("");
  const [rate, setRate] = useState("");
  const [from, setFrom] = useState(today);
  const [problems, setProblems] = useState<Problem[]>([]);
  const { pending, save } = useSave();
  const ppm = parseFourPlaces(rate);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("wc.addTitle")}</DialogTitle>
          <DialogDescription>{t("addBody")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="wc-state">{t("state")}</Label>
            <StateSelect id="wc-state" value={state} onChange={setState} states={states} />
            <RuleUnder problems={problems} field="state" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="wc-class">{t("wc.classCode")}</Label>
            <Input id="wc-class" value={classCode} maxLength={12} placeholder="8292" onChange={(e) => setClassCode(e.target.value)} data-testid="wc-class-input" />
            <RuleUnder problems={problems} field="classCode" />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="wc-description">{t("wc.description")}</Label>
            <Input id="wc-description" value={description} maxLength={120} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="wc-rate">{t("wc.rate")}</Label>
            <Input id="wc-rate" inputMode="decimal" placeholder="4.00" value={rate} onChange={(e) => setRate(e.target.value)} aria-invalid={rate !== "" && ppm === null ? true : undefined} data-testid="wc-rate-input" />
            <RuleUnder problems={problems} field="ratePpm" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="wc-from">{t("from")}</Label>
            <Input id="wc-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} data-testid="wc-from-input" />
            <RuleUnder problems={problems} field="effectiveFrom" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button
            disabled={pending || ppm === null}
            onClick={() => save(() => addWcRateAction({ state, classCode: classCode.trim(), description: description.trim() || null, ratePpm: ppm ?? -1, effectiveFrom: from }), onClose, setProblems)}
            data-testid="save-wc-rate"
          >
            {t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
