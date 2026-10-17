"use client";

// Pattern: docs/patterns/payments.md — QuickBooks Online sales transactions list (status filter, a
// row action) and Receive payment; Zoho Books "unused amount"; Stripe "unapply"; drawn as Stripe's
// current lists (the statuses as boxes with their counts, the client as a filter pill, the amount
// first with its currency and the status beside it, short dates, the number of results under it).
import { BanknoteIcon, EllipsisIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { voidPaymentAction } from "@/app/[locale]/(app)/payments/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import type { PaymentClients, PaymentRow } from "@/server/receivables/queries";
import { EmptyState } from "../empty-state";
import { listDate, longDate, money } from "../format";
import { FilterPill, ListAmount, ListToolbar, PillChoices, ResultsCount, StatusTabs } from "../list-controls";
import { Page, PageHeader, TableFrame } from "../page";
import { Status, type Tone } from "../status";
import { PaymentDialog, type PaymentMode } from "./payment-dialog";
import { ReadOnlyNote } from "../abilities";
import { Tip } from "../tip";

const FILTERS = ["credit", "voided"] as const;
/** One status language (decision 0029). */
const PAYMENT_TONE: Record<PaymentRow["status"], Tone> = { applied: "success", credit: "warning", voided: "neutral" };

export function PaymentsView({ rows, clients, today, canChange }: { rows: PaymentRow[]; clients: PaymentClients; today: string; canChange: boolean }) {
  const t = useTranslations("payments");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const filter = FILTERS.find((f) => f === params.get("filter")) ?? "";
  const client = params.get("client") ?? "";
  const [dialog, setDialog] = useState<PaymentMode | null>(null);
  const [voiding, setVoiding] = useState<PaymentRow | null>(null);
  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    const q = next.toString();
    router.replace(q ? `${pathname}?${q}` : pathname);
  };
  const shown = rows.filter((r) => (filter === "" ? true : filter === "credit" ? r.status === "credit" : r.status === "voided") && (client === "" || r.clientId === client));
  const count = (f: (typeof FILTERS)[number] | "") => rows.filter((r) => (f === "" || (f === "credit" ? r.status === "credit" : r.status === "voided")) && (client === "" || r.clientId === client)).length;

  return (
    <Page>
      <PageHeader
        title={t("title")}
        description={canChange ? undefined : <ReadOnlyNote text={t("readOnly")} />}
        actions={
          canChange && (
            <Button size="sm" onClick={() => setDialog({ kind: "record" })} data-testid="record-payment">
              {t("record")}
            </Button>
          )
        }
      />

      {/* The statuses and the filter stay in place when there is nothing yet (_components/empty-state.md). */}
      <StatusTabs
        label={t("filter")}
        current={filter || "all"}
        tabs={(["", ...FILTERS] as const).map((f) => ({
          key: f || "all",
          label: f === "" ? t("all") : t(`filters.${f}`),
          count: count(f),
          href: { pathname: "/payments", query: { ...(f ? { filter: f } : {}), ...(client ? { client } : {}) } },
          testId: `payments-tab-${f || "all"}`,
        }))}
      />
      <div className="flex min-w-0 flex-col">
        <ListToolbar>
          <FilterPill label={t("client")} value={clients.find((c) => c.id === client)?.name} onClear={() => setParam("client", "")} testId="client-filter">
            <PillChoices heading={t("client")} value={client} options={clients.map((c) => ({ value: c.id, label: c.name }))} onChoose={(v) => setParam("client", v)} />
          </FilterPill>
        </ListToolbar>

        {rows.length === 0 ? (
          <EmptyState
            icon={BanknoteIcon}
            title={t("emptyTitle")}
            description={t("emptyBody")}
            action={
              canChange && (
                <Button size="sm" onClick={() => setDialog({ kind: "record" })}>
                  {t("record")}
                </Button>
              )
            }
            secondary={
              <Link href="/bank/import" className={buttonVariants({ variant: "outline", size: "sm" })}>
                {t("importBank")}
              </Link>
            }
            testId="payments-empty"
          />
        ) : (
          <TableFrame className="flex flex-col gap-4">
            <Table aria-label={t("title")} data-testid="payments-list">
              <TableHeader>
                <TableRow>
                  {/* The amount first with its currency, the status beside it with no heading of its own (Stripe). */}
                  <TableHead className="text-right">{t("amount")}</TableHead>
                  <TableHead>
                    <span className="sr-only">{t("status")}</span>
                  </TableHead>
                  <TableHead>{t("date")}</TableHead>
                  <TableHead>{t("client")}</TableHead>
                  <TableHead>{t("method")}</TableHead>
                  <TableHead>{t("reference")}</TableHead>
                  <TableHead className="text-right">{t("applied")}</TableHead>
                  <TableHead className="text-right">{t("unused")}</TableHead>
                  <TableHead>{t("from")}</TableHead>
                  <TableHead className="w-0">
                    <span className="sr-only">{t("actions")}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((p) => (
                  <TableRow key={p.id} data-testid="payment-row" className={p.status === "voided" ? "text-muted-foreground" : undefined}>
                    <TableCell className="w-0 text-right">
                      <ListAmount text={money(p.amountCents, locale)} />
                    </TableCell>
                    <TableCell className="w-0">
                      <Tip label={p.voidReason ?? undefined}>
                        <Status tone={PAYMENT_TONE[p.status]}>{t(`statuses.${p.status}`)}</Status>
                      </Tip>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{listDate(p.receivedOn, locale, today)}</TableCell>
                    <TableCell>{p.clientName}</TableCell>
                    <TableCell>{t(`methods.${p.method}`)}</TableCell>
                    {/* The reference takes the room the other columns leave and is cut to fit, never pushing the
                        table past the page (Spanish labels are longer); the whole of it shows on hover. */}
                    <Tip label={p.reference ?? undefined}>
                      <TableCell className="w-full max-w-0 truncate">{p.reference ?? "—"}</TableCell>
                    </Tip>
                    <TableCell className="text-right tabular-nums">{money(p.appliedCents, locale)}</TableCell>
                    <TableCell className="text-right tabular-nums">{money(p.unusedCents, locale)}</TableCell>
                    <Tip label={p.fromBank ?? undefined}>
                      <TableCell className="whitespace-nowrap">{p.fromBank ? t("fromBank") : t("fromTyped")}</TableCell>
                    </Tip>
                    <TableCell className="text-right">
                      {canChange && p.status !== "voided" && (
                        <DropdownMenu>
                          <DropdownMenuTrigger render={<Button size="icon-xs" variant="ghost" aria-label={t("rowMenu", { date: longDate(p.receivedOn, locale) })} data-testid="payment-menu" />}>
                            <EllipsisIcon className="size-4" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {p.unusedCents > 0 && <DropdownMenuItem onClick={() => setDialog({ kind: "credit", paymentId: p.id, clientId: p.clientId, unusedCents: p.unusedCents })}>{t("applyCredit")}</DropdownMenuItem>}
                            <DropdownMenuItem onClick={() => setVoiding(p)}>{t("void")}</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <ResultsCount shown={shown.length} testId="payment-count" />
          </TableFrame>
        )}
      </div>
      {dialog && <PaymentDialog clients={clients} mode={dialog} today={today} onClose={() => setDialog(null)} />}
      {voiding && <VoidDialog payment={voiding} onClose={() => setVoiding(null)} />}
    </Page>
  );
}

function VoidDialog({ payment, onClose }: { payment: PaymentRow; onClose: () => void }) {
  const t = useTranslations("payments");
  const locale = useLocale();
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("voidTitle", { amount: money(payment.amountCents, locale), client: payment.clientName })}</DialogTitle>
          <DialogDescription>{t("voidBody")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="void-reason">{t("reason")}</Label>
          <Textarea id="void-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button
            variant="destructive"
            disabled={pending || reason.trim() === ""}
            onClick={() =>
              start(async () => {
                const r = await voidPaymentAction(payment.id, reason);
                if (r.ok) {
                  toast.success(t("voided"));
                  onClose();
                  router.refresh();
                } else toast.error(t(`errors.${r.error}` as "errors.generic"));
              })
            }
            data-testid="confirm-void"
          >
            {t("void")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
