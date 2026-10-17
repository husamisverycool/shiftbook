"use client";

// Pattern: docs/patterns/settings/money.md — Linear's settings (`_components/settings.md`): one centred
// column, each section a heading and its muted line over a bordered panel of rows, the control at the
// row's right, Save in the panel's foot.
import { useTranslations } from "next-intl";
import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { FundingRules } from "@/server/money/funding";
import type { MoneySettingsResult } from "@/server/money/settings";
import type { WageAccessRules } from "@/server/money/wage-access";
import { setFundingRulesAction, setWageAccessRulesAction } from "@/app/[locale]/(app)/settings/money/actions";
import { ReadOnlyNote, useCan } from "../abilities";
import { SettingsFooter, SettingsPage, SettingsRow, SettingsRows, SettingsSection } from "../settings-panel";
import { NoMoneyMoves } from "./frame";
import { parseDollars } from "./wage-access";

/** "12.5" → 1250 bps; whole or two-place percents only. */
export function parsePercent(text: string): number | null {
  const m = /^\s*(\d{1,3})(?:\.(\d{1,2}))?\s*%?\s*$/.exec(text);
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
}
const showPercent = (bps: number) => (bps % 100 === 0 ? String(bps / 100) : (bps / 100).toFixed(2).replace(/0$/, ""));
const showDollars = (cents: number) => `${Math.trunc(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;

type Problems = Record<string, string>;

function useSave(action: (input: unknown) => Promise<MoneySettingsResult>) {
  const t = useTranslations("money.settings");
  const [pending, start] = useTransition();
  const [problems, setProblems] = useState<Problems>({});
  const save = (input: Record<string, unknown> | null, local: Problems) => {
    if (!input) return setProblems(local);
    setProblems({});
    start(async () => {
      const r = await action(input);
      if (r.ok) toast.success(t("saved"));
      else if (r.error === "invalid") setProblems(Object.fromEntries(r.problems.map((p) => [p.field, t(`problems.${p.rule}`)])));
      else toast.error(t("readOnly"));
    });
  };
  return { pending, problems, save };
}

function Field({ id, value, onChange, suffix, disabled, problem, testId }: { id: string; value: string; onChange: (v: string) => void; suffix?: string; disabled: boolean; problem?: string; testId: string }) {
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1.5">
        <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} inputMode="decimal" className="w-24 text-right tabular-nums" aria-invalid={problem !== undefined} data-testid={testId} />
        {suffix && <span className="text-sm text-muted-foreground">{suffix}</span>}
      </div>
      {problem && <span className="text-[13px] text-destructive">{problem}</span>}
    </div>
  );
}

function Row({ id, label, hint, children }: { id: string; label: string; hint: string; children: ReactNode }) {
  return <SettingsRow htmlFor={id} label={label} description={hint} control={children} />;
}

export function MoneySettingsView({ wage, funding }: { wage: WageAccessRules; funding: FundingRules }) {
  const t = useTranslations("money.settings");
  const can = useCan();
  const off = !can("money");

  const [wOn, setWOn] = useState(wage.enabled);
  const [cap, setCap] = useState(showPercent(wage.capBps));
  const [max, setMax] = useState(showDollars(wage.maxPerRequestCents));
  const [fee, setFee] = useState(showDollars(wage.expeditedFeeCents));
  const w = useSave(setWageAccessRulesAction);

  const [fOn, setFOn] = useState(funding.enabled);
  const [advance, setAdvance] = useState(showPercent(funding.advanceBps));
  const [feePct, setFeePct] = useState(showPercent(funding.feeBps));
  const [share, setShare] = useState(showPercent(funding.maxConcentrationBps));
  const [age, setAge] = useState(String(funding.maxAgeDays));
  const [approval, setApproval] = useState(funding.requireClientApproval);
  const f = useSave(setFundingRulesAction);

  const saveWage = () => {
    const local: Problems = {};
    const capBps = parsePercent(cap);
    const maxCents = parseDollars(max);
    const feeCents = parseDollars(fee);
    if (capBps === null) local.capBps = t("problems.range");
    if (maxCents === null) local.maxPerRequestCents = t("problems.range");
    if (feeCents === null) local.expeditedFeeCents = t("problems.range");
    w.save(Object.keys(local).length > 0 ? null : { enabled: wOn, capBps, maxPerRequestCents: maxCents, expeditedFeeCents: feeCents }, local);
  };
  const saveFunding = () => {
    const local: Problems = {};
    const values = { advanceBps: parsePercent(advance), feeBps: parsePercent(feePct), maxConcentrationBps: parsePercent(share), maxAgeDays: /^\s*\d{1,3}\s*$/.test(age) ? Number(age) : null };
    for (const [k, v] of Object.entries(values)) if (v === null) local[k] = t("problems.range");
    f.save(Object.keys(local).length > 0 ? null : { enabled: fOn, ...values, requireClientApproval: approval }, local);
  };

  return (
    <SettingsPage context={t("kicker")} title={t("title")} description={<NoMoneyMoves />}>
      <SettingsSection title={t("wageTitle")} description={t("wageLine")} testId="wage-settings">
        <SettingsRows
          footer={
            <SettingsFooter note={off ? <ReadOnlyNote text={t("readOnly")} /> : t("fromToday")}>
              {!off && (
                <Button size="sm" onClick={saveWage} loading={w.pending} loadingLabel={t("save")} data-testid="save-wage">
                  {t("save")}
                </Button>
              )}
            </SettingsFooter>
          }
        >
          <Row id="wage-on" label={t("on")} hint={t("onHint")}>
            <Switch id="wage-on" checked={wOn} onCheckedChange={setWOn} disabled={off} data-testid="wage-on" />
          </Row>
          <Row id="wage-cap" label={t("cap")} hint={t("capHint")}>
            <Field id="wage-cap" value={cap} onChange={setCap} suffix="%" disabled={off} problem={w.problems.capBps} testId="wage-cap" />
          </Row>
          <Row id="wage-max" label={t("maxPerRequest")} hint={t("maxPerRequestHint")}>
            <Field id="wage-max" value={max} onChange={setMax} suffix="$" disabled={off} problem={w.problems.maxPerRequestCents} testId="wage-max" />
          </Row>
          <Row id="wage-fee" label={t("fee")} hint={t("feeHint")}>
            <Field id="wage-fee" value={fee} onChange={setFee} suffix="$" disabled={off} problem={w.problems.expeditedFeeCents} testId="wage-fee" />
          </Row>
        </SettingsRows>
      </SettingsSection>

      <SettingsSection title={t("fundingTitle")} description={t("fundingLine")} testId="funding-settings">
        <SettingsRows
          footer={
            <SettingsFooter note={off ? <ReadOnlyNote text={t("readOnly")} /> : t("fromToday")}>
              {!off && (
                <Button size="sm" onClick={saveFunding} loading={f.pending} loadingLabel={t("save")} data-testid="save-funding">
                  {t("save")}
                </Button>
              )}
            </SettingsFooter>
          }
        >
          <Row id="funding-on" label={t("on")} hint={t("fundingOnHint")}>
            <Switch id="funding-on" checked={fOn} onCheckedChange={setFOn} disabled={off} data-testid="funding-on" />
          </Row>
          <Row id="funding-advance" label={t("advance")} hint={t("advanceHint")}>
            <Field id="funding-advance" value={advance} onChange={setAdvance} suffix="%" disabled={off} problem={f.problems.advanceBps} testId="funding-advance" />
          </Row>
          <Row id="funding-fee" label={t("feePct")} hint={t("feePctHint")}>
            <Field id="funding-fee" value={feePct} onChange={setFeePct} suffix="%" disabled={off} problem={f.problems.feeBps} testId="funding-fee" />
          </Row>
          <Row id="funding-share" label={t("concentration")} hint={t("concentrationHint")}>
            <Field id="funding-share" value={share} onChange={setShare} suffix="%" disabled={off} problem={f.problems.maxConcentrationBps} testId="funding-share" />
          </Row>
          <Row id="funding-age" label={t("maxAge")} hint={t("maxAgeHint")}>
            <Field id="funding-age" value={age} onChange={setAge} disabled={off} problem={f.problems.maxAgeDays} testId="funding-age" />
          </Row>
          <Row id="funding-approval" label={t("approval")} hint={t("approvalHint")}>
            <Switch id="funding-approval" checked={approval} onCheckedChange={setApproval} disabled={off} data-testid="funding-approval" />
          </Row>
        </SettingsRows>
      </SettingsSection>
    </SettingsPage>
  );
}
