/**
 * The worker app's PDFs (slice t): a pay stub (docs/patterns/_documents/pay-stub.md) and the signed
 * onboarding forms as records of the answers (docs/patterns/_documents/onboarding-form.md). Made on
 * request, never stored; the SSN appears only as its last four.
 */
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { createElement, type ReactElement } from "react";
import { eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { formatRate } from "@shiftbook/rules";
import { dateRange, hoursMinutes, money } from "../../components/shiftbook/format";
import { OnboardingFormDocument, type OnboardingFormData } from "../../pdf/onboarding-form";
import { PayStubDocument } from "../../pdf/pay-stub";
import type { Tx } from "../db/client";
import * as s from "../db/schema";
import type { FormKind } from "./agency";
import { maskPhone } from "./phone";
import { formAnswers, payStubOf } from "./service";

const pdf = async (element: unknown) => new Uint8Array(await renderToBuffer(element as ReactElement<DocumentProps>));
const fileSafe = (text: string) => text.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");

export async function payStubPdf(tx: Tx, workerId: string, runId: string, locale: string): Promise<{ bytes: Uint8Array; filename: string } | null> {
  const stub = await payStubOf(tx, workerId, runId);
  if (!stub) return null;
  const t = await getTranslations({ locale, namespace: "workerApp.pay" });
  const tf = await getTranslations({ locale, namespace: "workerAppForms" });
  const te = await getTranslations({ locale, namespace: "invoice.earning" });
  const bytes = await pdf(
    createElement(PayStubDocument, {
      data: {
        labels: { title: tf("stub.title"), period: t("period"), worker: t("worker"), ssn: tf("ssn"), earnings: t("earnings"), description: t("description"), rate: t("rate"), hours: t("hours"), current: t("current"), ytd: t("ytd"), gross: t("gross"), note: tf("stub.note") },
        agency: { name: stub.agency.name, lines: stub.agency.addressLines },
        worker: stub.worker,
        period: dateRange(stub.startsOn, stub.endsOn, locale),
        lines: stub.lines.map((l) => ({ description: te(l.type), rate: formatRate(l.rate), hours: hoursMinutes(l.minutes), current: money(l.amountCents, locale) })),
        gross: money(stub.grossCents, locale),
        ytd: money(stub.ytdCents, locale),
      },
    }),
  );
  return { bytes, filename: `pay-stub-${stub.startsOn}-${fileSafe(stub.worker.name)}.pdf` };
}

const centsText = (c: number, locale: string) => money(c, locale);

/** A signed onboarding form as a PDF; null when the worker has not given those answers. */
export async function onboardingFormPdf(tx: Tx, workerId: string, kind: FormKind, locale: string): Promise<{ bytes: Uint8Array; filename: string } | null> {
  const opened = await formAnswers(tx, workerId);
  if (!opened) return null;
  const { row, birthDate, i9, deposit } = opened;
  const [w] = await tx.select({ firstName: s.workers.firstName, lastName: s.workers.lastName, ssnLast4: s.workers.ssnLast4, phone: s.workers.phone }).from(s.workers).where(eq(s.workers.id, workerId));
  if (!w) return null;
  const tf = await getTranslations({ locale, namespace: "workerAppForms" });
  const p = row.personal;
  const name = p ? `${p.legalFirstName} ${p.legalLastName}` : `${w.firstName} ${w.lastName}`;
  const yes = (v: boolean) => (v ? tf("yes") : tf("no"));
  const address = p ? `${p.addressLine}, ${p.city}, ${p.state} ${p.zip}` : "—";
  const signature = row.signedAt && row.signedName ? { label: tf("signedBy"), name: row.signedName, dateLabel: tf("signedOn"), date: new Intl.DateTimeFormat(locale, { dateStyle: "long", timeStyle: "short", timeZone: "UTC" }).format(row.signedAt) + " UTC", statement: tf("statement") } : null;
  let data: OnboardingFormData;
  if (kind === "w4") {
    if (!row.w4) return null;
    const x = row.w4;
    data = {
      title: tf("w4.title"),
      subtitle: tf("subtitle"),
      worker: { label: tf("worker"), name, ssnLabel: tf("ssn"), ssn: w.ssnLast4 ? `XXX-XX-${w.ssnLast4}` : null },
      rows: [
        { label: tf("w4.address"), value: address },
        { label: tf("w4.filingStatus"), value: tf(`w4.filing.${x.filingStatus}`) },
        { label: tf("w4.multipleJobs"), value: yes(x.multipleJobs) },
        { label: tf("w4.dependents"), value: centsText(x.dependentsCents, locale) },
        { label: tf("w4.otherIncome"), value: centsText(x.otherIncomeCents, locale) },
        { label: tf("w4.deductions"), value: centsText(x.deductionsCents, locale) },
        { label: tf("w4.extraWithholding"), value: centsText(x.extraWithholdingCents, locale) },
        { label: tf("w4.exempt"), value: yes(x.exempt) },
      ],
      signature,
    };
  } else if (kind === "i9") {
    if (!i9) return null;
    const rows = [
      { label: tf("i9.lastName"), value: p?.legalLastName ?? w.lastName },
      { label: tf("i9.firstName"), value: p?.legalFirstName ?? w.firstName },
      { label: tf("i9.address"), value: address },
      { label: tf("i9.birthDate"), value: birthDate ?? "—" },
      { label: tf("i9.email"), value: p?.email ?? "—" },
      { label: tf("i9.phone"), value: w.phone ? maskPhone(w.phone) : "—" },
      { label: tf("i9.attestation"), value: tf(`i9.status.${i9.status}`) },
    ];
    if (i9.uscisNumber) rows.push({ label: tf("i9.uscisNumber"), value: `A${i9.uscisNumber}` });
    if (i9.expiresOn) rows.push({ label: tf("i9.expiresOn"), value: i9.expiresOn });
    if (i9.i94Number) rows.push({ label: tf("i9.i94Number"), value: i9.i94Number });
    if (i9.passportNumber) rows.push({ label: tf("i9.passport"), value: `${i9.passportNumber}, ${i9.passportCountry ?? ""}` });
    data = { title: tf("i9.title"), subtitle: tf("subtitle"), worker: { label: tf("worker"), name, ssnLabel: tf("ssn"), ssn: w.ssnLast4 ? `XXX-XX-${w.ssnLast4}` : null }, rows, signature };
  } else {
    if (!deposit || deposit.kind !== "direct_deposit") return null;
    data = {
      title: tf("deposit.title"),
      subtitle: tf("deposit.authorize"),
      worker: { label: tf("worker"), name, ssnLabel: tf("ssn"), ssn: null },
      rows: [
        { label: tf("deposit.bank"), value: deposit.routing },
        { label: tf("deposit.account"), value: deposit.account },
        { label: tf("deposit.type"), value: tf(`deposit.types.${deposit.accountType}`) },
      ],
      signature,
    };
  }
  return { bytes: await pdf(createElement(OnboardingFormDocument, { data })), filename: `${kind}-${fileSafe(name)}.pdf` };
}
