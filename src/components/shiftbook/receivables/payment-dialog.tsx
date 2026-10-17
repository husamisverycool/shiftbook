"use client";

// Pattern: docs/patterns/payments.md — QuickBooks Online Receive payment (client, date, method,
// reference, amount received; the client's open invoices with a checkbox and a payment each; amount
// to apply and amount left as credit); TempWorks Quick Pay (Tab through the fields in order).
// Also "Find match" on a bank deposit (docs/patterns/bank.md) and "Apply credit".
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { applyCreditAction, applyInvoiceCreditAction, recordPaymentAction } from "@/app/[locale]/(app)/payments/actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useRouter } from "@/i18n/navigation";
import { centsToInput, parseDollars } from "@/lib/amounts";
import type { PaymentClients } from "@/server/receivables/queries";
import { longDate, money } from "../format";

const METHODS = ["check", "ach", "wire", "card", "other"] as const;

export type PaymentMode =
  | { kind: "record"; clientId?: string; invoiceId?: string }
  /** A payment's unused amount, or the credit a credit note left on an invoice (decision 0019). */
  | { kind: "credit"; paymentId?: string; fromInvoiceId?: string; clientId: string; unusedCents: number }
  | { kind: "bank"; lineId: string; postedOn: string; amountCents: number; description: string; clientId?: string; applications?: { invoiceId: string; amountCents: number }[] };

type Problem = { field: string; rule: string; invoiceId?: string };

export function PaymentDialog({ clients, mode, today, onClose }: { clients: PaymentClients; mode: PaymentMode; today: string; onClose: () => void }) {
  const t = useTranslations("payments");
  const tc = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const fixedAmount = mode.kind === "record" ? null : mode.kind === "credit" ? mode.unusedCents : mode.amountCents;
  const [clientId, setClientId] = useState(mode.clientId ?? "");
  const [date, setDate] = useState(mode.kind === "bank" ? mode.postedOn : today);
  const [method, setMethod] = useState<(typeof METHODS)[number]>("check");
  const [reference, setReference] = useState("");
  const [memo, setMemo] = useState("");
  const [amountText, setAmountText] = useState(fixedAmount !== null ? centsToInput(fixedAmount) : "");
  const initialApps = (): Record<string, string> => {
    if (mode.kind === "bank" && mode.applications) return Object.fromEntries(mode.applications.map((a) => [a.invoiceId, centsToInput(a.amountCents)]));
    if (mode.kind === "record" && mode.invoiceId) {
      const inv = clients.flatMap((c) => c.invoices).find((i) => i.id === mode.invoiceId);
      return inv ? { [inv.id]: centsToInput(inv.balanceCents) } : {};
    }
    return {};
  };
  const [apps, setApps] = useState<Record<string, string>>(initialApps);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [pending, start] = useTransition();
  const client = clients.find((c) => c.id === clientId);
  const received = fixedAmount ?? parseDollars(amountText);
  const appliedCents = useMemo(() => Object.values(apps).reduce((sum, v) => sum + (parseDollars(v) ?? 0), 0), [apps]);
  const left = received === null ? null : received - appliedCents;
  const problem = (field: string, invoiceId?: string) => problems.find((p) => p.field === field && (invoiceId === undefined || p.invoiceId === invoiceId));
  const rule = (p: Problem | undefined) => (p ? t(`rules.${p.rule}` as "rules.amount") : null);
  // Fields this mode does not show (a deposit's date and amount are the bank's): their problems are said below the form (review finding 5).
  const shownFields = mode.kind === "record" ? ["clientId", "receivedOn", "amountCents", "method", "reference", "memo", "applications"] : ["clientId", "applications"];
  const elsewhere = problems.filter((p) => !shownFields.includes(p.field));

  // Ticking fills what is left of the amount, oldest first (QuickBooks Online).
  const tick = (invoiceId: string, balance: number, on: boolean) =>
    setApps((cur) => {
      const next = { ...cur };
      if (!on) delete next[invoiceId];
      else {
        const used = Object.entries(cur).reduce((sum, [k, v]) => sum + (k === invoiceId ? 0 : (parseDollars(v) ?? 0)), 0);
        const remaining = received === null ? balance : Math.max(0, received - used);
        next[invoiceId] = centsToInput(received === null ? balance : Math.min(balance, remaining));
      }
      return next;
    });

  const save = () =>
    start(async () => {
      // A ticked invoice whose amount was emptied is left out, like an untick (review nit).
      const applications = Object.entries(apps)
        .filter(([, v]) => v.trim() !== "")
        .map(([invoiceId, v]) => ({ invoiceId, amountCents: parseDollars(v) ?? -1 }))
        .filter((a) => a.amountCents !== 0);
      const res =
        mode.kind === "credit"
          ? mode.fromInvoiceId
            ? await applyInvoiceCreditAction(mode.fromInvoiceId, applications)
            : await applyCreditAction(mode.paymentId!, applications)
          : await recordPaymentAction(
              { clientId, receivedOn: date, amountCents: received ?? -1, method: mode.kind === "bank" ? "bank_deposit" : method, reference: mode.kind === "bank" ? mode.description.slice(0, 100) : reference || null, memo: memo || null, applications },
              mode.kind === "bank" ? mode.lineId : undefined,
            );
      if (res.ok) {
        toast.success(mode.kind === "credit" ? t("creditApplied") : t("saved"));
        onClose();
        router.refresh();
        return;
      }
      if (res.error === "invalid") setProblems(res.problems);
      else toast.error(t(`errors.${res.error}` as "errors.generic"));
    });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{mode.kind === "credit" ? t("applyCreditTitle") : mode.kind === "bank" ? t("matchTitle") : t("recordTitle")}</DialogTitle>
          <DialogDescription>{mode.kind === "bank" ? t("matchBody", { description: mode.description, amount: money(mode.amountCents, locale), date: longDate(mode.postedOn, locale) }) : mode.kind === "credit" ? t(mode.fromInvoiceId ? "applyInvoiceCreditBody" : "applyCreditBody", { amount: money(mode.unusedCents, locale) }) : t("recordBody")}</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pay-client">{t("client")}</Label>
              <NativeSelect
                id="pay-client"
                className="w-full"
                value={clientId}
                disabled={mode.kind === "credit"}
                onChange={(e) => {
                  setClientId(e.target.value);
                  setApps({});
                }}
                aria-invalid={problem("clientId") ? true : undefined}
                data-testid="pay-client"
              >
                <NativeSelectOption value="">{t("chooseClient")}</NativeSelectOption>
                {clients.map((c) => (
                  <NativeSelectOption key={c.id} value={c.id}>
                    {c.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              {problem("clientId") && <p className="text-sm text-destructive">{rule(problem("clientId"))}</p>}
            </div>
            {mode.kind === "record" && (
              <>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="pay-date">{t("date")}</Label>
                  <Input id="pay-date" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} aria-invalid={problem("receivedOn") ? true : undefined} />
                  {problem("receivedOn") && <p className="text-sm text-destructive">{rule(problem("receivedOn"))}</p>}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="pay-method">{t("method")}</Label>
                  <NativeSelect id="pay-method" className="w-full" value={method} onChange={(e) => setMethod(e.target.value as (typeof METHODS)[number])}>
                    {METHODS.map((m) => (
                      <NativeSelectOption key={m} value={m}>
                        {t(`methods.${m}`)}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="pay-reference">{t("reference")}</Label>
                  <Input id="pay-reference" value={reference} maxLength={100} onChange={(e) => setReference(e.target.value)} placeholder={t("referenceHint")} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="pay-amount">{t("amountReceived")}</Label>
                  <Input id="pay-amount" inputMode="decimal" value={amountText} onChange={(e) => setAmountText(e.target.value)} placeholder="0.00" aria-invalid={problem("amountCents") || (amountText !== "" && received === null) ? true : undefined} data-testid="pay-amount" />
                  {(problem("amountCents") || (amountText !== "" && received === null)) && <p className="text-sm text-destructive">{rule(problem("amountCents")) ?? t("rules.amount")}</p>}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="pay-memo">{t("memo")}</Label>
                  <Input id="pay-memo" value={memo} maxLength={500} onChange={(e) => setMemo(e.target.value)} />
                </div>
              </>
            )}
          </div>

          <section aria-labelledby="pay-open-title" className="flex flex-col gap-2">
            <h3 id="pay-open-title" className="text-sm font-semibold">
              {t("openInvoices")}
            </h3>
            {!client ? (
              <p className="text-sm text-muted-foreground">{t("chooseClientFirst")}</p>
            ) : client.invoices.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("nothingOpen")}</p>
            ) : (
              <div className="overflow-hidden rounded-xl border bg-card">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-0">
                        <span className="sr-only">{t("apply")}</span>
                      </TableHead>
                      <TableHead>{t("invoice")}</TableHead>
                      <TableHead>{t("due")}</TableHead>
                      <TableHead className="text-right">{t("balance")}</TableHead>
                      <TableHead className="w-40 text-right">{t("payment")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {client.invoices.map((i) => {
                      const p = problem("applications", i.id);
                      return (
                        <TableRow key={i.id} data-testid="pay-invoice">
                          <TableCell>
                            <Checkbox checked={i.id in apps} onCheckedChange={(on) => tick(i.id, i.balanceCents, on === true)} aria-label={t("applyTo", { number: i.number })} />
                          </TableCell>
                          <TableCell className="font-medium">{i.number}</TableCell>
                          <TableCell>{longDate(i.dueOn, locale)}</TableCell>
                          <TableCell className="text-right tabular-nums">{money(i.balanceCents, locale)}</TableCell>
                          <TableCell className="text-right">
                            <Input
                              className="text-right tabular-nums"
                              inputMode="decimal"
                              value={apps[i.id] ?? ""}
                              onChange={(e) => setApps((cur) => ({ ...cur, [i.id]: e.target.value }))}
                              aria-label={t("paymentOn", { number: i.number })}
                              aria-invalid={p ? true : undefined}
                              data-testid="pay-invoice-amount"
                            />
                            {p && <p className="mt-1 text-left text-xs text-destructive">{rule(p)}</p>}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
            {problem("applications") && !problem("applications")!.invoiceId && <p className="text-sm text-destructive">{rule(problem("applications"))}</p>}
          </section>

          {elsewhere.length > 0 && (
            <ul role="alert" className="flex flex-col gap-1 text-sm text-destructive" data-testid="pay-problems">
              {elsewhere.map((p) => (
                <li key={`${p.field}-${p.rule}`}>{rule(p)}</li>
              ))}
            </ul>
          )}

          <dl className="ml-auto grid grid-cols-[auto_auto] gap-x-6 gap-y-1 text-sm" data-testid="pay-totals">
            <dt className="text-muted-foreground">{t("toApply")}</dt>
            <dd className="text-right tabular-nums">{money(appliedCents, locale)}</dd>
            <dt className="text-muted-foreground">{t("toCredit")}</dt>
            <dd className={left !== null && left < 0 ? "text-right text-destructive tabular-nums" : "text-right tabular-nums"}>{left === null ? "—" : money(left, locale)}</dd>
          </dl>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={pending || !client || received === null || (left !== null && left < 0)} data-testid="pay-save" loading={pending} loadingLabel={tc("loading")}>
              {mode.kind === "bank" ? t("post") : mode.kind === "credit" ? t("applyCredit") : t("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
