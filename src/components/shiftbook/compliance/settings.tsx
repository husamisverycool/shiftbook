"use client";

// Pattern: docs/patterns/settings/compliance.md — Vanta document renewal settings (renewal from the
// file's effective date; Due soon, then Overdue) and documents (a new version; the old one in History).
import { PlusIcon, UploadIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { addPolicyAction, addRegistrationAction, setAcaSettingsAction, setMaContactAction, setMaStatementAction, setOpenDaysAction, type ComplianceActionResult } from "@/app/[locale]/(app)/compliance/actions";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link, useRouter } from "@/i18n/navigation";
import type { ComplianceSettings as View } from "@/server/compliance/queries";
import { longDate } from "../format";
import { StatusBadge } from "./status-badge";

function useSave() {
  const t = useTranslations("complianceSettings");
  const te = useTranslations("compliance.errors");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [field, setField] = useState<string | null>(null);
  const save = (fn: () => Promise<ComplianceActionResult>, done: () => void) =>
    start(async () => {
      const r = await fn();
      if (r.ok) {
        toast.success(t("saved"));
        setField(null);
        done();
        router.refresh();
      } else if (r.error === "invalid") {
        setField("field" in r && r.field ? r.field : "form");
        if ("field" in r && r.field && te.has(`fields.${r.field}`)) toast.error(te(`fields.${r.field}` as "fields.reason"));
        else toast.error(te("generic"));
      } else toast.error(te(r.error));
    });
  return { pending, save, field };
}

export function ComplianceSettingsView({ view, today, canChange }: { view: View; today: string; canChange: boolean }) {
  const t = useTranslations("complianceSettings");
  const locale = useLocale();
  const [adding, setAdding] = useState<"registration" | "policy" | null>(null);
  const date = (d: string | null) => (d ? longDate(d, locale) : "—");
  const changed = (c: { at: Date | string; by: string } | null) =>
    c ? <p className="text-xs text-muted-foreground">{t("changed", { date: new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(c.at)), by: c.by })}</p> : null;
  const duty = (r: { id: string; status: Parameters<typeof StatusBadge>[0]["status"]; dueOn: string } | null) =>
    r ? (
      <Link href={`/compliance/${r.id}`} className="flex w-fit flex-col items-start gap-0.5 underline-offset-4 hover:underline">
        <StatusBadge status={r.status} />
        <span className="text-xs whitespace-nowrap">{date(r.dueOn)}</span>
      </Link>
    ) : (
      t("noRenewal")
    );
  const file = (id: string | null, name: string | null) =>
    id && name ? (
      <a href={`/api/files/compliance/${id}`} download className="underline underline-offset-4">
        {name}
      </a>
    ) : (
      "—"
    );
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
        <p className="text-sm text-muted-foreground">{t("settings")}</p>
        <h1 className="text-[28px] leading-9 font-bold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
        {!canChange && <p className="text-sm text-muted-foreground">{t("readOnly")}</p>}
      </header>

      {section(
        "registrations-title",
        t("registrations.title"),
        t("registrations.intro"),
        canChange && (
          <Button size="sm" variant="outline" onClick={() => setAdding("registration")} data-testid="add-registration">
            <PlusIcon />
            {t("registrations.add")}
          </Button>
        ),
        view.registrations.length === 0 ? (
          <p className="rounded-xl border border-dashed py-8 text-center text-sm text-muted-foreground">{t("registrations.none")}</p>
        ) : (
          <div className="min-w-0">
            <Table aria-labelledby="registrations-title">
              <TableHeader>
                <TableRow>
                  <TableHead>{t("registrations.cols.state")}</TableHead>
                  <TableHead>{t("registrations.cols.for")}</TableHead>
                  <TableHead>{t("registrations.cols.number")}</TableHead>
                  <TableHead>{t("registrations.cols.issued")}</TableHead>
                  <TableHead>{t("registrations.cols.expires")}</TableHead>
                  <TableHead>{t("registrations.cols.certificate")}</TableHead>
                  <TableHead>{t("registrations.cols.renewal")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {view.registrations.map((r) => (
                  <TableRow key={r.id} data-testid="registration-row" className={r.replaced ? "text-muted-foreground" : undefined}>
                    <TableCell>{r.jurisdiction}</TableCell>
                    <TableCell>{r.branchName ?? t("registrations.agency")}</TableCell>
                    <TableCell className="font-medium">
                      {r.number} {r.replaced && <Badge variant="outline">{t("registrations.replaced")}</Badge>}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{date(r.issuedOn)}</TableCell>
                    <TableCell className="whitespace-nowrap">{date(r.expiresOn)}</TableCell>
                    <TableCell>{file(r.documentId, r.documentName)}</TableCell>
                    <TableCell>{duty(r.renewal)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ),
        changed(view.changed.registrations),
      )}

      {section(
        "policy-title",
        t("policy.title"),
        t("policy.intro"),
        canChange && (
          <Button size="sm" variant="outline" onClick={() => setAdding("policy")} data-testid="add-policy">
            <PlusIcon />
            {t("policy.add")}
          </Button>
        ),
        view.policies.length === 0 ? (
          <p className="rounded-xl border border-dashed py-8 text-center text-sm text-muted-foreground">{t("policy.none")}</p>
        ) : (
          <div className="min-w-0">
            <Table aria-labelledby="policy-title">
              <TableHeader>
                <TableRow>
                  <TableHead>{t("policy.cols.carrier")}</TableHead>
                  <TableHead>{t("policy.cols.number")}</TableHead>
                  <TableHead>{t("policy.cols.states")}</TableHead>
                  <TableHead>{t("policy.cols.starts")}</TableHead>
                  <TableHead>{t("policy.cols.ends")}</TableHead>
                  <TableHead>{t("policy.cols.file")}</TableHead>
                  <TableHead>{t("policy.cols.renewal")}</TableHead>
                  <TableHead>{t("policy.cols.audit")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {view.policies.map((p) => (
                  <TableRow key={p.id} data-testid="policy-row">
                    <TableCell className="whitespace-normal">
                      <span className="font-medium">{p.carrier}</span>
                      {p.carrierContact && <span className="block text-xs whitespace-pre-line text-muted-foreground">{p.carrierContact}</span>}
                    </TableCell>
                    <TableCell>{p.policyNumber}</TableCell>
                    <TableCell>{p.states.join(", ")}</TableCell>
                    <TableCell className="whitespace-nowrap">{date(p.startsOn)}</TableCell>
                    <TableCell className="whitespace-nowrap">{date(p.endsOn)}</TableCell>
                    <TableCell>{file(p.documentId, p.documentName)}</TableCell>
                    <TableCell>{duty(p.renewal)}</TableCell>
                    <TableCell>{duty(p.audit)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ),
        changed(view.changed.policies),
      )}

      {section("statement-title", t("statement.title"), t("statement.intro"), null, <Statement view={view} canChange={canChange} />, null)}

      {section("open-days-title", t("openDays.title"), t("openDays.intro"), null, <OpenDays view={view} canChange={canChange} />, changed(view.changed.openDays))}

      {section("aca-title", t("aca.title"), t("aca.intro"), null, <AcaSettings view={view} canChange={canChange} />, changed(view.changed.aca))}

      {adding === "registration" && <RegistrationDialog view={view} today={today} onClose={() => setAdding(null)} />}
      {adding === "policy" && <PolicyDialog today={today} onClose={() => setAdding(null)} />}
    </div>
  );
}

function Statement({ view, canChange }: { view: View; canChange: boolean }) {
  const t = useTranslations("complianceSettings.statement");
  const locale = useLocale();
  const [file, setFile] = useState<File | null>(null);
  const [key, setKey] = useState(0);
  const [contact, setContact] = useState(view.contact ?? "");
  const { pending, save } = useSave();
  return (
    <div className="flex flex-col gap-2 rounded-xl border bg-card p-4" data-testid="ma-statement">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ma-contact">{t("contact")}</Label>
        {canChange ? (
          <>
            <Textarea id="ma-contact" value={contact} maxLength={500} rows={3} onChange={(e) => setContact(e.target.value)} data-testid="ma-contact" />
            <p className="text-xs text-muted-foreground">{t("contactHint")}</p>
            <Button size="sm" variant="outline" className="w-fit" disabled={pending || contact.trim() === "" || contact === (view.contact ?? "")} onClick={() => save(() => setMaContactAction(contact), () => undefined)} data-testid="save-ma-contact">
              {t("saveContact")}
            </Button>
          </>
        ) : (
          <p className="text-sm whitespace-pre-line">{view.contact ?? t("noContact")}</p>
        )}
      </div>
      <p className="text-sm">
        {view.statement ? (
          t.rich("current", {
            name: view.statement.filename,
            file: (chunks) => (
              <a href={`/api/files/compliance/${view.statement!.id}`} download className="underline underline-offset-4">
                {chunks}
              </a>
            ),
            date: new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(view.statement.at)),
            by: view.statement.by,
          })
        ) : (
          <span className="text-muted-foreground">{t("none")}</span>
        )}
      </p>
      {canChange && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!file) return;
            const form = new FormData();
            form.set("data", "{}");
            form.set("file", file);
            save(
              () => setMaStatementAction(form),
              () => {
                setFile(null);
                setKey((k) => k + 1);
              },
            );
          }}
        >
          <div className="flex flex-col gap-1">
            <Label htmlFor="statement-file" className="text-xs text-muted-foreground">
              {t("file")}
            </Label>
            <Input key={key} id="statement-file" type="file" accept=".pdf" className="w-72" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
          <Button type="submit" size="sm" variant="outline" disabled={pending || !file} data-testid="upload-statement">
            <UploadIcon />
            {t("upload")}
          </Button>
        </form>
      )}
    </div>
  );
}

function Field({ id, label, invalid, children }: { id: string; label: string; invalid?: boolean; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5" data-invalid={invalid ? true : undefined}>
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

function RegistrationDialog({ view, today, onClose }: { view: View; today: string; onClose: () => void }) {
  const t = useTranslations("complianceSettings.registrations");
  const tc = useTranslations("compliance");
  const [v, setV] = useState({ jurisdiction: "IL", branchId: "", number: "", issuedOn: today, expiresOn: "" });
  const [file, setFile] = useState<File | null>(null);
  const { pending, save, field } = useSave();
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("addTitle")}</DialogTitle>
          <DialogDescription>{t("addBody")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="reg-state" label={t("fields.jurisdiction")}>
            <NativeSelect id="reg-state" className="w-full" value={v.jurisdiction} onChange={(e) => setV({ ...v, jurisdiction: e.target.value })} data-testid="reg-state">
              {(["IL", "MA", "NJ"] as const).map((s) => (
                <NativeSelectOption key={s} value={s}>
                  {tc(`states.${s}`)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field id="reg-branch" label={t("fields.branchId")}>
            <NativeSelect id="reg-branch" className="w-full" value={v.branchId} onChange={(e) => setV({ ...v, branchId: e.target.value })}>
              <NativeSelectOption value="">{t("agency")}</NativeSelectOption>
              {view.branches.map((b) => (
                <NativeSelectOption key={b.id} value={b.id}>
                  {b.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field id="reg-number" label={t("fields.number")} invalid={field === "number"}>
            <Input id="reg-number" value={v.number} maxLength={60} aria-invalid={field === "number" ? true : undefined} onChange={(e) => setV({ ...v, number: e.target.value })} data-testid="reg-number" />
          </Field>
          <Field id="reg-issued" label={t("fields.issuedOn")}>
            <Input id="reg-issued" type="date" value={v.issuedOn} onChange={(e) => setV({ ...v, issuedOn: e.target.value })} />
          </Field>
          <Field id="reg-expires" label={t("fields.expiresOn")} invalid={field === "expiresOn"}>
            <Input id="reg-expires" type="date" value={v.expiresOn} min={v.issuedOn || undefined} aria-invalid={field === "expiresOn" ? true : undefined} onChange={(e) => setV({ ...v, expiresOn: e.target.value })} data-testid="reg-expires" />
          </Field>
          <Field id="reg-file" label={t("fields.file")}>
            <Input id="reg-file" type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {tc("detail.cancel")}
          </Button>
          <Button
            disabled={pending || v.number.trim() === "" || v.expiresOn === ""}
            onClick={() => {
              const form = new FormData();
              form.set("data", JSON.stringify({ jurisdiction: v.jurisdiction, branchId: v.branchId || null, number: v.number, issuedOn: v.issuedOn || null, expiresOn: v.expiresOn }));
              if (file) form.set("file", file);
              save(() => addRegistrationAction(form), onClose);
            }}
            data-testid="save-registration"
          >
            {tc("detail.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PolicyDialog({ today, onClose }: { today: string; onClose: () => void }) {
  const t = useTranslations("complianceSettings.policy");
  const tc = useTranslations("compliance");
  const [v, setV] = useState({ carrier: "", carrierContact: "", policyNumber: "", states: "", startsOn: today, endsOn: "", auditDueOn: "" });
  const [file, setFile] = useState<File | null>(null);
  const { pending, save, field } = useSave();
  const input = (key: keyof typeof v, type = "text") => (
    <Input id={`policy-${key}`} type={type} value={v[key]} aria-invalid={field === key ? true : undefined} onChange={(e) => setV({ ...v, [key]: e.target.value })} data-testid={`policy-${key}`} />
  );
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("addTitle")}</DialogTitle>
          <DialogDescription>{t("addBody")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="policy-carrier" label={t("fields.carrier")}>
            {input("carrier")}
          </Field>
          <Field id="policy-policyNumber" label={t("fields.policyNumber")}>
            {input("policyNumber")}
          </Field>
          <div className="sm:col-span-2">
            <Field id="policy-carrierContact" label={t("fields.carrierContact")}>
              <Textarea id="policy-carrierContact" rows={2} maxLength={500} value={v.carrierContact} aria-invalid={field === "carrierContact" ? true : undefined} onChange={(e) => setV({ ...v, carrierContact: e.target.value })} data-testid="policy-carrierContact" />
            </Field>
          </div>
          <Field id="policy-states" label={t("fields.states")}>
            {input("states")}
          </Field>
          <Field id="policy-startsOn" label={t("fields.startsOn")}>
            {input("startsOn", "date")}
          </Field>
          <Field id="policy-endsOn" label={t("fields.endsOn")}>
            {input("endsOn", "date")}
          </Field>
          <Field id="policy-auditDueOn" label={t("fields.auditDueOn")}>
            {input("auditDueOn", "date")}
          </Field>
          <Field id="policy-file" label={t("fields.file")}>
            <Input id="policy-file" type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {tc("detail.cancel")}
          </Button>
          <Button
            disabled={pending || v.carrier.trim() === "" || v.policyNumber.trim() === "" || v.endsOn === ""}
            onClick={() => {
              const form = new FormData();
              const states = v.states
                .split(/[,\s]+/)
                .map((s) => s.trim().toUpperCase())
                .filter(Boolean);
              form.set("data", JSON.stringify({ carrier: v.carrier, carrierContact: v.carrierContact.trim() || null, policyNumber: v.policyNumber, states, startsOn: v.startsOn, endsOn: v.endsOn, auditDueOn: v.auditDueOn || null }));
              if (file) form.set("file", file);
              save(() => addPolicyAction(form), onClose);
            }}
            data-testid="save-policy"
          >
            {tc("detail.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The days the agency is open (Jira's standard working days): the weekend ones count as I-9 business days. */
function OpenDays({ view, canChange }: { view: View; canChange: boolean }) {
  const t = useTranslations("complianceSettings.openDays");
  const [days, setDays] = useState<number[]>(view.openDays.filter((d) => d === 0 || d === 6));
  const { pending, save } = useSave();
  const same = [0, 6].every((d) => days.includes(d) === view.openDays.includes(d));
  // Monday first, Sunday last, as a US work week reads.
  const order = [1, 2, 3, 4, 5, 6, 0];
  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4" data-testid="open-days">
      <fieldset className="flex flex-wrap gap-x-5 gap-y-2">
        <legend className="mb-2 text-sm font-medium">{t("legend")}</legend>
        {order.map((d) => {
          const weekend = d === 0 || d === 6;
          return (
            <div key={d} className="flex items-center gap-2">
              <Checkbox
                id={`open-day-${d}`}
                checked={weekend ? days.includes(d) : true}
                disabled={!weekend || !canChange}
                onCheckedChange={(on) => setDays(on === true ? [...days, d] : days.filter((x) => x !== d))}
                data-testid={`open-day-${d}`}
              />
              <Label htmlFor={`open-day-${d}`}>{t(`days.${d}` as "days.1")}</Label>
            </div>
          );
        })}
      </fieldset>
      <p className="text-xs text-muted-foreground">{t("hint")}</p>
      {canChange && (
        <Button size="sm" variant="outline" className="w-fit" disabled={pending || same} onClick={() => save(() => setOpenDaysAction(days), () => undefined)} data-testid="save-open-days">
          {t("save")}
        </Button>
      )}
    </div>
  );
}

/** The ACA look-back's periods (26 C.F.R. § 54.4980H-3(d)), checked against the dated limits; from today. */
function AcaSettings({ view, canChange }: { view: View; canChange: boolean }) {
  const t = useTranslations("complianceSettings.aca");
  const locale = useLocale();
  const { pending, save, field } = useSave();
  const current = view.aca.settings;
  const limits = view.aca.limits;
  const [v, setV] = useState({ measurementMonths: String(current?.measurementMonths ?? 12), firstMonth: String(current?.firstMonth ?? 1), adminDays: String(current?.adminDays ?? 0), stabilityMonths: String(current?.stabilityMonths ?? 12) });
  if (!limits) return <p className="text-sm text-muted-foreground">{t("noRule")}</p>;
  const n = (x: string) => (/^\d{1,3}$/.test(x.trim()) ? Number(x.trim()) : NaN);
  const value = { measurementMonths: n(v.measurementMonths), firstMonth: n(v.firstMonth), adminDays: n(v.adminDays), stabilityMonths: n(v.stabilityMonths) };
  const same = current !== null && (Object.keys(value) as (keyof typeof value)[]).every((k) => value[k] === current[k]);
  const ready = Object.values(value).every((x) => Number.isInteger(x));
  const month = (m: number) => new Intl.DateTimeFormat(locale, { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2000, m - 1, 1)));
  const months = Array.from({ length: limits.maxMeasurementMonths - limits.minMeasurementMonths + 1 }, (_, i) => limits.minMeasurementMonths + i);
  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4" data-testid="aca-settings-form">
      {!current && <p className="text-sm text-muted-foreground" data-testid="aca-settings-none">{t("none")}</p>}
      <div className="grid gap-3 sm:grid-cols-4">
        <Field id="aca-months" label={t("measurementMonths")} invalid={field === "measurementMonths"}>
          <NativeSelect id="aca-months" className="w-full" disabled={!canChange} value={v.measurementMonths} onChange={(e) => setV({ ...v, measurementMonths: e.target.value })} data-testid="aca-months">
            {months.map((m) => (
              <NativeSelectOption key={m} value={String(m)}>
                {t("monthsOption", { months: m })}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field id="aca-first" label={t("firstMonth")} invalid={field === "firstMonth"}>
          <NativeSelect id="aca-first" className="w-full" disabled={!canChange} value={v.firstMonth} onChange={(e) => setV({ ...v, firstMonth: e.target.value })} data-testid="aca-first">
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <NativeSelectOption key={m} value={String(m)}>
                {month(m)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field id="aca-admin" label={t("adminDays")} invalid={field === "adminDays"}>
          <Input id="aca-admin" inputMode="numeric" disabled={!canChange} value={v.adminDays} aria-invalid={field === "adminDays" ? true : undefined} onChange={(e) => setV({ ...v, adminDays: e.target.value })} data-testid="aca-admin" />
        </Field>
        <Field id="aca-stability" label={t("stabilityMonths")} invalid={field === "stabilityMonths"}>
          <Input id="aca-stability" inputMode="numeric" disabled={!canChange} value={v.stabilityMonths} aria-invalid={field === "stabilityMonths" ? true : undefined} onChange={(e) => setV({ ...v, stabilityMonths: e.target.value })} data-testid="aca-stability" />
        </Field>
      </div>
      <p className="text-xs text-muted-foreground">{t("limits", { minMonths: limits.minMeasurementMonths, maxMonths: limits.maxMeasurementMonths, admin: limits.maxAdminDays, stability: limits.minStabilityMonths, weeks: limits.breakWeeks })}</p>
      <p className="text-xs text-muted-foreground">{t("newWorkers")}</p>
      {current && view.aca.from && <p className="text-xs text-muted-foreground">{t("inForce", { date: longDate(view.aca.from, locale) })}</p>}
      <div className="flex flex-wrap items-center gap-3">
        {canChange && (
          <Button size="sm" variant="outline" className="w-fit" disabled={pending || !ready || same} onClick={() => save(() => setAcaSettingsAction(value), () => undefined)} data-testid="save-aca">
            {t("save")}
          </Button>
        )}
        <Link href="/compliance/aca" className="text-sm underline underline-offset-4">
          {t("open")}
        </Link>
      </div>
    </div>
  );
}
