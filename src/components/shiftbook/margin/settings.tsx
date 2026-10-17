"use client";

// Pattern: docs/patterns/settings/margin.md — Bullhorn workers' compensation codes (state, code, name,
// rate, start, end; end-dated, never deleted), TempWorks worker comp codes per state and Initial
// Burden, Gusto pay schedule (the pay date after the period ends). Laid out as Linear's settings
// (docs/patterns/_components/settings.md): each rate a row in a panel — the state over its dates, the
// rate at the right — "Add rate" at the section heading's right; each choice a row, Save in the foot.
import { PlusIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { addTaxRateAction, addWcRateAction, setOtPremiumAction, setPayDayAction, type MarginActionResult } from "@/app/[locale]/(app)/settings/margin/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { useRouter } from "@/i18n/navigation";
import { parseFourPlaces } from "@/lib/amounts";
import { percentOf, perHundred } from "@/server/margin/burden";
import type { MarginSettings as View } from "@/server/margin/queries";
import { longDate } from "../format";
import { useDateTime } from "../agency-zone";
import { SettingsEmpty, SettingsFooter, SettingsRow, SettingsRows, SettingsSection, SettingsPage } from "../settings-panel";
import { ReadOnlyNote } from "../abilities";

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
  const changed = (c: { at: Date | string; by: string } | null) => (c ? <SettingsFooter note={t("changed", { date: when(c.at, { time: false }), by: c.by })} /> : undefined);
  /** "From October 5, 2026" or "October 5, 2026 to December 31, 2026". */
  const period = (from: string, to: string | null) => (to ? t("between", { from: longDate(from, locale), to: longDate(to, locale) }) : t("since", { date: longDate(from, locale) }));
  const past = (to: string | null) => to !== null && to < today;
  const inForce = <Badge variant="secondary">{t("inForce")}</Badge>;
  const add = (kind: "tax" | "wc", testId: string) =>
    canChange && (
      <Button size="sm" variant="outline" onClick={() => setAdding(kind)} data-testid={testId}>
        <PlusIcon />
        {t("addRate")}
      </Button>
    );
  return (
    <SettingsPage
      context={t("above")}
      title={t("title")}
      description={
        <>
          <p>{t("description")}</p>
          {!canChange && <p>{<ReadOnlyNote text={t("readOnly")} />}</p>}
        </>
      }
    >
      <SettingsSection id="taxes-title" title={t("taxes.title")} description={t("taxes.intro")} action={add("tax", "add-tax-rate")}>
        {view.taxRates.length === 0 ? (
          <SettingsRows footer={changed(view.changed.taxes)}>
            <SettingsEmpty>{t("taxes.none")}</SettingsEmpty>
          </SettingsRows>
        ) : (
          <SettingsRows as="ul" aria-labelledby="taxes-title" testId="tax-rates" footer={changed(view.changed.taxes)}>
            {view.taxRates.map((r) => (
              <SettingsRow
                key={r.id}
                as="li"
                testId="tax-rate"
                className={past(r.effectiveTo) ? "text-muted-foreground" : undefined}
                label={
                  <span className="flex flex-wrap items-center gap-2">
                    {r.state ?? t("anyOtherState")}
                    {r.inForce && inForce}
                  </span>
                }
                description={[period(r.effectiveFrom, r.effectiveTo), r.includes].filter(Boolean).join(" · ")}
                control={<span className="text-sm font-medium tabular-nums">{percentOf(r.ratePpm)}</span>}
              />
            ))}
          </SettingsRows>
        )}
      </SettingsSection>

      <SettingsSection
        id="wc-title"
        title={t("wc.title")}
        description={
          <>
            <p>{t("wc.intro")}</p>
            {view.missing.length > 0 && (
              <p className="text-destructive" data-testid="wc-missing">
                {t("wc.missing", { codes: view.missing.join(", ") })}
              </p>
            )}
          </>
        }
        action={add("wc", "add-wc-rate")}
      >
        {view.wcRates.length === 0 ? (
          <SettingsRows footer={changed(view.changed.wc)}>
            <SettingsEmpty>{t("wc.none")}</SettingsEmpty>
          </SettingsRows>
        ) : (
          <SettingsRows as="ul" aria-labelledby="wc-title" testId="wc-rates" footer={changed(view.changed.wc)}>
            {view.wcRates.map((r) => (
              <SettingsRow
                key={r.id}
                as="li"
                testId="wc-rate"
                className={past(r.effectiveTo) ? "text-muted-foreground" : undefined}
                label={
                  <span className="flex flex-wrap items-center gap-2">
                    {r.state} · {r.classCode}
                    {r.inForce && inForce}
                  </span>
                }
                description={[r.description, period(r.effectiveFrom, r.effectiveTo)].filter(Boolean).join(" · ")}
                control={<span className="text-sm font-medium tabular-nums">{t("wc.ratePer", { rate: perHundred(r.ratePpm) })}</span>}
              />
            ))}
          </SettingsRows>
        )}
        <OtPremium view={view} today={today} canChange={canChange} />
      </SettingsSection>

      <SettingsSection id="payday-title" title={t("payDay.title")} description={t("payDay.intro")}>
        <PayDay view={view} today={today} canChange={canChange} changedNote={view.changed.settings ? t("changed", { date: when(view.changed.settings.at, { time: false }), by: view.changed.settings.by }) : undefined} />
      </SettingsSection>

      {adding === "tax" && <TaxDialog states={states} today={today} onClose={() => setAdding(null)} />}
      {adding === "wc" && <WcDialog states={states} today={today} onClose={() => setAdding(null)} />}
    </SettingsPage>
  );
}

/** Leaving the overtime premium out: a switch in its row, the date it applies from in the next, Save in the foot. */
function OtPremium({ view, today, canChange }: { view: View; today: string; canChange: boolean }) {
  const t = useTranslations("marginSettings");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [exclude, setExclude] = useState(view.otPremium.exclude);
  const [from, setFrom] = useState(today);
  const [problems, setProblems] = useState<Problem[]>([]);
  const { pending, save } = useSave();
  return (
    <SettingsRows
      testId="ot-premium"
      footer={
        canChange && (
          <SettingsFooter>
            <Button disabled={pending || (exclude === view.otPremium.exclude && from === today)} onClick={() => save(() => setOtPremiumAction(exclude, from), () => setProblems([]), setProblems)} data-testid="save-ot-premium" loading={pending} loadingLabel={tc("loading")}>
              {t("save")}
            </Button>
          </SettingsFooter>
        )
      }
    >
      <SettingsRow
        label={t("wc.otPremium")}
        htmlFor="ot-premium"
        description={
          <>
            <span className="block">{t("wc.otPremiumHint")}</span>
            {view.otPremium.next && <span className="block text-foreground">{t(view.otPremium.next.exclude ? "wc.otNextOn" : "wc.otNextOff", { date: longDate(view.otPremium.next.from, locale) })}</span>}
          </>
        }
        control={<Switch id="ot-premium" checked={exclude} disabled={!canChange} onCheckedChange={(on) => setExclude(on)} />}
      />
      {canChange && (
        <SettingsRow
          label={t("from")}
          htmlFor="ot-from"
          description={problems.length > 0 ? <span className="text-destructive">{t("rules.date")}</span> : undefined}
          control={<Input id="ot-from" type="date" className="w-40" value={from} onChange={(e) => setFrom(e.target.value)} aria-invalid={problems.length > 0 ? true : undefined} />}
        />
      )}
    </SettingsRows>
  );
}

/** The pay day (Gusto pay schedule): the days in one row, the date it applies from in the next, Save in the foot. */
function PayDay({ view, today, canChange, changedNote }: { view: View; today: string; canChange: boolean; changedNote?: string }) {
  const t = useTranslations("marginSettings");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [days, setDays] = useState(view.payDay.days === null ? "" : String(view.payDay.days));
  const [from, setFrom] = useState(today);
  const [problems, setProblems] = useState<Problem[]>([]);
  const { pending, save } = useSave();
  const problem = (field: string) => problems.find((p) => p.field === field);
  return (
    <SettingsRows
      testId="pay-day"
      footer={
        (canChange || changedNote) && (
          <SettingsFooter note={changedNote}>
            {canChange && (
              <Button disabled={pending} onClick={() => save(() => setPayDayAction(/^\d+$/.test(days.trim()) ? Number(days.trim()) : -1, from), () => setProblems([]), setProblems)} data-testid="save-pay-day" loading={pending} loadingLabel={tc("loading")}>
                {t("save")}
              </Button>
            )}
          </SettingsFooter>
        )
      }
    >
      <SettingsRow
        label={t("payDay.days")}
        htmlFor={canChange ? "pay-days" : undefined}
        description={
          <>
            <span className="block">{view.payDay.days === null ? t("payDay.notSet") : t("payDay.current", { days: view.payDay.days, date: view.payDay.from ? longDate(view.payDay.from, locale) : "" })}</span>
            {view.payDay.next && <span className="block text-foreground">{t("payDay.next", { days: view.payDay.next.days, date: longDate(view.payDay.next.from, locale) })}</span>}
            {problem("days") && <span className="block text-destructive">{t("rules.days")}</span>}
          </>
        }
        control={canChange && <Input id="pay-days" inputMode="numeric" className="w-20" value={days} onChange={(e) => setDays(e.target.value)} aria-invalid={problem("days") ? true : undefined} data-testid="pay-days" />}
      />
      {canChange && (
        <SettingsRow
          label={t("from")}
          htmlFor="pay-from"
          description={
            <>
              <span className="block">{t("payDay.fromHint")}</span>
              {problem("effectiveFrom") && <span className="block text-destructive">{t("rules.date")}</span>}
            </>
          }
          control={<Input id="pay-from" type="date" className="w-40" value={from} onChange={(e) => setFrom(e.target.value)} aria-invalid={problem("effectiveFrom") ? true : undefined} />}
        />
      )}
    </SettingsRows>
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
  const tc = useTranslations("common");
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
            loading={pending}
            loadingLabel={tc("loading")}
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
  const tc = useTranslations("common");
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
            loading={pending}
            loadingLabel={tc("loading")}
          >
            {t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
