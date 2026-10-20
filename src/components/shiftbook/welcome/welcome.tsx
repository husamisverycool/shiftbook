"use client";

// Pattern: docs/patterns/welcome.md — three one-question screens (Gusto) under a three-part progress bar
// (Mercury), each with Continue and Skip for now (Linear): where the agency is, its payroll system, its
// team. Saves through Settings' own actions, so every rule and refusal is theirs.
import { ArrowLeftIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useId, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { saveAgencyAction, setWorkweekAction } from "@/app/[locale]/(app)/settings/agency/actions";
import { inviteAction } from "@/app/[locale]/(app)/settings/members/actions";
import { saveTargetAction } from "@/app/[locale]/(app)/settings/payroll/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import type { ExportFormat, PayrollTarget } from "@/exports/targets";
import { useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { ConfirmAccessProvider, useConfirmed } from "../auth/confirm-access";

export interface WelcomeAgency {
  name: string;
  addressLines: string[];
  phone: string | null;
  email: string | null;
  timeZone: string | null;
  workweekStartsOn: number | null;
  workweekChangeable: boolean;
}

type Choice = ExportFormat | "other";
/** The systems in the order agencies most often run them; each with the one detail its file needs. */
const SYSTEMS: { key: Choice; detail?: "companyCode" | "clientId" | "customer" | "version" }[] = [
  { key: "gusto_hours_csv" },
  { key: "adp_wfn_paydata", detail: "companyCode" },
  { key: "adp_run_csv", detail: "companyCode" },
  { key: "paychex_flex_csv", detail: "clientId" },
  { key: "qbo_time_csv", detail: "customer" },
  { key: "qbd_iif", detail: "version" },
  { key: "paylocity_time_csv" },
  { key: "other" },
];
const ROLES = ["coordinator", "billing", "accountant", "recruiter"] as const;
const STEPS = 3;

function guessZone(zones: string[]): string {
  try {
    const here = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (zones.includes(here)) return here;
  } catch {}
  return "";
}

function Shell({ step, title, line, onBack, children }: { step: number; title: string; line: string; onBack?: () => void; children: ReactNode }) {
  const t = useTranslations("welcome");
  return (
    <>
      <div className="flex flex-col gap-2">
        <div className="flex h-5 items-center justify-between text-xs text-muted-foreground">
          {onBack ? (
            <button type="button" onClick={onBack} className="inline-flex items-center gap-1 rounded-sm outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50" data-testid="welcome-back">
              <ArrowLeftIcon aria-hidden className="size-3.5" />
              {t("back")}
            </button>
          ) : (
            <span />
          )}
          <span data-testid="welcome-progress">{t("progress", { step, total: STEPS })}</span>
        </div>
        <div className="grid grid-cols-3 gap-1.5" aria-hidden>
          {Array.from({ length: STEPS }, (_, i) => (
            <span key={i} className={cn("h-1 rounded-full", i < step ? "bg-primary" : "bg-border")} />
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-balance text-muted-foreground">{line}</p>
      </div>
      {children}
    </>
  );
}

function Actions({ pending, onSkip, submitLabel }: { pending: boolean; onSkip: () => void; submitLabel: string }) {
  const t = useTranslations("welcome");
  return (
    <div className="flex flex-col gap-2">
      <Button type="submit" className="h-10 w-full" loading={pending} loadingLabel={t("saving")} data-testid="welcome-continue">
        {submitLabel}
      </Button>
      <Button type="button" variant="ghost" className="w-full" disabled={pending} onClick={onSkip} data-testid="welcome-skip">
        {t("skip")}
      </Button>
    </div>
  );
}

function Field({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string | null; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

/** Step 1: where the agency is — Settings › Agency's details and time zone, and the pay week. */
function AgencyStep({ agency, zones, onDone, onSkip }: { agency: WelcomeAgency; zones: string[]; onDone: () => void; onSkip: () => void }) {
  const t = useTranslations("welcome.agency");
  const ta = useTranslations("agencySetup");
  const id = useId();
  const [street, setStreet] = useState(agency.addressLines[0] ?? "");
  const [city, setCity] = useState(agency.addressLines.slice(1).join(", "));
  const [phone, setPhone] = useState(agency.phone ?? "");
  const [zone, setZone] = useState(agency.timeZone ?? guessZone(zones));
  const [week, setWeek] = useState(String(agency.workweekStartsOn ?? 1));
  const [problems, setProblems] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    start(async () => {
      setError(null);
      const addressLines = [street.trim(), city.trim()].filter(Boolean);
      const r = await saveAgencyAction({ name: agency.name, addressLines, phone: phone.trim() || null, email: agency.email, timeZone: zone });
      if (!r.ok) {
        if (r.error === "invalid") return setProblems(Object.fromEntries(r.problems.map((p) => [p.field, ta(`rules.${p.rule as "required"}`)])));
        return setError(ta("generic"));
      }
      setProblems({});
      if (agency.workweekChangeable && Number(week) !== agency.workweekStartsOn) {
        const w = await setWorkweekAction(Number(week));
        if (!w.ok && w.error !== "in_use") return setError(ta("generic"));
      }
      onDone();
    });
  };
  return (
    <Shell step={1} title={t("title")} line={t("line")}>
      <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
        <Field id={`${id}-street`} label={t("street")} error={problems.addressLines}>
          <Input id={`${id}-street`} className="bg-background" value={street} onChange={(e) => setStreet(e.target.value)} autoComplete="address-line1" autoFocus maxLength={200} data-testid="welcome-street" />
        </Field>
        <Field id={`${id}-city`} label={t("city")}>
          <Input id={`${id}-city`} className="bg-background" value={city} onChange={(e) => setCity(e.target.value)} autoComplete="address-line2" placeholder={t("cityPlaceholder")} maxLength={200} data-testid="welcome-city" />
        </Field>
        <Field id={`${id}-phone`} label={t("phone")} error={problems.phone}>
          <Input id={`${id}-phone`} className="bg-background" value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" autoComplete="tel" maxLength={25} data-testid="welcome-phone" />
        </Field>
        <Field id={`${id}-zone`} label={ta("field.timeZone")} error={problems.timeZone}>
          <NativeSelect id={`${id}-zone`} className="w-full bg-background" value={zone} onChange={(e) => setZone(e.target.value)} data-testid="welcome-zone">
            <option value="" disabled>
              {ta("chooseZone")}
            </option>
            {zones.map((z) => (
              <option key={z} value={z}>
                {ta(`zones.${z.replace("/", "_") as "America_Chicago"}`)}
              </option>
            ))}
          </NativeSelect>
        </Field>
        {agency.workweekChangeable && (
          <Field id={`${id}-week`} label={ta("payWeek.label")} hint={t("weekHint")}>
            <NativeSelect id={`${id}-week`} className="w-full bg-background" value={week} onChange={(e) => setWeek(e.target.value)} data-testid="welcome-week">
              {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                <option key={d} value={d}>
                  {ta(`payWeek.days.d${d as 1}`)}
                </option>
              ))}
            </NativeSelect>
          </Field>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Actions pending={pending} onSkip={onSkip} submitLabel={t("continue")} />
      </form>
    </Shell>
  );
}

/** Step 2: the payroll system — Settings › Payroll file's target, when its one detail is given. */
function PayrollStep({ target, targetId, onDone, onSkip, onBack }: { target: PayrollTarget | null; targetId: string | null; onDone: () => void; onSkip: () => void; onBack: () => void }) {
  const t = useTranslations("welcome.payroll");
  const systems = useTranslations("connections.systems");
  const id = useId();
  const [choice, setChoice] = useState<Choice | null>(target?.format === "spreadsheet_csv" ? "other" : (target?.format ?? null));
  const initial = target as Partial<Record<string, string>> | null;
  const [detail, setDetail] = useState(initial?.companyCode ?? initial?.clientId ?? initial?.customer ?? "");
  const [version, setVersion] = useState<"2022_or_later" | "2021_or_earlier">(initial?.version === "2021_or_earlier" ? "2021_or_earlier" : "2022_or_later");
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const chosen = SYSTEMS.find((s) => s.key === choice);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!choice) return setProblem(t("choose"));
    // Nothing Tabulado can save from here: the guide's payroll step finishes it in Settings.
    if (choice === "other" || (choice === "qbd_iif" && version === "2021_or_earlier")) return onDone();
    const value =
      chosen?.detail === "companyCode" ? { format: choice, companyCode: detail.trim().toUpperCase() } : chosen?.detail === "clientId" ? { format: choice, clientId: detail.trim() } : chosen?.detail === "customer" ? { format: choice, customer: detail.trim() } : chosen?.detail === "version" ? { format: choice, version } : { format: choice };
    start(async () => {
      const r = await saveTargetAction(value, targetId).catch(() => ({ ok: false as const, error: "generic" as const }));
      if (r.ok) return onDone();
      setProblem(r.error === "invalid" ? t(`detailRules.${chosen?.detail ?? "companyCode"}${choice === "adp_run_csv" ? "Run" : ""}` as "detailRules.companyCode") : t("generic"));
    });
  };
  return (
    <Shell step={2} title={t("title")} line={t("line")} onBack={onBack}>
      <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
        <fieldset className="flex flex-col gap-2" aria-describedby={problem ? `${id}-problem` : undefined}>
          <legend className="sr-only">{t("title")}</legend>
          {SYSTEMS.map((s) => {
            const on = choice === s.key;
            return (
              <label key={s.key} className={cn("flex cursor-pointer flex-col gap-3 rounded-lg border bg-background px-4 py-3 outline-none motion-state has-focus-visible:ring-2 has-focus-visible:ring-ring/50", on ? "border-primary" : "hover:border-foreground/20")} data-testid={`welcome-system-${s.key}`}>
                <span className="flex items-center gap-3">
                  <input
                    type="radio"
                    name={`${id}-system`}
                    value={s.key}
                    checked={on}
                    onChange={() => {
                      setChoice(s.key);
                      setProblem(null);
                    }}
                    className="size-4 accent-primary"
                  />
                  <span className="flex flex-col">
                    <span className="text-sm font-medium">{s.key === "other" ? t("other") : systems(s.key)}</span>
                    <span className="text-xs text-muted-foreground">{t(`lines.${s.key}`)}</span>
                  </span>
                </span>
                {on && s.detail && s.detail !== "version" && (
                  <span className="flex flex-col gap-1.5 pl-7">
                    <span className="text-xs font-medium" id={`${id}-detail-label`}>
                      {t(`details.${s.detail}${s.key === "adp_run_csv" ? "Run" : ""}` as "details.companyCode")}
                    </span>
                    <Input aria-labelledby={`${id}-detail-label`} className="h-8" value={detail} onChange={(e) => setDetail(e.target.value)} maxLength={100} autoFocus data-testid="welcome-system-detail" />
                  </span>
                )}
                {on && s.detail === "version" && (
                  <NativeSelect aria-label={t("details.version")} className="ml-7 w-[calc(100%-1.75rem)]" value={version} onChange={(e) => setVersion(e.target.value as "2022_or_later")} data-testid="welcome-system-version">
                    <option value="2022_or_later">{t("versions.later")}</option>
                    <option value="2021_or_earlier">{t("versions.earlier")}</option>
                  </NativeSelect>
                )}
              </label>
            );
          })}
        </fieldset>
        {problem && (
          <p id={`${id}-problem`} role="alert" className="text-sm text-destructive" data-testid="welcome-payroll-problem">
            {problem}
          </p>
        )}
        <Actions pending={pending} onSkip={onSkip} submitLabel={t("continue")} />
      </form>
    </Shell>
  );
}

/** Step 3: the team — Settings › Members' invite (it asks "confirm it's you" when due). */
function TeamStep({ onDone, onBack }: { onDone: () => void; onBack: () => void }) {
  const t = useTranslations("welcome.team");
  const roles = useTranslations("roles");
  const confirmed = useConfirmed();
  const id = useId();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<(typeof ROLES)[number]>("coordinator");
  const [sent, setSent] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const locale = useLocale() === "es" ? "es" : "en";
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() && !email.trim() && sent.length > 0) return onDone();
    start(async () => {
      setError(null);
      const r = await confirmed(() => inviteAction({ name: name.trim(), email: email.trim(), role, locale }));
      if (!r) return;
      if (!r.ok) return setError(t(`errors.${r.error === "invalid_email" || r.error === "invalid_name" || r.error === "email_taken" ? r.error : "generic"}`));
      setSent((list) => [...list, email.trim()]);
      setName("");
      setEmail("");
    });
  };
  return (
    <Shell step={3} title={t("title")} line={t("line")} onBack={onBack}>
      {sent.length > 0 && (
        <ul className="flex flex-col gap-1 rounded-lg border bg-background px-4 py-3 text-sm" data-testid="welcome-invited">
          {sent.map((s) => (
            <li key={s}>{t("sent", { email: s })}</li>
          ))}
        </ul>
      )}
      <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
        <Field id={`${id}-name`} label={t("name")}>
          <Input id={`${id}-name`} className="bg-background" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" maxLength={120} autoFocus data-testid="welcome-invite-name" />
        </Field>
        <Field id={`${id}-email`} label={t("email")}>
          <Input id={`${id}-email`} className="bg-background" value={email} onChange={(e) => setEmail(e.target.value)} type="email" inputMode="email" autoComplete="off" data-testid="welcome-invite-email" />
        </Field>
        <Field id={`${id}-role`} label={t("role")} hint={roles(`${role}.line`)}>
          <NativeSelect id={`${id}-role`} className="w-full bg-background" value={role} onChange={(e) => setRole(e.target.value as "coordinator")} data-testid="welcome-invite-role">
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {roles(`${r}.name`)}
              </option>
            ))}
          </NativeSelect>
        </Field>
        {error && (
          <p role="alert" className="text-sm text-destructive" data-testid="welcome-invite-error">
            {error}
          </p>
        )}
        <div className="flex flex-col gap-2">
          <Button type="submit" className="h-10 w-full" loading={pending} loadingLabel={t("sending")} data-testid="welcome-invite-send">
            {sent.length > 0 ? t("sendAnother") : t("send")}
          </Button>
          <Button type="button" variant="ghost" className="w-full" disabled={pending} onClick={onDone} data-testid="welcome-finish">
            {sent.length > 0 ? t("finish") : t("skip")}
          </Button>
        </div>
      </form>
    </Shell>
  );
}

export function WelcomeView({ agency, zones, target, targetId }: { agency: WelcomeAgency; zones: string[]; target: PayrollTarget | null; targetId: string | null }) {
  const router = useRouter();
  const [step, setStepNow] = useState(1);
  // Each saved answer redraws the page's data (Settings' rows have new ids), the step kept.
  const setStep = (n: number) => {
    setStepNow(n);
    router.refresh();
  };
  const [leaving, leave] = useTransition();
  const home = () =>
    leave(() => {
      router.replace("/");
      router.refresh();
    });
  if (leaving) return null;
  return (
    <ConfirmAccessProvider method="code">
      {step === 1 && <AgencyStep agency={agency} zones={zones} onDone={() => setStep(2)} onSkip={() => setStep(2)} />}
      {step === 2 && <PayrollStep target={target} targetId={targetId} onDone={() => setStep(3)} onSkip={() => setStep(3)} onBack={() => setStep(1)} />}
      {step === 3 && <TeamStep onDone={home} onBack={() => setStep(2)} />}
    </ConfirmAccessProvider>
  );
}
