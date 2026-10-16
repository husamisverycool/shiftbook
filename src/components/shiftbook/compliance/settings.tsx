"use client";

// Pattern: docs/patterns/settings/compliance.md — Vanta document renewal settings (renewal from the
// file's effective date; Due soon, then Overdue) and documents (a new version; the old one in History).
import { PlusIcon, UploadIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { addPolicyAction, addRegistrationAction, setMaStatementAction, type ComplianceActionResult } from "@/app/[locale]/(app)/compliance/actions";
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
    <div className="mx-auto flex w-full max-w-5xl min-w-0 flex-col gap-8 px-4 py-6">
      <header className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">{t("settings")}</p>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
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
          <p className="rounded-lg border py-8 text-center text-sm text-muted-foreground">{t("registrations.none")}</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
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
          <p className="rounded-lg border py-8 text-center text-sm text-muted-foreground">{t("policy.none")}</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
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
                    <TableCell className="font-medium whitespace-normal">{p.carrier}</TableCell>
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
  const { pending, save } = useSave();
  return (
    <div className="flex flex-col gap-2 rounded-lg border p-4" data-testid="ma-statement">
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
  const [v, setV] = useState({ carrier: "", policyNumber: "", states: "", startsOn: today, endsOn: "", auditDueOn: "" });
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
              form.set("data", JSON.stringify({ carrier: v.carrier, policyNumber: v.policyNumber, states, startsOn: v.startsOn, endsOn: v.endsOn, auditDueOn: v.auditDueOn || null }));
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
