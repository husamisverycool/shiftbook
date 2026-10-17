"use client";

// Pattern: docs/patterns/clients/[id].md — Stripe customer details (a Details section with Edit
// opening an update dialog; the customer's invoices on its page); Bullhorn One Invoice Terms kept as
// dated versions; Avionté Billing Preferences sections (invoice, delivery, billing).
import { PencilIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { saveBillingAction } from "@/app/[locale]/(app)/clients/[id]/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { useRouter } from "@/i18n/navigation";
import type { BillingProblem, BillingSettings } from "@/server/catalog/billing";
import type { ClientDetail } from "@/server/clients/queries";
import type { ClientReceivables, PaymentClients } from "@/server/receivables/queries";
import { INVOICE_TEMPLATES, OT_BILLING_RULES, SEPARATE_BY, VMS_FORMATS } from "@/lib/invoice-options";
import { longDate } from "../format";
import { InvoicesTable } from "../invoices/invoices-table";
import { Crumbs, Page, PageHeader, RecordLayout, Section } from "../page";
import { ClientOwes } from "../receivables/client-owes";

type Profile = NonNullable<ClientDetail["current"]>;

const settingsOf = (p: Profile | null): BillingSettings => ({
  invoiceTemplate: p?.invoiceTemplate ?? "standard",
  separateBy: p?.separateBy ?? [],
  poRequired: p?.poRequired ?? false,
  poNumber: p?.poNumber ?? null,
  backupDetail: p?.backupDetail ?? false,
  backupImages: p?.backupImages ?? false,
  vmsFormat: p?.vmsFormat ?? null,
  paymentTermsDays: p?.paymentTermsDays ?? 30,
  overtimeBillingRule: p?.overtimeBillingRule ?? "multiplier",
  billPremiums: p?.billPremiums ?? true,
  billGuarantees: p?.billGuarantees ?? true,
});

export function ClientPage({ detail, mayChange, today, owes, clients, mayCollect }: { detail: ClientDetail; mayChange: boolean; today: string; owes: ClientReceivables; clients: PaymentClients; mayCollect: boolean }) {
  const t = useTranslations("clients");
  const ti = useTranslations("invoices");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [editing, setEditing] = useState(false);
  const p = detail.current;
  const yes = (on: boolean) => (on ? t("yes") : t("no"));
  // The record's identifying facts under its title (_components/record-page.md item 3): the bill-to its invoices carry.
  const facts = [detail.client.addressLines.join(", "), detail.client.billingEmail ?? ""].filter(Boolean);
  const group = (title: string, rows: [string, ReactNode][]) => (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold">{title}</h3>
      <dl className="grid gap-3 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="grid gap-0.5">
            <dt className="text-[13px] text-muted-foreground">{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );

  const settings = (
    <Section
      id="settings-title"
      title={t("settings")}
      testId="invoice-settings"
      actions={
        mayChange ? (
          <Button size="sm" variant="outline" onClick={() => setEditing(true)} data-testid="edit-settings">
            <PencilIcon />
            {t("edit")}
          </Button>
        ) : undefined
      }
    >
      {!mayChange && <p className="text-sm text-muted-foreground">{t("readOnly")}</p>}
      {p ? (
        <div className="flex flex-col gap-6 pt-1">
          <p className="text-sm" data-testid="in-effect">
            {p.effectiveTo ? t("inEffectBetween", { from: longDate(p.effectiveFrom, locale), to: longDate(p.effectiveTo, locale) }) : t("inEffectFrom", { from: longDate(p.effectiveFrom, locale) })}
          </p>
          {group(t("groups.invoice"), [
            [t("field.template"), ti(`template.${p.invoiceTemplate}`)],
            [t("field.separateBy"), p.separateBy.length === 0 ? t("notSeparated") : p.separateBy.map((x) => t(`separate.${x}`)).join(", ")],
            [t("field.poRequired"), yes(p.poRequired)],
            [t("field.poNumber"), p.poNumber ?? "—"],
          ])}
          {group(t("groups.backup"), [
            [t("field.backupDetail"), p.backupDetail ? t("included") : t("notIncluded")],
            [t("field.backupImages"), p.backupImages ? t("included") : t("notIncluded")],
          ])}
          {group(t("groups.delivery"), [[t("field.vmsFormat"), p.vmsFormat ? t(`vms.${p.vmsFormat}`) : t("vmsNone")]])}
          {group(t("groups.billing"), [
            [t("field.terms"), t("termsDays", { days: p.paymentTermsDays })],
            [t("field.otRule"), t(`otRule.${p.overtimeBillingRule}`)],
            [t("field.billPremiums"), yes(p.billPremiums)],
            [t("field.billGuarantees"), yes(p.billGuarantees)],
          ])}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground" data-testid="no-settings">
          {t("noSettingsToday")}
        </p>
      )}
      {detail.versions.length > 0 && (
        <div className="flex flex-col gap-3 pt-3">
          <h3 className="text-sm font-semibold">{t("versions")}</h3>
          <ul className="flex flex-col gap-1.5 text-sm" data-testid="versions">
            {detail.versions.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center gap-2">
                <span className="tabular-nums">{v.effectiveTo ? t("versionBetween", { from: longDate(v.effectiveFrom, locale), to: longDate(v.effectiveTo, locale) }) : t("versionFrom", { from: longDate(v.effectiveFrom, locale) })}</span>
                {p?.id === v.id && <Badge variant="secondary">{t("current")}</Badge>}
                {v.effectiveFrom > today && <Badge variant="outline">{t("upcoming")}</Badge>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Section>
  );

  return (
    <Page>
      <PageHeader
        context={<Crumbs label={tc("breadcrumb")} items={[{ label: t("title"), href: "/clients" }]} />}
        title={
          <>
            {detail.client.name} <span className="text-muted-foreground">· {detail.client.code}</span>
          </>
        }
        description={facts.length > 0 ? <span data-testid="client-facts">{facts.join(" · ")}</span> : undefined}
      />

      <RecordLayout aside={settings}>
        <ClientOwes clientId={detail.client.id} owes={owes} clients={clients} today={today} canChange={mayCollect} />

        <Section id="client-invoices-title" title={ti("title")} accessory={detail.invoices.length > 0 ? detail.invoices.length : undefined}>
          {detail.invoices.length === 0 ? <p className="text-sm text-muted-foreground">{t("noInvoices")}</p> : <InvoicesTable rows={detail.invoices} showClient={false} />}
        </Section>
      </RecordLayout>

      {editing && <EditSettings detail={detail} today={today} onClose={() => setEditing(false)} />}
    </Page>
  );
}

function EditSettings({ detail, today, onClose }: { detail: ClientDetail; today: string; onClose: () => void }) {
  const t = useTranslations("clients");
  const ti = useTranslations("invoices");
  const locale = useLocale();
  const router = useRouter();
  const [values, setValues] = useState<BillingSettings>(settingsOf(detail.current));
  const [poText, setPoText] = useState(detail.current?.poNumber ?? "");
  const [termsText, setTermsText] = useState(String(detail.current?.paymentTermsDays ?? 30));
  // The first day not yet invoiced, so the change reaches the week about to be invoiced; never
  // invoiced: the version in force (replaced on the same day, as nothing was invoiced with it).
  const [from, setFrom] = useState(detail.earliest ?? detail.current?.effectiveFrom ?? today);
  const [problems, setProblems] = useState<BillingProblem[]>([]);
  const [dateError, setDateError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof BillingSettings>(key: K, value: BillingSettings[K]) => setValues((v) => ({ ...v, [key]: value }));
  const problem = (field: BillingProblem["field"]) => problems.find((x) => x.field === field);
  const error = (field: BillingProblem["field"]) => {
    const pr = problem(field);
    return pr ? (
      <p id={`bill-${field}-error`} className="text-sm text-destructive" data-testid={`error-${field}`}>
        {t(`rules.${pr.rule}` as "rules.date")}
      </p>
    ) : null;
  };
  const invalid = (field: BillingProblem["field"]) => (problem(field) ? { "aria-invalid": true, "aria-describedby": `bill-${field}-error` } : {});
  const check = (key: "poRequired" | "backupDetail" | "backupImages" | "billPremiums" | "billGuarantees", label: string, hint?: string) => (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <Checkbox id={`bill-${key}`} checked={values[key]} onCheckedChange={(on) => set(key, on === true)} data-testid={`field-${key}`} />
        <Label htmlFor={`bill-${key}`}>{label}</Label>
      </div>
      {hint && <p className="pl-6 text-xs text-muted-foreground">{hint}</p>}
      {error(key)}
    </div>
  );

  const save = () =>
    start(async () => {
      const terms = /^\d{1,4}$/.test(termsText.trim()) ? Number(termsText.trim()) : NaN;
      const next: BillingSettings = { ...values, poNumber: poText.trim() === "" ? null : poText.trim(), paymentTermsDays: terms };
      const r = await saveBillingAction(detail.client.id, next, from);
      setDateError(null);
      if (r.ok) {
        toast.success(t("saved", { date: longDate(from, locale) }));
        onClose();
        router.refresh();
        return;
      }
      setProblems(r.error === "invalid" ? r.problems : []);
      if (r.error === "invoiced_through") setDateError(t("rules.invoiced_through", { date: longDate(r.through, locale) }));
      else if (r.error === "invalid") setDateError(r.problems.some((x) => x.field === "effectiveFrom") ? t("rules.date") : null);
      else toast.error(t(`errors.${r.error}`));
    });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("editTitle", { client: detail.client.name })}</DialogTitle>
          <DialogDescription>{t("editBody")}</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-2 text-sm font-semibold">{t("groups.invoice")}</legend>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bill-template">{t("field.template")}</Label>
              <NativeSelect id="bill-template" className="w-full" value={values.invoiceTemplate} onChange={(e) => set("invoiceTemplate", e.target.value as BillingSettings["invoiceTemplate"])} {...invalid("invoiceTemplate")} data-testid="field-template">
                {INVOICE_TEMPLATES.map((x) => (
                  <NativeSelectOption key={x} value={x}>
                    {ti(`template.${x}`)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <p className="text-xs text-muted-foreground">{t(`templateHint.${values.invoiceTemplate}`)}</p>
              {error("invoiceTemplate")}
            </div>
            <div className="flex flex-col gap-1.5" role="group" aria-labelledby="bill-separate-label">
              <span id="bill-separate-label" className="text-sm font-medium">
                {t("field.separateBy")}
              </span>
              <div className="flex flex-wrap gap-4">
                {SEPARATE_BY.map((x) => (
                  <div key={x} className="flex items-center gap-2">
                    <Checkbox id={`bill-separate-${x}`} checked={values.separateBy.includes(x)} onCheckedChange={(on) => set("separateBy", on ? [...values.separateBy.filter((y) => y !== x), x] : values.separateBy.filter((y) => y !== x))} data-testid={`field-separate-${x}`} />
                    <Label htmlFor={`bill-separate-${x}`}>{t(`separate.${x}`)}</Label>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">{t("separateHint")}</p>
              {error("separateBy")}
            </div>
            {check("poRequired", t("field.poRequired"), t("poRequiredHint"))}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bill-poNumber">{t("field.poNumber")}</Label>
              <Input id="bill-poNumber" value={poText} onChange={(e) => setPoText(e.target.value)} maxLength={64} {...invalid("poNumber")} data-testid="field-poNumber" />
              <p className="text-xs text-muted-foreground">{t("poNumberHint")}</p>
              {error("poNumber")}
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-3">
            <legend className="mb-2 text-sm font-semibold">{t("groups.backup")}</legend>
            {check("backupDetail", t("field.backupDetail"), t("backupDetailHint"))}
            {check("backupImages", t("field.backupImages"), t("backupImagesHint"))}
          </fieldset>

          <fieldset className="flex flex-col gap-3">
            <legend className="mb-2 text-sm font-semibold">{t("groups.delivery")}</legend>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bill-vms">{t("field.vmsFormat")}</Label>
              <NativeSelect id="bill-vms" className="w-full" value={values.vmsFormat ?? ""} onChange={(e) => set("vmsFormat", e.target.value === "" ? null : (e.target.value as BillingSettings["vmsFormat"]))} {...invalid("vmsFormat")} data-testid="field-vms">
                <NativeSelectOption value="">{t("vmsNone")}</NativeSelectOption>
                {VMS_FORMATS.map((x) => (
                  <NativeSelectOption key={x} value={x}>
                    {t(`vms.${x}`)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <p className="text-xs text-muted-foreground">{t("vmsHint")}</p>
              {error("vmsFormat")}
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-3">
            <legend className="mb-2 text-sm font-semibold">{t("groups.billing")}</legend>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bill-terms">{t("field.terms")}</Label>
              <Input id="bill-terms" className="w-32" inputMode="numeric" value={termsText} onChange={(e) => setTermsText(e.target.value)} {...invalid("paymentTermsDays")} data-testid="field-terms" />
              {error("paymentTermsDays")}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bill-ot">{t("field.otRule")}</Label>
              <NativeSelect id="bill-ot" className="w-full" value={values.overtimeBillingRule} onChange={(e) => set("overtimeBillingRule", e.target.value as BillingSettings["overtimeBillingRule"])} {...invalid("overtimeBillingRule")}>
                {OT_BILLING_RULES.map((x) => (
                  <NativeSelectOption key={x} value={x}>
                    {t(`otRule.${x}`)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              {error("overtimeBillingRule")}
            </div>
            {check("billPremiums", t("field.billPremiums"))}
            {check("billGuarantees", t("field.billGuarantees"))}
          </fieldset>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bill-from">{t("appliesFrom")}</Label>
            <Input id="bill-from" type="date" className="w-48" value={from} min={detail.earliest ?? undefined} onChange={(e) => setFrom(e.target.value)} aria-invalid={dateError ? true : undefined} aria-describedby={dateError ? "bill-from-error" : "bill-from-hint"} data-testid="field-from" />
            {dateError ? (
              <p id="bill-from-error" className="text-sm text-destructive" data-testid="error-effectiveFrom">
                {dateError}
              </p>
            ) : (
              <p id="bill-from-hint" className="text-xs text-muted-foreground">
                {detail.earliest ? t("appliesFromHintInvoiced", { date: longDate(detail.earliest, locale) }) : t("appliesFromHint")}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={pending} data-testid="save-settings">
              {t("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
