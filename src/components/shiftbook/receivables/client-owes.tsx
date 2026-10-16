"use client";

// Pattern: docs/patterns/clients/[id].md §3 What the client owes — FreshBooks client profile
// (outstanding split into overdue and not yet due; credit available); Xero contact (average days to
// pay, with how many invoices it counts); QuickBooks Online Receive payment.
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import type { ClientReceivables, PaymentClients } from "@/server/receivables/queries";
import { money } from "../format";
import { PaymentDialog } from "./payment-dialog";

export function ClientOwes({ clientId, owes, clients, today, canChange }: { clientId: string; owes: ClientReceivables; clients: PaymentClients; today: string; canChange: boolean }) {
  const t = useTranslations("clientOwes");
  const locale = useLocale();
  const [paying, setPaying] = useState(false);
  const facts: { key: string; label: string; value: string; title?: string }[] = [
    { key: "owed", label: t("owed"), value: money(owes.owedCents, locale) },
    { key: "overdue", label: t("overdue"), value: money(owes.overdueCents, locale) },
    { key: "notDue", label: t("notDue"), value: money(owes.notDueCents, locale) },
    { key: "credit", label: t("credit"), value: money(owes.creditCents, locale) },
    {
      key: "daysToPay",
      label: t("daysToPay"),
      value: owes.daysToPay.averageDays === null ? "—" : t("days", { days: owes.daysToPay.averageDays, count: owes.daysToPay.invoices }),
      title: owes.daysToPay.explain,
    },
  ];
  return (
    <section className="flex flex-col gap-3 rounded-lg border p-4" aria-labelledby="owes-title" data-testid="client-owes">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="owes-title" className="mr-auto text-lg font-semibold">
          {t("title")}
        </h2>
        <Link href={`/payments?client=${clientId}`} className="text-sm underline-offset-4 hover:underline">
          {t("payments")}
        </Link>
        {canChange && (
          <Button size="sm" onClick={() => setPaying(true)} data-testid="client-record-payment">
            {t("recordPayment")}
          </Button>
        )}
      </div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-5">
        {facts.map((f) => (
          <div key={f.key} className="flex flex-col gap-0.5" data-testid={`owes-${f.key}`}>
            <dt className="text-muted-foreground">{f.label}</dt>
            <dd className={f.key === "owed" ? "text-base font-semibold tabular-nums" : "font-medium tabular-nums"} title={f.title}>
              {f.value}
            </dd>
          </div>
        ))}
      </dl>
      {owes.daysToPay.averageDays !== null && <p className="text-xs text-muted-foreground">{owes.daysToPay.explain}</p>}
      {paying && <PaymentDialog clients={clients} mode={{ kind: "record", clientId }} today={today} onClose={() => setPaying(false)} />}
    </section>
  );
}
