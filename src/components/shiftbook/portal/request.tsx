"use client";

// Pattern: docs/patterns/portal/[token]/request.md — Instawork's booking wizard (what, where, when,
// then a review), one step at a time with the app's numbered steps; TempWorks's order requests listed
// under it with their status.
import { UserPlusIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { staffRequestAction } from "@/app/[locale]/(portal)/portal/[token]/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import type { StaffRequestSummary } from "@/server/portal/service";
import { EmptyState } from "../empty-state";
import { clock, parseClock, shortDate } from "../format";
import { Section, Steps } from "../page";
import { Status, type Tone } from "../status";

const STEPS = ["position", "site", "schedule", "review"] as const;
type Step = (typeof STEPS)[number];
const STEP_FIELDS: Record<Step, string[]> = { position: ["position", "headcount"], site: ["worksite"], schedule: ["startsOn", "endsOn", "shift", "notes"], review: [] };
const TONES: Record<StaffRequestSummary["status"], Tone> = { pending: "info", accepted: "success", declined: "neutral" };
const OTHER = "other";

interface Form {
  position: string;
  headcount: string;
  site: string;
  siteNote: string;
  startsOn: string;
  endsOn: string;
  shiftStart: string;
  shiftEnd: string;
  notes: string;
}

const EMPTY: Form = { position: "", headcount: "1", site: "", siteNote: "", startsOn: "", endsOn: "", shiftStart: "", shiftEnd: "", notes: "" };

/** The fields a step shows that are wrong now (the server checks again on sending). */
function problems(f: Form, step: Step, today: string): string[] {
  const out: string[] = [];
  const check = (s: Step) => step === "review" || step === s;
  if (check("position")) {
    if (!f.position.trim() || f.position.length > 200) out.push("position");
    const n = Number(f.headcount);
    if (!Number.isInteger(n) || n < 1 || n > 500) out.push("headcount");
  }
  if (check("site") && (!f.site || (f.site === OTHER && !f.siteNote.trim()))) out.push("worksite");
  if (check("schedule")) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.startsOn) || f.startsOn < today) out.push("startsOn");
    if (f.endsOn && f.endsOn < f.startsOn) out.push("endsOn");
    const a = parseClock(f.shiftStart);
    const b = parseClock(f.shiftEnd);
    if (a === null || b === null || a === b) out.push("shift");
    if (f.notes.length > 2000) out.push("notes");
  }
  return out;
}

export function PortalRequestView({ token, requests, worksites, agencyName, today }: { token: string; requests: StaffRequestSummary[]; worksites: { id: string; name: string }[]; agencyName: string; today: string }) {
  const t = useTranslations("clientPortal.request");
  const te = useTranslations("clientPortal.errors");
  const locale = useLocale();
  const router = useRouter();
  const [step, setStep] = useState<Step>("position");
  const [form, setForm] = useState<Form>({ ...EMPTY, site: worksites.length === 1 ? worksites[0]!.id : "" });
  const [shown, setShown] = useState<string[]>([]);
  const [pending, start] = useTransition();
  const set = (k: keyof Form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const at = STEPS.indexOf(step);
  const err = (field: string) => (shown.includes(field) ? t(`fields.${field}`) : null);
  const go = (to: Step) => {
    if (STEPS.indexOf(to) > at) {
      const wrong = problems(form, step, today);
      setShown(wrong);
      if (wrong.length > 0) return;
    }
    setShown([]);
    setStep(to);
  };
  const siteName = form.site === OTHER ? form.siteNote : (worksites.find((w) => w.id === form.site)?.name ?? "");
  const field = (id: string, label: string, control: React.ReactNode, error: string | null, hint?: string) => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {control}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-[13px] text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-[13px] text-destructive">
          {error}
        </p>
      )}
    </div>
  );
  const send = () => {
    const wrong = problems(form, "review", today);
    if (wrong.length > 0) {
      setShown(wrong);
      setStep(STEPS.find((s) => STEP_FIELDS[s].some((f) => wrong.includes(f))) ?? "position");
      return;
    }
    start(async () => {
      const r = await staffRequestAction(token, {
        position: form.position.trim(),
        worksiteId: form.site === OTHER ? null : form.site,
        worksiteNote: form.site === OTHER ? form.siteNote.trim() : "",
        startsOn: form.startsOn,
        endsOn: form.endsOn || null,
        shiftStartMinute: parseClock(form.shiftStart)!,
        shiftEndMinute: parseClock(form.shiftEnd) === 0 ? 1440 : parseClock(form.shiftEnd)!,
        headcount: Number(form.headcount),
        notes: form.notes.trim(),
      });
      if (r.ok) {
        toast.success(t("sent", { agency: agencyName }));
        setForm({ ...EMPTY, site: worksites.length === 1 ? worksites[0]!.id : "" });
        setStep("position");
        router.refresh();
      } else if (r.error === "invalid" && r.fields) {
        setShown(r.fields);
        setStep(STEPS.find((s) => STEP_FIELDS[s].some((f) => r.fields!.includes(f))) ?? "position");
      } else toast.error(te.has(r.error) ? te(r.error) : te("generic"));
    });
  };
  const described = (id: string) => (err(id) ? `${id}-error` : undefined);
  return (
    <>
      <h1 className="text-[28px] leading-9 font-bold tracking-tight">{t("title")}</h1>
      <div className="flex max-w-2xl flex-col gap-6" data-testid="portal-request">
        <Steps steps={STEPS.map((s) => ({ key: s, label: t(`steps.${s}`) }))} current={step} label={t("stepsLabel")} />
        <p className="sr-only" aria-live="polite">
          {t("stepOf", { n: at + 1, total: STEPS.length })}
        </p>
        {step === "position" && (
          <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
            {field("req-position", t("position"), <Input id="req-position" value={form.position} onChange={set("position")} maxLength={200} aria-invalid={!!err("position")} aria-describedby={described("position") ?? "req-position-hint"} data-testid="req-position" />, err("position"), t("positionHint"))}
            {field("req-headcount", t("headcount"), <Input id="req-headcount" type="number" min={1} max={500} inputMode="numeric" value={form.headcount} onChange={set("headcount")} aria-invalid={!!err("headcount")} data-testid="req-headcount" />, err("headcount"))}
          </div>
        )}
        {step === "site" && (
          <fieldset className="flex flex-col gap-2" aria-describedby={described("worksite")}>
            <legend className="mb-2 text-sm font-medium">{t("worksite")}</legend>
            {[...worksites.map((w) => ({ id: w.id, name: w.name })), { id: OTHER, name: t("otherSite") }].map((w) => (
              <label key={w.id} className={cn("flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors hover:bg-muted/50 has-checked:border-foreground has-focus-visible:ring-2 has-focus-visible:ring-ring/50")}>
                <input type="radio" name="req-site" value={w.id} checked={form.site === w.id} onChange={set("site")} className="accent-foreground outline-none" data-testid={`req-site-${w.id === OTHER ? "other" : "known"}`} />
                {w.name}
              </label>
            ))}
            {form.site === OTHER && field("req-site-note", t("siteNote"), <Input id="req-site-note" value={form.siteNote} onChange={set("siteNote")} maxLength={300} aria-invalid={!!err("worksite")} data-testid="req-site-note" />, null)}
            {err("worksite") && (
              <p id="worksite-error" className="text-[13px] text-destructive">
                {err("worksite")}
              </p>
            )}
          </fieldset>
        )}
        {step === "schedule" && (
          <div className="grid gap-4 sm:grid-cols-2">
            {field("req-starts", t("startsOn"), <Input id="req-starts" type="date" min={today} value={form.startsOn} onChange={set("startsOn")} aria-invalid={!!err("startsOn")} data-testid="req-starts" />, err("startsOn"))}
            {field("req-ends", t("endsOn"), <Input id="req-ends" type="date" min={form.startsOn || today} value={form.endsOn} onChange={set("endsOn")} aria-invalid={!!err("endsOn")} data-testid="req-ends" />, err("endsOn"))}
            {field("req-shift-start", t("shiftStart"), <Input id="req-shift-start" type="time" value={form.shiftStart} onChange={set("shiftStart")} aria-invalid={!!err("shift")} data-testid="req-shift-start" />, err("shift"))}
            {field("req-shift-end", t("shiftEnd"), <Input id="req-shift-end" type="time" value={form.shiftEnd} onChange={set("shiftEnd")} aria-invalid={!!err("shift")} data-testid="req-shift-end" />, null)}
            <div className="sm:col-span-2">{field("req-notes", t("notes"), <Textarea id="req-notes" value={form.notes} onChange={set("notes")} maxLength={2000} rows={3} aria-invalid={!!err("notes")} data-testid="req-notes" />, err("notes"), t("notesHint"))}</div>
          </div>
        )}
        {step === "review" && (
          <dl className="grid gap-4 text-sm sm:grid-cols-2" data-testid="req-review">
            {[
              [t("position"), form.position, "position"],
              [t("headcount"), t("workers", { count: Number(form.headcount) }), "position"],
              [t("worksite"), siteName, "site"],
              [t("startsOn"), shortDate(form.startsOn, locale) + (form.endsOn ? ` – ${shortDate(form.endsOn, locale)}` : ""), "schedule"],
              [t("steps.schedule"), t("shift", { start: clock(parseClock(form.shiftStart), locale), end: clock(parseClock(form.shiftEnd), locale) }), "schedule"],
              ...(form.notes.trim() ? [[t("notes"), form.notes, "schedule"]] : []),
            ].map(([label, value, s]) => (
              <div key={label} className="grid gap-0.5">
                <dt className="flex items-center gap-2 text-[13px] text-muted-foreground">{label}</dt>
                <dd className="break-words whitespace-pre-wrap">
                  {value}{" "}
                  <button type="button" onClick={() => go(s as Step)} className="ml-1 rounded-sm text-[13px] text-muted-foreground underline underline-offset-4 outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50">
                    {t("back")}
                  </button>
                </dd>
              </div>
            ))}
          </dl>
        )}
        <div className="flex items-center gap-2">
          {at > 0 && (
            <Button variant="outline" onClick={() => go(STEPS[at - 1]!)} disabled={pending}>
              {t("back")}
            </Button>
          )}
          {step !== "review" ? (
            <Button onClick={() => go(STEPS[at + 1]!)} data-testid="req-next">
              {t("next")}
            </Button>
          ) : (
            <Button onClick={send} loading={pending} loadingLabel={t("submit")} data-testid="req-submit">
              {t("submit")}
            </Button>
          )}
        </div>
      </div>
      <Section id="portal-your-requests" title={t("yours")} accessory={requests.length > 0 ? requests.length : undefined} className="mt-4">
        {requests.length === 0 ? (
          <EmptyState icon={UserPlusIcon} title={t("none")} description={t("noneBody", { agency: agencyName })} className="min-h-0 py-8" />
        ) : (
          <ul className="flex flex-col divide-y" data-testid="portal-requests">
            {requests.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3 text-sm" data-testid="portal-request-row">
                <span className="font-medium">{r.position}</span>
                <span className="text-muted-foreground">
                  {shortDate(r.startsOn, locale)} · {t("workers", { count: r.headcount })}
                </span>
                <Status tone={TONES[r.status]} className="ml-auto">
                  {t(`status.${r.status}`, { agency: agencyName })}
                </Status>
                {r.status === "declined" && r.declineReason && <p className="w-full text-muted-foreground">{t("reason", { reason: r.declineReason })}</p>}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}
