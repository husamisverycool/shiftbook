"use client";

// Pattern: docs/patterns/workers/[id].md — the Profile tab: Personal, Social Security number (with
// Toast's Retrieve SSN: a business reason, then the number, and everyone who viewed or changed it),
// Payroll numbers; each section with its own Edit (Toast, Square).
import { EyeIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { revealSsnAction, setPayrollNumberAction, setSsnAction, updatePersonalAction } from "@/app/[locale]/(app)/workers/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { useRouter } from "@/i18n/navigation";
import type { PayrollSystem, SettingProblem } from "@/exports/targets";
import type { WorkerProfile } from "@/server/workers/queries";
import { useCan } from "../abilities";
import { useConfirmed } from "../auth/confirm-access";
import { FieldProblem } from "../settings/payroll-settings";
import { FieldError, useWorkerFailure } from "./results";
import { EditButtons, Facts, Section, useEscapeCancels } from "./worker-profile";
import { useDateTime } from "../agency-zone";

const SYSTEMS: PayrollSystem[] = ["gusto", "qbd", "qbo", "adp_wfn", "adp_run", "spreadsheet"];

export function PersonalSection({ profile, mayChange }: { profile: WorkerProfile; mayChange: boolean }) {
  const t = useTranslations("workers");
  const id = useId();
  const router = useRouter();
  const failure = useWorkerFailure();
  const [editing, setEditing] = useState(false);
  const [firstName, setFirstName] = useState(profile.firstName);
  const [lastName, setLastName] = useState(profile.lastName);
  const [language, setLanguage] = useState(profile.preferredLanguage);
  const [field, setField] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const cancel = useCallback(() => {
    setEditing(false);
    setField(null);
  }, []);
  useEscapeCancels(editing, cancel);
  const open = () => {
    setFirstName(profile.firstName);
    setLastName(profile.lastName);
    setLanguage(profile.preferredLanguage);
    setEditing(true);
  };
  const invalid = (name: string) => (field === name ? { "aria-invalid": true, "aria-describedby": `${id}-${name}-error` } : {});
  const save = () =>
    start(async () => {
      const r = await updatePersonalAction(profile.id, { firstName, lastName, preferredLanguage: language });
      if (r.ok) {
        toast.success(t("profile.saved"));
        cancel();
        router.refresh();
      } else if (r.error === "invalid" && "field" in r) setField(r.field);
      else failure(r);
    });

  return (
    <Section title={t("profile.personal.title")} testId="personal" onEdit={mayChange ? open : undefined} editing={editing}>
      {editing ? (
        <form
          className="flex flex-col gap-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${id}-first`}>{t("profile.personal.firstName")}</Label>
              <Input id={`${id}-first`} value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="off" autoFocus maxLength={100} {...invalid("firstName")} data-testid="personal-first-name" />
              {field === "firstName" && <FieldError id={`${id}-firstName-error`} text={t("fields.firstName")} />}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${id}-last`}>{t("profile.personal.lastName")}</Label>
              <Input id={`${id}-last`} value={lastName} onChange={(e) => setLastName(e.target.value)} autoComplete="off" maxLength={100} {...invalid("lastName")} data-testid="personal-last-name" />
              {field === "lastName" && <FieldError id={`${id}-lastName-error`} text={t("fields.lastName")} />}
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:w-1/2 sm:pr-2">
            <Label htmlFor={`${id}-language`}>{t("profile.personal.language")}</Label>
            <NativeSelect className="w-full" id={`${id}-language`} value={language} onChange={(e) => setLanguage(e.target.value)} data-testid="personal-language">
              <NativeSelectOption value="en">{t("language.en")}</NativeSelectOption>
              <NativeSelectOption value="es">{t("language.es")}</NativeSelectOption>
            </NativeSelect>
          </div>
          <EditButtons pending={pending} onCancel={cancel} testId="personal" />
        </form>
      ) : (
        <Facts
          rows={[
            [t("profile.personal.firstName"), profile.firstName],
            [t("profile.personal.lastName"), profile.lastName],
            [t("profile.personal.language"), t(`language.${profile.preferredLanguage === "es" ? "es" : "en"}`)],
          ]}
        />
      )}
    </Section>
  );
}

export function SsnSection({ profile, mayChange }: { profile: WorkerProfile; mayChange: boolean }) {
  const t = useTranslations("workers.profile.ssn");
  const id = useId();
  const router = useRouter();
  const failure = useWorkerFailure();
  const confirmed = useConfirmed();
  const mayReveal = useCan()("revealSsn");
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [pending, start] = useTransition();
  const cancel = useCallback(() => {
    setEditing(false);
    setValue("");
    setProblem(null);
  }, []);
  useEscapeCancels(editing, cancel);
  const save = () =>
    start(async () => {
      const r = await confirmed(() => setSsnAction(profile.id, value));
      if (!r) return;
      if (r.ok) {
        toast.success(t("saved"));
        cancel();
        router.refresh();
      } else if (r.error === "invalid" && "field" in r) setProblem(t(`rules.${r.rule ?? "format"}`));
      else if (r.error === "duplicate" && "by" in r) setProblem(t("duplicate", { name: r.by ?? "" }));
      else failure(r);
    });

  return (
    <Section
      title={t("title")}
      testId="ssn"
      onEdit={mayChange ? () => setEditing(true) : undefined}
      editing={editing}
      actions={
        mayReveal && profile.ssn.last4 && !editing ? (
          <Button size="sm" variant="outline" onClick={() => setRevealing(true)} data-testid="retrieve-ssn">
            <EyeIcon />
            {t("retrieve")}
          </Button>
        ) : null
      }
    >
      {editing ? (
        <form
          className="flex flex-col gap-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <div className="flex flex-col gap-2 sm:w-1/2 sm:pr-2">
            {/* The section's heading says what it is; the label is for screen readers. */}
            <Label htmlFor={`${id}-ssn`} className="sr-only">
              {t("label")}
            </Label>
            <Input
              id={`${id}-ssn`}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              inputMode="numeric"
              autoComplete="off"
              spellCheck={false}
              maxLength={11}
              autoFocus
              className="font-mono tracking-wider"
              aria-invalid={problem ? true : undefined}
              aria-describedby={problem ? `${id}-ssn-error` : `${id}-ssn-hint`}
              data-testid="ssn-input"
            />
            {problem ? (
              <FieldError id={`${id}-ssn-error`} text={problem} />
            ) : (
              <p id={`${id}-ssn-hint`} className="text-sm text-muted-foreground">
                {t("hint")}
              </p>
            )}
          </div>
          <EditButtons pending={pending} onCancel={cancel} testId="ssn" />
        </form>
      ) : (
        <p className={profile.ssn.last4 ? "font-mono text-sm tracking-wider" : "text-sm text-muted-foreground"} data-testid="ssn-masked">
          {profile.ssn.last4 ? t("masked", { last4: profile.ssn.last4 }) : t("notOnFile")}
        </p>
      )}
      {revealing && <RevealDialog profile={profile} onClose={() => setRevealing(false)} />}
    </Section>
  );
}

/**
 * Toast's Retrieve SSN: the business reason first, then Show; the number lives only in this dialog's
 * memory and goes when it closes. Everyone who viewed or changed the number is listed under it.
 */
function RevealDialog({ profile, onClose }: { profile: WorkerProfile; onClose: () => void }) {
  const t = useTranslations("workers.profile.reveal");
  const tc = useTranslations("common");
  const te = useTranslations("workers");
  const when = useDateTime();
  const id = useId();
  const router = useRouter();
  const failure = useWorkerFailure();
  const confirmed = useConfirmed();
  const [reason, setReason] = useState("");
  const [number, setNumber] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const show = () =>
    start(async () => {
      if (reason.trim() === "") {
        setProblem(te("errors.reason_required"));
        return;
      }
      const r = await confirmed(() => revealSsnAction(profile.id, reason));
      if (!r) return;
      if (r.ok && "ssn" in r) {
        setNumber(r.ssn);
        setProblem(null);
        // The list of who looked now holds this look.
        router.refresh();
      } else if (!r.ok && r.error === "reason_required") setProblem(te("errors.reason_required"));
      else if (!r.ok && r.error === "invalid" && "rule" in r && r.rule === "has_ssn") setProblem(te("fields.reasonSsn"));
      else if (!r.ok && r.error === "invalid") setProblem(te("fields.reason"));
      else failure(r);
    });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        {number ? (
          <div className="flex flex-col gap-1 rounded-md border bg-muted/40 p-4">
            <p className="text-xs text-muted-foreground">{t("number")}</p>
            <p className="font-mono text-xl tracking-widest" data-testid="ssn-revealed">
              {number}
            </p>
            <p className="text-xs text-muted-foreground">{t("hidden")}</p>
          </div>
        ) : (
          <form
            className="flex flex-col gap-2"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              show();
            }}
          >
            <Label htmlFor={`${id}-reason`}>{t("reason")}</Label>
            <Input id={`${id}-reason`} value={reason} onChange={(e) => setReason(e.target.value)} autoComplete="off" autoFocus maxLength={500} aria-invalid={problem ? true : undefined} aria-describedby={problem ? `${id}-reason-error` : `${id}-reason-hint`} data-testid="reveal-reason" />
            {problem ? (
              <FieldError id={`${id}-reason-error`} text={problem} />
            ) : (
              <p id={`${id}-reason-hint`} className="text-sm text-muted-foreground">
                {t("reasonHint")}
              </p>
            )}
            <div>
              <Button type="submit" disabled={pending} data-testid="reveal-show" loading={pending} loadingLabel={tc("loading")}>
                <EyeIcon />
                {t("show")}
              </Button>
            </div>
          </form>
        )}
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">{t("activity")}</h3>
          {profile.ssn.activity.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noActivity")}</p>
          ) : (
            <ul className="flex max-h-56 flex-col divide-y overflow-y-auto rounded-md border text-sm" data-testid="ssn-activity">
              {profile.ssn.activity.map((a, i) => (
                <li key={`${a.at}-${i}`} className="flex flex-col gap-0.5 px-3 py-2">
                  <span className="flex flex-wrap justify-between gap-x-3">
                    <span className="font-medium">{a.kind === "opened" ? t("opened", { who: a.by, file: a.document ?? "" }) : t(a.kind, { who: a.by })}</span>
                    <span className="text-muted-foreground tabular-nums">{when(a.at)}</span>
                  </span>
                  {a.reason && <span className="text-muted-foreground">“{a.reason}”</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} data-testid="reveal-close">
            {t("close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type Typed = Record<PayrollSystem, { id: string; title: string }>;
type RowProblem = SettingProblem | { field: "id"; rule: "taken"; by: string; message: string };

export function PayrollSection({ profile, mayChange }: { profile: WorkerProfile; mayChange: boolean }) {
  const t = useTranslations("workers");
  const tp = useTranslations("settings.payroll.workers");
  const id = useId();
  const router = useRouter();
  const failure = useWorkerFailure();
  const stored = (): Typed => Object.fromEntries(SYSTEMS.map((s) => [s, { id: profile.payrollIds[s]?.id ?? "", title: profile.payrollIds[s]?.title ?? "" }])) as Typed;
  const [editing, setEditing] = useState(false);
  const [typed, setTyped] = useState<Typed>(stored);
  const [problems, setProblems] = useState<Partial<Record<PayrollSystem, RowProblem>>>({});
  const [pending, start] = useTransition();
  const cancel = useCallback(() => {
    setEditing(false);
    setProblems({});
  }, []);
  useEscapeCancels(editing, cancel);
  const open = () => {
    setTyped(stored());
    setEditing(true);
  };
  const set = (system: PayrollSystem, key: "id" | "title", value: string) => setTyped((v) => ({ ...v, [system]: { ...v[system], [key]: value } }));

  const save = () =>
    start(async () => {
      const before = stored();
      const next: typeof problems = {};
      let other = false;
      for (const s of SYSTEMS) {
        const now = typed[s];
        if (now.id.trim() === before[s].id && (s !== "gusto" || now.title.trim() === before[s].title)) continue;
        const r = await setPayrollNumberAction(profile.id, s, now.id.trim(), s === "gusto" && now.id.trim() !== "" ? now.title.trim() : undefined);
        if (r.ok) continue;
        if (r.error === "invalid" && "problems" in r) next[s] = r.problems[0] as SettingProblem;
        else if (r.error === "taken" && "by" in r) next[s] = { field: "id", rule: "taken", by: r.by ?? "", message: "" };
        else {
          other = true;
          failure(r);
          break;
        }
      }
      setProblems(next);
      router.refresh();
      if (Object.keys(next).length === 0 && !other) {
        toast.success(t("profile.saved"));
        setEditing(false);
      }
    });

  const problemText = (s: PayrollSystem, field: "id" | "title") => {
    const p = problems[s];
    if (!p || p.field !== field) return null;
    return p.rule === "taken" && "by" in p ? <FieldError id={`${id}-${s}-${field}-error`} text={t("profile.payroll.taken", { name: p.by })} /> : <FieldProblem problem={p as SettingProblem} id={`${id}-${s}-${field}-error`} />;
  };
  const invalid = (s: PayrollSystem, field: "id" | "title") => (problems[s]?.field === field ? { "aria-invalid": true, "aria-describedby": `${id}-${s}-${field}-error` } : {});
  const systemName = (s: PayrollSystem) => (
    <>
      {t(`systems.${s}`)}
      {profile.system === s && (
        <Badge variant="secondary" className="h-5">
          {t("profile.payroll.inUse")}
        </Badge>
      )}
    </>
  );

  return (
    <Section title={t("profile.payroll.title")} testId="payroll" onEdit={mayChange ? open : undefined} editing={editing}>
      {profile.system === null && <p className="text-sm text-muted-foreground">{t("profile.payroll.noSystem")}</p>}
      {editing ? (
        <form
          className="flex flex-col gap-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            {SYSTEMS.map((s) => (
              <div key={s} className="flex flex-col gap-2">
                <Label htmlFor={`${id}-${s}`} className="min-h-5">
                  {systemName(s)}
                </Label>
                <Input id={`${id}-${s}`} value={typed[s].id} onChange={(e) => set(s, "id", e.target.value)} autoComplete="off" maxLength={500} placeholder={tp(`idNames.${s}`)} {...invalid(s, "id")} data-testid={`payroll-${s}`} />
                {problemText(s, "id")}
                {s === "gusto" && (
                  <>
                    <Label htmlFor={`${id}-gusto-title`} className="text-muted-foreground">
                      {t("profile.payroll.titleLabel")}
                    </Label>
                    <Input id={`${id}-gusto-title`} value={typed.gusto.title} onChange={(e) => set("gusto", "title", e.target.value)} autoComplete="off" maxLength={500} {...invalid("gusto", "title")} data-testid="payroll-gusto-title" />
                    {problemText("gusto", "title")}
                  </>
                )}
              </div>
            ))}
          </div>
          <EditButtons pending={pending} onCancel={cancel} testId="payroll" />
        </form>
      ) : (
        <Facts
          rows={SYSTEMS.map((s) => {
            const v = profile.payrollIds[s];
            return [
              t(`systems.${s}`),
              <span key={s} className="flex flex-wrap items-center gap-2" data-testid={`payroll-value-${s}`}>
                {v ? (
                  <span className="tabular-nums">
                    {v.id}
                    {v.title ? <span className="text-muted-foreground"> · {v.title}</span> : null}
                  </span>
                ) : (
                  <span className="text-muted-foreground">{t("profile.payroll.notSet")}</span>
                )}
                {profile.system === s && <Badge variant="secondary">{t("profile.payroll.inUse")}</Badge>}
              </span>,
            ];
          })}
        />
      )}
    </Section>
  );
}
