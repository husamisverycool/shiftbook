"use client";

// Pattern: docs/patterns/settings/payroll.md — Earning codes tab (7shifts custom export codes: one
// field per category, the fallback when blank stated per field; QuickBooks Time: one target item per
// hour type; the multiple declared where the agency sets it). Laid out as Linear's rows in a panel
// (docs/patterns/_components/settings.md): each kind of pay a row, what happens when blank under its
// name, its fields at the right under a caption row; Save in the panel's foot.
import type { EarningType } from "@shiftbook/rules";
import { exactDecimal } from "@shiftbook/rules";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { saveCodesAction } from "@/app/[locale]/(app)/settings/payroll/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { useRouter } from "@/i18n/navigation";
import { EARNING_TYPES, KIND_RULES, type CarriedAs, type CodeMap, type ExportFormat, type KindRule, type SettingProblem } from "@/exports/targets";
import { FieldProblem, useRefusal } from "./payroll-settings";
import { parseFactor, problemFor } from "./problems";
import { SettingsFooter, SettingsRow, SettingsRows, SettingsSection } from "../settings-panel";

interface Row {
  code: string;
  as: CarriedAs;
  factor: string;
}

const factorText = (f: { num: number; den: number }) => exactDecimal(f.num, f.den);
/** A fixed column the agency may leave out (Gusto's bonus column). */
const optionalColumn = (rule: KindRule) => rule.blank !== "fixed" && (rule.hours?.column ?? rule.dollars?.column);

export function EarningCodes({ format, codes, problems: stored, id, canEdit }: { format: ExportFormat; codes: CodeMap; problems: SettingProblem[]; id: string | null; canEdit: boolean }) {
  const t = useTranslations("settings.payroll");
  const router = useRouter();
  const refuse = useRefusal();
  const [pending, start] = useTransition();
  const rules = KIND_RULES[format];
  const system = t(`systems.${format}.name`);
  const [rows, setRows] = useState<Partial<Record<EarningType, Row>>>(() => {
    const out: Partial<Record<EarningType, Row>> = {};
    for (const kind of EARNING_TYPES) {
      const rule = rules[kind];
      if (!rule) continue;
      const c = codes[kind];
      const as: CarriedAs = c?.as ?? (rule.hours ? "hours" : "dollars");
      const way = as === "hours" ? rule.hours : rule.dollars;
      out[kind] = { code: typeof c?.code === "string" ? c.code : rule.blank === "fixed" ? (way?.column ?? "") : "", as, factor: c?.factor ? factorText(c.factor) : rule.hours ? factorText(rule.hours.factor) : "" };
    }
    return out;
  });
  // Codes saved under older rules show what is wrong with them at once.
  const [problems, setProblems] = useState<SettingProblem[]>(stored);
  const [saved, setSaved] = useState(false);
  const update = (kind: EarningType, change: Partial<Row>) => {
    setRows((r) => ({ ...r, [kind]: { ...r[kind]!, ...change } }));
    setSaved(false);
  };

  const save = () =>
    start(async () => {
      const map: CodeMap = {};
      for (const [kind, row] of Object.entries(rows) as [EarningType, Row][]) {
        const rule = rules[kind]!;
        const way = row.as === "hours" ? rule.hours : rule.dollars;
        const declared = row.as === "hours" && rule.hours?.declared;
        const factor = declared ? (parseFactor(row.factor) ?? { num: 0, den: 1 }) : undefined;
        map[kind] = { code: way?.column && rule.blank === "fixed" ? way.column : row.code.trim(), as: row.as, ...(factor ? { factor } : {}) };
      }
      const r = await saveCodesAction(format, map, id);
      if (r.ok) {
        setProblems([]);
        setSaved(true);
      } else {
        setProblems(r.error === "invalid" ? r.problems : []);
        refuse(r);
      }
      router.refresh();
    });

  return (
    <SettingsSection id="codes-title" titleHidden title={t("tabs.codes")} description={t("codes.hint", { system })}>
      <SettingsRows
        footer={
          canEdit && (
            <SettingsFooter>
              <span aria-live="polite" className="text-sm text-muted-foreground" data-testid="codes-saved">
                {saved ? t("saved") : ""}
              </span>
              <Button onClick={save} disabled={pending} data-testid="save-codes">
                {pending ? t("saving") : t("save")}
              </Button>
            </SettingsFooter>
          )
        }
      >
        {/* The fields' captions, once, over the rows (each field also names itself to a screen reader). */}
        <div className="hidden min-h-10 items-center gap-4 py-2 text-xs font-medium text-muted-foreground sm:flex" aria-hidden>
          <span className="flex-1">{t("codes.colKind")}</span>
          <span className="w-48">{t("codes.colCode")}</span>
          <span className="w-24">{t("codes.colAs")}</span>
          <span className="w-16">{t("codes.colFactor")}</span>
        </div>
        {EARNING_TYPES.map((kind) => {
          const rule = rules[kind];
          const name = t(`codes.kinds.${kind}`);
          if (!rule) {
            return (
              <SettingsRow
                key={kind}
                testId={`code-row-${kind}`}
                label={name}
                description={t("codes.blank.not_carried")}
                control={<span className="w-96 text-[13px] text-muted-foreground">{t("codes.notCarried")}</span>}
              />
            );
          }
          const row = rows[kind]!;
          const way = row.as === "hours" ? rule.hours : rule.dollars;
          const optional = optionalColumn(rule);
          const codeProblem = problemFor(problems, `codes.${kind}`);
          const factorProblem = problemFor(problems, `codes.${kind}.factor`);
          return (
            <SettingsRow
              key={kind}
              testId={`code-row-${kind}`}
              label={name}
              description={t(`codes.blank.${rule.blank}`, { code: kind })}
              control={
                <div className="flex items-start gap-4">
                  <div className="flex w-48 flex-col gap-1">
                    {rule.blank === "fixed" && way?.column ? (
                      <span className="py-1.5 text-[13px] leading-5 break-words">{t("codes.fixedColumn", { column: way.column })}</span>
                    ) : optional ? (
                      <NativeSelect aria-label={t("codes.codeLabel", { kind: name })} value={row.code} disabled={!canEdit} onChange={(e) => update(kind, { code: e.target.value })} className="w-48">
                        <NativeSelectOption value="">—</NativeSelectOption>
                        <NativeSelectOption value={optional}>{t("codes.fixedColumn", { column: optional })}</NativeSelectOption>
                      </NativeSelect>
                    ) : (
                      <>
                        <Input
                          aria-label={t("codes.codeLabel", { kind: name })}
                          value={row.code}
                          disabled={!canEdit}
                          placeholder={rule.blank === "own_code" ? kind : undefined}
                          aria-invalid={codeProblem ? true : undefined}
                          aria-describedby={codeProblem ? `code-${kind}-problem` : undefined}
                          onChange={(e) => update(kind, { code: e.target.value })}
                          data-testid={`code-${kind}`}
                        />
                        <FieldProblem problem={codeProblem} id={`code-${kind}-problem`} />
                      </>
                    )}
                  </div>
                  <div className="w-24">
                    {rule.hours && rule.dollars && !(optional || rule.blank === "fixed") ? (
                      <NativeSelect aria-label={t("codes.asLabel", { kind: name })} value={row.as} disabled={!canEdit} onChange={(e) => update(kind, { as: e.target.value as CarriedAs })} className="w-24">
                        <NativeSelectOption value="hours">{t("codes.hours")}</NativeSelectOption>
                        <NativeSelectOption value="dollars">{t("codes.dollars")}</NativeSelectOption>
                      </NativeSelect>
                    ) : (
                      <span className="block py-1.5 text-[13px] leading-5">{t(row.as === "hours" ? "codes.hours" : "codes.dollars")}</span>
                    )}
                  </div>
                  <div className="flex w-16 flex-col gap-1">
                    {row.as !== "hours" || format === "spreadsheet_csv" ? (
                      <span className="py-1.5 text-[13px] leading-5 text-muted-foreground">—</span>
                    ) : rule.hours?.declared ? (
                      <>
                        <Input
                          aria-label={t("codes.factorLabel", { kind: name })}
                          value={row.factor}
                          disabled={!canEdit}
                          inputMode="decimal"
                          aria-invalid={factorProblem ? true : undefined}
                          aria-describedby={factorProblem ? `factor-${kind}-problem` : undefined}
                          onChange={(e) => update(kind, { factor: e.target.value })}
                          data-testid={`factor-${kind}`}
                        />
                        <FieldProblem problem={factorProblem} id={`factor-${kind}-problem`} />
                      </>
                    ) : (
                      <span className="py-1.5 text-[13px] leading-5">{t("codes.factorFixed", { factor: factorText(rule.hours!.factor) })}</span>
                    )}
                  </div>
                </div>
              }
            />
          );
        })}
      </SettingsRows>
    </SettingsSection>
  );
}
