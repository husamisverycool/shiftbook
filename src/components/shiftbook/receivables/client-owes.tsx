"use client";

// Pattern: docs/patterns/clients/[id].md §3 What the client owes — FreshBooks client profile
// (outstanding split into overdue and not yet due; credit available); Xero contact (average days to
// pay, with how many invoices it counts); QuickBooks Online Receive payment.
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import type { ClientReceivables, PaymentClients } from "@/server/receivables/queries";
import { useEngineSay } from "../engine-say";
import { money } from "../format";
import { KeyFigure, KeyFigures } from "../key-figures";
import { Section } from "../page";
import { PaymentDialog } from "./payment-dialog";

export function ClientOwes({ clientId, owes, clients, today, canChange }: { clientId: string; owes: ClientReceivables; clients: PaymentClients; today: string; canChange: boolean }) {
  const t = useTranslations("clientOwes");
  // Days to pay's working in the reader's language (decision 0030).
  const say = useEngineSay();
  const locale = useLocale();
  const [paying, setPaying] = useState(false);
  const facts: { key: string; label: string; value: string }[] = [
    { key: "owed", label: t("owed"), value: money(owes.owedCents, locale) },
    { key: "overdue", label: t("overdue"), value: money(owes.overdueCents, locale) },
    { key: "notDue", label: t("notDue"), value: money(owes.notDueCents, locale) },
    { key: "credit", label: t("credit"), value: money(owes.creditCents, locale) },
    {
      key: "daysToPay",
      label: t("daysToPay"),
      value: owes.daysToPay.averageDays === null ? "—" : t("days", { days: owes.daysToPay.averageDays, count: owes.daysToPay.invoices }),
    },
  ];
  return (
    <Section
      id="owes-title"
      title={t("title")}
      testId="client-owes"
      actions={
        <>
          <Link href={`/payments?client=${clientId}`} className={buttonVariants({ size: "sm", variant: "outline" })}>
            {t("payments")}
          </Link>
          {canChange && (
            <Button size="sm" onClick={() => setPaying(true)} data-testid="client-record-payment">
              {t("recordPayment")}
            </Button>
          )}
        </>
      }
    >
      <KeyFigures className="gap-x-12 pt-1">
        {facts.map((f) => (
          <KeyFigure key={f.key} label={f.label} value={f.value} size={f.key === "owed" ? "default" : "sm"} testId={`owes-${f.key}`} />
        ))}
      </KeyFigures>
      {owes.daysToPay.averageDays !== null && <p className="text-[13px] text-muted-foreground">{say(owes.daysToPay)}</p>}
      {paying && <PaymentDialog clients={clients} mode={{ kind: "record", clientId }} today={today} onClose={() => setPaying(false)} />}
    </Section>
  );
}
