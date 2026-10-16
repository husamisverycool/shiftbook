"use client";

// Pattern: docs/patterns/settings/payroll.md — Earning codes tab (7shifts custom export codes: one
// field per category, the fallback when blank stated per field; QuickBooks Time: one target item per
// hour type; the multiple declared where the agency sets it).
import type { EarningType } from "@shiftbook/rules";
import { exactDecimal } from "@shiftbook/rules";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { saveCodesAction } from "@/app/[locale]/(app)/settings/payroll/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useRouter } from "@/i18n/navigation";
import { EARNING_TYPES, KIND_RULES, type CarriedAs, type CodeMap, type ExportFormat, type KindRule, type SettingProblem } from "@/exports/targets";
import { FieldProblem, useRefusal } from "./payroll-settings";
import { parseFactor, problemFor } from "./problems";

interface Row {
  code: string;
  as: CarriedAs;
  factor: string;
}

const factorText = (f: { num: number; den: number }) => exactDecimal(f.num, f.den);
/** A fixed column the agency may leave out (Gusto's bonus column). */
const optionalColumn = (rule: KindRule) => rule.blank !== "fixed" && (rule.hours?.column ?? rule.dollars?.column);

export function EarningCodes({ format, codes, id, canEdit }: { format: ExportFormat; codes: CodeMap; id: string | null; canEdit: boolean }) {
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
      out[kind] = { code: c?.code ?? (rule.blank === "fixed" ? (way?.column ?? "") : ""), as, factor: c?.factor ? factorText(c.factor) : rule.hours ? factorText(rule.hours.factor) : "" };
    }
    return out;
  });
  const [problems, setProblems] = useState<SettingProblem[]>([]);
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
    <section className="flex flex-col gap-4" aria-labelledby="codes-title">
      <div className="flex flex-col gap-1">
        <h2 id="codes-title" className="text-lg font-semibold">
          {t("tabs.codes")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("codes.hint", { system })}</p>
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("codes.colKind")}</TableHead>
              <TableHead>{t("codes.colCode")}</TableHead>
              <TableHead>{t("codes.colAs")}</TableHead>
              <TableHead>{t("codes.colFactor")}</TableHead>
              <TableHead>{t("codes.colBlank")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {EARNING_TYPES.map((kind) => {
              const rule = rules[kind];
              const name = t(`codes.kinds.${kind}`);
              if (!rule) {
                return (
                  <TableRow key={kind} data-testid={`code-row-${kind}`}>
                    <TableCell className="font-medium">{name}</TableCell>
                    <TableCell colSpan={3} className="whitespace-normal text-muted-foreground">
                      {t("codes.notCarried")}
                    </TableCell>
                    <TableCell className="min-w-64 whitespace-normal text-muted-foreground">{t("codes.blank.not_carried")}</TableCell>
                  </TableRow>
                );
              }
              const row = rows[kind]!;
              const way = row.as === "hours" ? rule.hours : rule.dollars;
              const optional = optionalColumn(rule);
              const codeProblem = problemFor(problems, `codes.${kind}`);
              const factorProblem = problemFor(problems, `codes.${kind}.factor`);
              return (
                <TableRow key={kind} data-testid={`code-row-${kind}`}>
                  <TableCell className="align-top font-medium">{name}</TableCell>
                  <TableCell className="align-top">
                    {rule.blank === "fixed" && way?.column ? (
                      <span>{t("codes.fixedColumn", { column: way.column })}</span>
                    ) : optional ? (
                      <NativeSelect aria-label={t("codes.codeLabel", { kind: name })} value={row.code} disabled={!canEdit} onChange={(e) => update(kind, { code: e.target.value })} className="w-48">
                        <NativeSelectOption value="">—</NativeSelectOption>
                        <NativeSelectOption value={optional}>{t("codes.fixedColumn", { column: optional })}</NativeSelectOption>
                      </NativeSelect>
                    ) : (
                      <div className="flex flex-col gap-1">
                        <Input
                          aria-label={t("codes.codeLabel", { kind: name })}
                          value={row.code}
                          disabled={!canEdit}
                          placeholder={rule.blank === "own_code" ? kind : undefined}
                          aria-invalid={codeProblem ? true : undefined}
                          aria-describedby={codeProblem ? `code-${kind}-problem` : undefined}
                          onChange={(e) => update(kind, { code: e.target.value })}
                          className="w-48"
                          data-testid={`code-${kind}`}
                        />
                        <FieldProblem problem={codeProblem} id={`code-${kind}-problem`} />
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="align-top">
                    {rule.hours && rule.dollars && !(optional || rule.blank === "fixed") ? (
                      <NativeSelect aria-label={t("codes.asLabel", { kind: name })} value={row.as} disabled={!canEdit} onChange={(e) => update(kind, { as: e.target.value as CarriedAs })} className="w-32">
                        <NativeSelectOption value="hours">{t("codes.hours")}</NativeSelectOption>
                        <NativeSelectOption value="dollars">{t("codes.dollars")}</NativeSelectOption>
                      </NativeSelect>
                    ) : (
                      <span>{t(row.as === "hours" ? "codes.hours" : "codes.dollars")}</span>
                    )}
                  </TableCell>
                  <TableCell className="align-top">
                    {row.as !== "hours" || format === "spreadsheet_csv" ? (
                      <span className="text-muted-foreground">—</span>
                    ) : rule.hours?.declared ? (
                      <div className="flex flex-col gap-1">
                        <Input
                          aria-label={t("codes.factorLabel", { kind: name })}
                          value={row.factor}
                          disabled={!canEdit}
                          inputMode="decimal"
                          aria-invalid={factorProblem ? true : undefined}
                          aria-describedby={factorProblem ? `factor-${kind}-problem` : undefined}
                          onChange={(e) => update(kind, { factor: e.target.value })}
                          className="w-24"
                          data-testid={`factor-${kind}`}
                        />
                        <FieldProblem problem={factorProblem} id={`factor-${kind}-problem`} />
                      </div>
                    ) : (
                      <span>{t("codes.factorFixed", { factor: factorText(rule.hours!.factor) })}</span>
                    )}
                  </TableCell>
                  <TableCell className="min-w-64 align-top whitespace-normal text-muted-foreground">{t(`codes.blank.${rule.blank}`, { code: kind })}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      {canEdit && (
        <div className="flex items-center gap-3">
          <Button onClick={save} disabled={pending} data-testid="save-codes">
            {pending ? t("saving") : t("save")}
          </Button>
          <span aria-live="polite" className="text-sm text-muted-foreground" data-testid="codes-saved">
            {saved ? t("saved") : ""}
          </span>
        </div>
      )}
    </section>
  );
}
