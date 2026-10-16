"use client";

// Pattern: docs/patterns/payments.md — QuickBooks Online sales transactions list (status filter, a
// row action) and Receive payment; Zoho Books "unused amount"; Stripe "unapply".
import { BanknoteIcon, EllipsisIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { voidPaymentAction } from "@/app/[locale]/(app)/payments/actions";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import type { PaymentClients, PaymentRow } from "@/server/receivables/queries";
import { longDate, money } from "../format";
import { PaymentDialog, type PaymentMode } from "./payment-dialog";

const FILTERS = ["credit", "voided"] as const;

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
    <div className="mx-auto flex w-full max-w-7xl min-w-0 flex-col gap-4 px-4 py-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-2xl font-semibold">{t("title")}</h1>
        {canChange && (
          <Button onClick={() => setDialog({ kind: "record" })} data-testid="record-payment">
            {t("record")}
          </Button>
        )}
      </div>
      {!canChange && <p className="text-sm text-muted-foreground">{t("readOnly")}</p>}

      {rows.length > 0 && (
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
      )}

      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-sm text-muted-foreground" data-testid="payments-empty">
          <BanknoteIcon className="size-5" />
          <p>{t("empty")}</p>
          <div className="flex gap-4">
            {canChange && (
              <Button variant="link" size="sm" className="h-auto px-0" onClick={() => setDialog({ kind: "record" })}>
                {t("record")}
              </Button>
            )}
            <Link href="/bank/import" className={buttonVariants({ variant: "link", size: "sm", className: "h-auto px-0" })}>
              {t("importBank")}
            </Link>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
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
                  <TableCell className="whitespace-nowrap">{longDate(p.receivedOn, locale)}</TableCell>
                  <TableCell>{p.clientName}</TableCell>
                  <TableCell>{t(`methods.${p.method}`)}</TableCell>
                  <TableCell className="max-w-56 truncate" title={p.reference ?? undefined}>
                    {p.reference ?? "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{money(p.amountCents, locale)}</TableCell>
                  <TableCell className="text-right tabular-nums">{money(p.appliedCents, locale)}</TableCell>
                  <TableCell className="text-right tabular-nums">{money(p.unusedCents, locale)}</TableCell>
                  <TableCell>
                    <Badge variant={p.status === "credit" ? "secondary" : "outline"} title={p.voidReason ?? undefined}>
                      {t(`statuses.${p.status}`)}
                    </Badge>
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
        </div>
      )}
      {dialog && <PaymentDialog clients={clients} mode={dialog} today={today} onClose={() => setDialog(null)} />}
      {voiding && <VoidDialog payment={voiding} onClose={() => setVoiding(null)} />}
    </div>
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
