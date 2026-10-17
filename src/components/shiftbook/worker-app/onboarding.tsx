"use client";

// Pattern: docs/patterns/w/onboarding.md — Gusto's self-onboarding (one step at a time, Save and
// continue; forms signed by typing the full name and ticking the box) under Rippling's checklist (each
// step with its state; a done step can be reopened).
import { CheckIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useId, useState, useTransition, type ReactNode } from "react";
import { saveStepAction } from "@/app/[locale]/(worker)/w/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import type { OnboardingView } from "@/server/worker-app/service";

const STEPS = ["personal", "w4", "i9", "payment", "policies", "sign"] as const;
type Step = (typeof STEPS)[number];
const STATES = "AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA PR RI SC SD TN TX UT VT VA WA WV WI WY".split(" ");

export function Onboarding({ view }: { view: OnboardingView }) {
  const t = useTranslations("workerApp.onboarding");
  const locale = useLocale();
  const id = useId();
  // A policy changed since the worker acknowledged it: straight to the policies step (decision 0043).
  const [step, setStep] = useState<Step | "done">(view.policiesDue > 0 ? "policies" : view.progress.complete ? "done" : (view.progress.next ?? "personal"));
  const [values, setValues] = useState<Record<string, string>>(() => initial(view));
  const [errorField, setErrorField] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const done = (s: Step) => view.progress.steps[s] !== null;
  const set = (k: string, v: string) => setValues((x) => ({ ...x, [k]: v }));

  const save = () =>
    start(async () => {
      if (step === "done") return;
      const fields = step === "policies" ? view.policies.map((p) => `policy_${p.key}`) : FIELDS[step];
      const answers = Object.fromEntries(fields.map((f) => [f, values[f] ?? ""]));
      const r = await saveStepAction(locale, step, answers);
      if (!r.ok) {
        setErrorField(r.field);
        return;
      }
      setErrorField(null);
      setStep(r.next ?? "done");
      window.scrollTo({ top: 0 });
    });

  if (step === "done")
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center" data-testid="worker-onboarding-done">
        <span className="flex size-10 items-center justify-center rounded-full bg-foreground text-background">
          <CheckIcon className="size-5" aria-hidden />
        </span>
        <h1 className="text-2xl font-semibold tracking-tight">{t("allSet")}</h1>
        <p className="max-w-xs text-sm text-muted-foreground">{t("allSetBody")}</p>
        <Link href="/w" className={buttonVariants({ className: "mt-2" })}>
          {t("home")}
        </Link>
      </div>
    );

  const field = (name: string, label: string, input: ReactNode, hint?: string) => (
    <div className="flex flex-col gap-2">
      <Label htmlFor={`${id}-${name}`}>{label}</Label>
      {input}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {errorField === name && (
        <p role="alert" className="text-sm text-destructive" data-testid="onboarding-error">
          {t(`errors.${name}`)}
        </p>
      )}
    </div>
  );
  const text = (name: string, label: string, opts: { type?: string; autoComplete?: string; inputMode?: "numeric" | "text" | "email" | "decimal"; hint?: string; placeholder?: string } = {}) =>
    field(
      name,
      label,
      <Input id={`${id}-${name}`} type={opts.type ?? "text"} autoComplete={opts.autoComplete ?? "off"} inputMode={opts.inputMode} placeholder={opts.placeholder} value={values[name] ?? ""} onChange={(e) => set(name, e.target.value)} aria-invalid={errorField === name ? true : undefined} data-testid={`onboarding-${name}`} />,
      opts.hint,
    );
  const radios = (name: string, label: string, options: string[], ns: string) =>
    field(
      name,
      label,
      <div className="flex flex-col gap-2" role="radiogroup" id={`${id}-${name}`} aria-label={label}>
        {options.map((o) => (
          <label key={o} className={cn("flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors hover:bg-muted/60", values[name] === o && "border-foreground")}>
            <input type="radio" name={`${id}-${name}`} value={o} checked={values[name] === o} onChange={() => set(name, o)} className="size-4 accent-foreground" data-testid={`onboarding-${name}-${o}`} />
            {t(`${ns}.${o}`)}
          </label>
        ))}
      </div>,
    );
  const check = (name: string, label: string) => (
    <label className="flex items-start gap-3 text-sm">
      <Checkbox checked={values[name] === "on"} onCheckedChange={(c) => set(name, c ? "on" : "")} className="mt-0.5" data-testid={`onboarding-${name}`} />
      <span>{label}</span>
    </label>
  );
  const money = (name: string, label: string) => text(name, label, { inputMode: "decimal", placeholder: "0.00" });

  const body: Record<Step, ReactNode> = {
    personal: (
      <>
        {text("legalFirstName", t("personal.legalFirstName"), { autoComplete: "given-name" })}
        {text("legalLastName", t("personal.legalLastName"), { autoComplete: "family-name" })}
        {text("ssn", t("personal.ssn"), { inputMode: "numeric", hint: view.ssnLast4 ? `${t("personal.ssnHint")} ••• •• ${view.ssnLast4}` : t("personal.ssnHint") })}
        {text("birthDate", t("personal.birthDate"), { type: "date", autoComplete: "bday" })}
        {text("addressLine", t("personal.addressLine"), { autoComplete: "address-line1" })}
        {text("city", t("personal.city"), { autoComplete: "address-level2" })}
        {field(
          "state",
          t("personal.state"),
          <NativeSelect id={`${id}-state`} value={values.state ?? ""} onChange={(e) => set("state", e.target.value)} data-testid="onboarding-state">
            <option value="" />
            {STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </NativeSelect>,
        )}
        {text("zip", t("personal.zip"), { inputMode: "numeric", autoComplete: "postal-code" })}
        {text("email", t("personal.email"), { type: "email", inputMode: "email", autoComplete: "email" })}
      </>
    ),
    w4: (
      <>
        <p className="text-sm text-muted-foreground">{t("w4.intro")}</p>
        {radios("filingStatus", t("w4.filingStatus"), ["single", "married_jointly", "head_of_household"], "w4")}
        {check("multipleJobs", t("w4.multipleJobs"))}
        {money("dependents", t("w4.dependents"))}
        {money("otherIncome", t("w4.otherIncome"))}
        {money("deductions", t("w4.deductions"))}
        {money("extraWithholding", t("w4.extraWithholding"))}
        {check("exempt", t("w4.exempt"))}
      </>
    ),
    i9: (
      <>
        <p className="text-sm text-muted-foreground">{t("i9.intro")}</p>
        {radios("status", t("i9.status"), ["citizen", "noncitizen_national", "permanent_resident", "authorized_alien"], "i9")}
        {values.status === "permanent_resident" && text("uscisNumber", t("i9.uscisNumber"))}
        {values.status === "authorized_alien" && (
          <>
            {text("expiresOn", t("i9.expiresOn"), { type: "date" })}
            <p className="text-sm text-muted-foreground">{t("i9.oneOf")}</p>
            {text("uscisNumber", t("i9.uscisNumber"))}
            {text("i94Number", t("i9.i94Number"))}
            {text("passportNumber", t("i9.passportNumber"))}
            {text("passportCountry", t("i9.passportCountry"))}
          </>
        )}
      </>
    ),
    payment: (
      <>
        {radios("kind", t("payment.kind"), ["direct_deposit", "paper_check"], "payment")}
        {values.kind === "direct_deposit" && (
          <>
            {text("routing", t("payment.routing"), { inputMode: "numeric" })}
            {text("account", t("payment.account"), { inputMode: "numeric" })}
            {text("confirm", t("payment.confirm"), { inputMode: "numeric" })}
            {radios("accountType", t("payment.accountType"), ["checking", "savings"], "payment")}
          </>
        )}
      </>
    ),
    policies: (
      <>
        <p className="text-sm text-muted-foreground">{t("policies.intro")}</p>
        {view.policies.map((p) => (
          <div key={p.key} className="flex flex-col gap-2 rounded-lg border p-3" data-testid={`worker-policy-${p.key}`}>
            <p className="text-sm font-medium">
              {(locale === "es" && p.title.es) || p.title.en}
              {!p.required && <span className="font-normal text-muted-foreground"> · {t("policies.optional")}</span>}
            </p>
            <p className="text-sm whitespace-pre-line text-muted-foreground">{(locale === "es" && p.body.es) || p.body.en}</p>
            {check(`policy_${p.key}`, t("policies.read"))}
          </div>
        ))}
        {errorField === "policies" && (
          <p role="alert" className="text-sm text-destructive">
            {t("errors.policies")}
          </p>
        )}
      </>
    ),
    sign: (
      <>
        <p className="text-sm text-muted-foreground">{t("sign.intro")}</p>
        <dl className="grid grid-cols-1 gap-y-1 rounded-lg border p-3 text-sm">
          {view.personal && (
            <dd className="font-medium">
              {view.personal.legalFirstName} {view.personal.legalLastName}
            </dd>
          )}
          {view.ssnLast4 && <dd className="text-muted-foreground">{t("sign.ssn", { last4: view.ssnLast4 })}</dd>}
          {view.personal && (
            <dd className="text-muted-foreground">
              {view.personal.addressLine}, {view.personal.city}, {view.personal.state} {view.personal.zip}
            </dd>
          )}
          <dd className="text-muted-foreground">{view.paymentKind === "direct_deposit" ? t("sign.deposit", { last4: view.depositLast4 ?? "" }) : view.paymentKind === "paper_check" ? t("sign.check") : ""}</dd>
        </dl>
        {text("name", t("sign.name"), { autoComplete: "name" })}
        {check("agree", t("sign.agree"))}
        {(errorField === "agree" || errorField === "steps" || errorField === "signed") && (
          <p role="alert" className="text-sm text-destructive">
            {t(`errors.${errorField}`)}
          </p>
        )}
      </>
    ),
  };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
      <ol className="flex flex-col" aria-label={t("title")} data-testid="onboarding-checklist">
        {STEPS.map((s, n) => {
          const current = s === step;
          const isDone = done(s);
          return (
            <li key={s}>
              <button
                type="button"
                onClick={() => (isDone || current ? setStep(s) : undefined)}
                disabled={!isDone && !current}
                aria-current={current ? "step" : undefined}
                className={cn("flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 enabled:hover:bg-muted/60", current ? "font-semibold" : "text-muted-foreground")}
                data-testid={`onboarding-step-${s}`}
              >
                <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full border text-xs tabular-nums transition-colors motion-state", isDone ? "border-foreground bg-foreground text-background" : current ? "border-foreground text-foreground" : "")}>
                  {isDone ? <CheckIcon className="size-3.5" aria-hidden /> : n + 1}
                </span>
                <span className="flex-1">{t(`steps.${s}`)}</span>
                <span className="sr-only">{isDone ? t("done") : current ? t("current") : t("todo")}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <form
        className="flex flex-col gap-5 border-t pt-6"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        data-testid={`onboarding-form-${step}`}
      >
        <h2 className="text-lg font-semibold">{t(`steps.${step}`)}</h2>
        {body[step]}
        <Button type="submit" size="lg" className="h-11" disabled={pending} loading={pending} loadingLabel={t("saving")} data-testid="onboarding-save">
          {step === "sign" ? t("sign.submit") : t("save")}
        </Button>
      </form>
    </div>
  );
}

/** Which answers each step sends. */
const FIELDS: Record<Step, string[]> = {
  personal: ["legalFirstName", "legalLastName", "ssn", "birthDate", "addressLine", "city", "state", "zip", "email"],
  w4: ["filingStatus", "multipleJobs", "dependents", "otherIncome", "deductions", "extraWithholding", "exempt"],
  i9: ["status", "uscisNumber", "expiresOn", "i94Number", "passportNumber", "passportCountry"],
  payment: ["kind", "routing", "account", "confirm", "accountType"],
  policies: [],
  sign: ["name", "agree"],
};

/** Answers already given, back in the fields (never the SSN, the bank numbers or the I-9 numbers). */
function initial(view: OnboardingView): Record<string, string> {
  const cents = (c: number) => (c === 0 ? "" : `${Math.trunc(c / 100)}.${String(c % 100).padStart(2, "0")}`);
  const p = view.personal;
  const w = view.w4;
  return {
    ...(p ? { legalFirstName: p.legalFirstName, legalLastName: p.legalLastName, addressLine: p.addressLine, city: p.city, state: p.state, zip: p.zip, email: p.email ?? "" } : {}),
    ...(w ? { filingStatus: w.filingStatus, multipleJobs: w.multipleJobs ? "on" : "", dependents: cents(w.dependentsCents), otherIncome: cents(w.otherIncomeCents), deductions: cents(w.deductionsCents), extraWithholding: cents(w.extraWithholdingCents), exempt: w.exempt ? "on" : "" } : {}),
    ...(view.i9Status ? { status: view.i9Status } : {}),
    ...(view.paymentKind ? { kind: view.paymentKind, accountType: "checking" } : { accountType: "checking" }),
    ...Object.fromEntries(view.policies.filter((x) => x.at).map((x) => [`policy_${x.key}`, "on"])),
  };
}
