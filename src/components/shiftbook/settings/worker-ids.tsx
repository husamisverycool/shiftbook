"use client";

// Pattern: docs/patterns/settings/payroll.md — Worker ids tab (7shifts mapping page: Matched /
// Unmatched filter, search, a progress bar, a status per row; QuickBooks Time saves on change).
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { saveWorkerIdAction } from "@/app/[locale]/(app)/settings/payroll/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useRouter } from "@/i18n/navigation";
import type { PayrollSystem, SettingProblem } from "@/exports/targets";
import type { PayrollSettingsView } from "@/server/payroll/queries";
import { FieldProblem, useRefusal, type WorkerFilter } from "./payroll-settings";

type Worker = PayrollSettingsView["workers"][number];
const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

export function WorkerIds({ system, workers, filter, onFilter, canEdit }: { system: PayrollSystem; workers: Worker[]; filter: WorkerFilter; onFilter: (f: WorkerFilter) => void; canEdit: boolean }) {
  const t = useTranslations("settings.payroll");
  const router = useRouter();
  const refuse = useRefusal();
  // What is stored, what is typed, and each row's last refusal.
  const [stored, setStored] = useState(() => new Map(workers.map((w) => [w.id, { id: w.value, title: w.title }])));
  const [typed, setTyped] = useState(() => new Map(workers.map((w) => [w.id, { id: w.value, title: w.title }])));
  const [problems, setProblems] = useState(new Map<string, SettingProblem | { field: "id"; rule: "taken"; by: string; message: string }>());
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const isSet = (id: string) => (stored.get(id)?.id ?? "") !== "";
  const setCount = workers.filter((w) => isSet(w.id)).length;
  const gusto = system === "gusto";
  const idName = t(`workers.idNames.${system}`);

  // Which rows the filter holds is taken when the filter is chosen, so a row being filled in does
  // not vanish under the cursor once its id saves.
  const [members, setMembers] = useState(() => new Set(workers.filter((w) => w.value !== "").map((w) => w.id)));
  const setFilter = (next: WorkerFilter) => {
    setMembers(new Set(workers.filter((w) => isSet(w.id)).map((w) => w.id)));
    onFilter(next);
  };
  const shown = useMemo(
    () => workers.filter((w) => (filter === "all" || (filter === "set") === members.has(w.id)) && (query.trim() === "" || fold(`${w.firstName} ${w.lastName}`).includes(fold(query.trim())))),
    [workers, filter, query, members],
  );

  const save = async (w: Worker) => {
    const now = typed.get(w.id)!;
    const before = stored.get(w.id)!;
    if (now.id === before.id && (!gusto || now.title === before.title)) return;
    setSaving(w.id);
    const r = await saveWorkerIdAction(w.id, system, now.id.trim() === "" ? "" : now.id, gusto ? now.title : undefined);
    setSaving(null);
    const next = new Map(problems);
    if (r.ok) {
      next.delete(w.id);
      setStored((s) => new Map(s).set(w.id, now.id.trim() === "" ? { id: "", title: "" } : now));
    } else if (r.error === "invalid") {
      next.set(w.id, r.problems[0]!);
    } else if (r.error === "taken") {
      next.set(w.id, { field: "id", rule: "taken", by: r.by, message: "" });
    } else {
      refuse(r);
    }
    setProblems(next);
    router.refresh();
  };
  const onKey = (w: Worker) => (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") void save(w);
    if (e.key === "Escape") setTyped((m) => new Map(m).set(w.id, stored.get(w.id)!));
  };
  const chips: WorkerFilter[] = ["all", "missing", "set"];
  const count = (f: WorkerFilter) => (f === "all" ? workers.length : f === "set" ? setCount : workers.length - setCount);

  return (
    <section className="flex flex-col gap-4" aria-labelledby="workers-title">
      <div className="flex flex-col gap-1">
        <h2 id="workers-title" className="text-lg font-semibold">
          {t("tabs.workers")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("workers.hint", { idName, system: t(`systems.${systemFormat(system)}.name`) })}</p>
      </div>
      <div className="flex flex-col gap-2">
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={workers.length}
          aria-valuenow={setCount}
          aria-label={t("workers.progress", { set: setCount, total: workers.length })}
          className="h-2 w-full max-w-md overflow-hidden rounded-full bg-muted"
        >
          <div className="h-full bg-primary transition-[width]" style={{ width: `${workers.length === 0 ? 0 : Math.round((setCount * 100) / workers.length)}%` }} />
        </div>
        <p className="text-sm text-muted-foreground" data-testid="ids-progress">
          {t("workers.progress", { set: setCount, total: workers.length })}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {chips.map((f) => (
          <Button key={f} size="sm" variant={filter === f ? "secondary" : "outline"} aria-pressed={filter === f} onClick={() => setFilter(f)} data-testid={`filter-${f}`}>
            {t(`workers.${f}`)} · {count(f)}
          </Button>
        ))}
        <Input type="search" aria-label={t("workers.search")} placeholder={t("workers.search")} value={query} onChange={(e) => setQuery(e.target.value)} className="ml-auto w-64" />
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("workers.colWorker")}</TableHead>
              <TableHead>{t("workers.colId")}</TableHead>
              {gusto && <TableHead>{t("workers.colTitle")}</TableHead>}
              <TableHead>{t("workers.colStatus")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.length === 0 ? (
              <TableRow>
                <TableCell colSpan={gusto ? 4 : 3} className="py-8 text-center text-muted-foreground">
                  {t("workers.none")}
                </TableCell>
              </TableRow>
            ) : (
              shown.map((w) => {
                const name = `${w.firstName} ${w.lastName}`;
                const problem = problems.get(w.id);
                const value = typed.get(w.id)!;
                return (
                  <TableRow key={w.id} data-testid="id-row">
                    <TableCell className="align-top font-medium">{name}</TableCell>
                    <TableCell className="align-top">
                      <div className="flex flex-col gap-1">
                        <Input
                          aria-label={t("workers.idLabel", { idName, name })}
                          value={value.id}
                          disabled={!canEdit || saving === w.id}
                          aria-invalid={problem?.field === "id" ? true : undefined}
                          aria-describedby={problem?.field === "id" ? `id-${w.id}-problem` : undefined}
                          onChange={(e) => setTyped((m) => new Map(m).set(w.id, { ...value, id: e.target.value }))}
                          onBlur={() => void save(w)}
                          onKeyDown={onKey(w)}
                          className="w-64"
                          data-testid="worker-id"
                        />
                        {problem?.field === "id" &&
                          ("by" in problem ? (
                            <p id={`id-${w.id}-problem`} className="text-sm text-destructive" data-testid="field-problem">
                              {t("workers.taken", { name: problem.by })}
                            </p>
                          ) : (
                            <FieldProblem problem={problem} id={`id-${w.id}-problem`} />
                          ))}
                      </div>
                    </TableCell>
                    {gusto && (
                      <TableCell className="align-top">
                        <div className="flex flex-col gap-1">
                          <Input
                            aria-label={t("workers.titleLabel", { name })}
                            value={value.title}
                            disabled={!canEdit || saving === w.id}
                            aria-invalid={problem?.field === "title" ? true : undefined}
                            onChange={(e) => setTyped((m) => new Map(m).set(w.id, { ...value, title: e.target.value }))}
                            onBlur={() => void save(w)}
                            onKeyDown={onKey(w)}
                            className="w-64"
                          />
                          {problem?.field === "title" && !("by" in problem) && <FieldProblem problem={problem} id={`title-${w.id}-problem`} />}
                        </div>
                      </TableCell>
                    )}
                    <TableCell className="align-top">
                      <Badge variant={isSet(w.id) ? "secondary" : "outline"} data-testid="id-status">
                        {t(isSet(w.id) ? "workers.set" : "workers.missing")}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

/** The format whose name names the system. */
function systemFormat(system: PayrollSystem) {
  return ({ gusto: "gusto_hours_csv", qbd: "qbd_iif", qbo: "qbo_time_csv", adp_wfn: "adp_wfn_paydata", adp_run: "adp_run_csv", spreadsheet: "spreadsheet_csv" } as const)[system];
}
