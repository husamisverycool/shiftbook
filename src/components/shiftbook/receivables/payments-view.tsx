"use client";

// Pattern: docs/patterns/payments.md — QuickBooks Online sales transactions list (status filter, a
// row action) and Receive payment; Zoho Books "unused amount"; Stripe "unapply".
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
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import type { PaymentClients, PaymentRow } from "@/server/receivables/queries";
import { EmptyState } from "../empty-state";
import { longDate, money, tableDate } from "../format";
import { Page, PageHeader, TableFrame } from "../page";
import { Status, type Tone } from "../status";
import { PaymentDialog, type PaymentMode } from "./payment-dialog";

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
        description={canChange ? undefined : t("readOnly")}
        actions={
          canChange && (
            <Button size="sm" onClick={() => setDialog({ kind: "record" })} data-testid="record-payment">
              {t("record")}
            </Button>
          )
        }
      />

      {/* The filters stay in place when there is nothing yet (_components/empty-state.md). */}
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t("filter")}>
        {(["", ...FILTERS] as const).map((f) => (
          <Button key={f || "all"} size="sm" variant={filter === f ? "secondary" : "outline"} aria-pressed={filter === f} onClick={() => setParam("filter", f)}>
            {f === "" ? t("all") : t(`filters.${f}`)}
            <span className="text-muted-foreground tabular-nums">{count(f)}</span>
          </Button>
        ))}
        <NativeSelect aria-label={t("client")} value={client} onChange={(e) => setParam("client", e.target.value)} className="w-64">
          <NativeSelectOption value="">
            {t("client")}: {t("any")}
          </NativeSelectOption>
          {clients.map((c) => (
            <NativeSelectOption key={c.id} value={c.id}>
              {c.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>

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
        <TableFrame>
          <Table aria-label={t("title")} data-testid="payments-list">
            <TableHeader>
              <TableRow>
                <TableHead>{t("date")}</TableHead>
                <TableHead>{t("client")}</TableHead>
                <TableHead>{t("method")}</TableHead>
                <TableHead>{t("reference")}</TableHead>
                <TableHead className="text-right">{t("amount")}</TableHead>
                <TableHead className="text-right">{t("applied")}</TableHead>
                <TableHead className="text-right">{t("unused")}</TableHead>
                <TableHead>{t("status")}</TableHead>
                <TableHead>{t("from")}</TableHead>
                <TableHead className="w-0">
                  <span className="sr-only">{t("actions")}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((p) => (
                <TableRow key={p.id} data-testid="payment-row" className={p.status === "voided" ? "text-muted-foreground" : undefined}>
                  <TableCell className="whitespace-nowrap">{tableDate(p.receivedOn, locale)}</TableCell>
                  <TableCell>{p.clientName}</TableCell>
                  <TableCell>{t(`methods.${p.method}`)}</TableCell>
                  {/* The reference takes the room the other columns leave and is cut to fit, never pushing the
                      table past the page (Spanish labels are longer); the whole of it shows on hover. */}
                  <TableCell className="w-full max-w-0 truncate" title={p.reference ?? undefined}>
                    {p.reference ?? "—"}
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{money(p.amountCents, locale)}</TableCell>
                  <TableCell className="text-right tabular-nums">{money(p.appliedCents, locale)}</TableCell>
                  <TableCell className="text-right tabular-nums">{money(p.unusedCents, locale)}</TableCell>
                  <TableCell>
                    <Status tone={PAYMENT_TONE[p.status]} title={p.voidReason ?? undefined}>
                      {t(`statuses.${p.status}`)}
                    </Status>
                  </TableCell>
                  <TableCell className="whitespace-nowrap" title={p.fromBank ?? undefined}>
                    {p.fromBank ? t("fromBank") : t("fromTyped")}
                  </TableCell>
                  <TableCell className="text-right">
                    {canChange && p.status !== "voided" && (
                      <DropdownMenu>
                        <DropdownMenuTrigger render={<Button size="icon-sm" variant="ghost" aria-label={t("rowMenu", { date: longDate(p.receivedOn, locale) })} data-testid="payment-menu" />}>
                          <EllipsisIcon />
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
        </TableFrame>
      )}
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
