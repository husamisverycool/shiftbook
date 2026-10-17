"use client";

// Pattern: docs/patterns/money/wage-access.md — the CFPB's December 2025 "covered EWA" conditions as
// the screen's content (only what was earned; repaid by a payroll deduction; no recourse, collection or
// credit check; a free option as easy to choose as the paid one) in a Stripe list with a confirmed
// dialog per request.
import { HandCoinsIcon, SettingsIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import type { WageAccessRow } from "@/server/money/queries";
import type { WageAccessRules } from "@/server/money/wage-access";
import { requestWageAccessAction } from "@/app/[locale]/(app)/money/actions";
import { useCan } from "../abilities";
import { EmptyState } from "../empty-state";
import { hoursMinutes, money } from "../format";
import { ListAmount } from "../list-controls";
import { TableFrame } from "../page";

const TERMS = ["only_earned", "payroll_deduction", "no_recourse", "no_collection", "no_credit_check", "free_option"] as const;

/** "$12.50" → 1250; anything else → null. Whole cents only. */
export function parseDollars(text: string): number | null {
  const m = /^\s*\$?\s*(\d{1,7})(?:\.(\d{1,2}))?\s*$/.exec(text);
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
}

const pct = (bps: number) => `${bps % 100 === 0 ? bps / 100 : (bps / 100).toFixed(2)}%`;

export function WageAccessRulesLine({ rules }: { rules: WageAccessRules }) {
  const t = useTranslations("money.wage");
  const locale = useLocale();
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted-foreground" data-testid="wage-rules">
      <span>
        {t("rules", {
          cap: pct(rules.capBps),
          limit: rules.maxPerRequestCents > 0 ? t("limit", { amount: money(rules.maxPerRequestCents, locale) }) : t("noLimit"),
          fee: rules.expeditedFeeCents > 0 ? money(rules.expeditedFeeCents, locale) : t("free"),
        })}
      </span>
      <Link href="/settings/money" className="rounded-sm text-foreground underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
        {t("change")}
      </Link>
    </div>
  );
}

export function WageAccessView({ rules, rows }: { rules: WageAccessRules; rows: WageAccessRow[] }) {
  const t = useTranslations("money.wage");
  const locale = useLocale();
  const can = useCan();
  const [asking, setAsking] = useState<WageAccessRow | null>(null);
  if (!rules.enabled)
    return (
      <EmptyState
        icon={HandCoinsIcon}
        title={t("offTitle")}
        description={t("offBody")}
        testId="wage-off"
        action={
          <Link href="/settings/money" className={buttonVariants({ variant: "outline" })}>
            <SettingsIcon />
            {t("offAction")}
          </Link>
        }
      />
    );
  const shown = rows.filter((r) => r.availability.minutes > 0 || r.availability.minutesWithoutRate > 0 || r.availability.outstandingCents > 0);
  return (
    <>
      <WageAccessRulesLine rules={rules} />
      {shown.length === 0 ? (
        <EmptyState icon={HandCoinsIcon} title={t("emptyTitle")} description={t("emptyBody")} testId="wage-empty" />
      ) : (
        <TableFrame>
          <Table aria-label={t("cols.worker")} data-testid="wage-access">
            <TableHeader>
              <TableRow>
                <TableHead>{t("cols.worker")}</TableHead>
                <TableHead className="text-right">{t("cols.hours")}</TableHead>
                <TableHead className="text-right">{t("cols.earned")}</TableHead>
                <TableHead className="text-right">{t("cols.outstanding")}</TableHead>
                <TableHead className="text-right">{t("cols.available")}</TableHead>
                <TableHead className="w-0">
                  <span className="sr-only">{t("request")}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((r) => (
                <TableRow key={r.workerId} data-testid="wage-row">
                  <TableCell>
                    <Link href={`/workers/${r.workerId}`} className="rounded-sm font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/50">
                      {r.workerName}
                    </Link>
                    {r.availability.minutesWithoutRate > 0 && <div className="text-[13px] text-muted-foreground">{t("noRate", { hours: hoursMinutes(r.availability.minutesWithoutRate) })}</div>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{hoursMinutes(r.availability.minutes)}</TableCell>
                  <TableCell className="text-right tabular-nums">{money(r.availability.earnedCents, locale)}</TableCell>
                  <TableCell className="text-right tabular-nums" data-testid="wage-outstanding">
                    {r.availability.outstandingCents === 0 ? "—" : money(r.availability.outstandingCents, locale)}
                  </TableCell>
                  <TableCell className="text-right" data-testid="wage-available">
                    <ListAmount text={money(r.availability.availableCents, locale)} />
                  </TableCell>
                  <TableCell className="text-right">
                    {can("money") && (
                      <Button size="sm" variant="outline" disabled={r.availability.availableCents < 100} onClick={() => setAsking(r)} data-testid="wage-request">
                        {t("request")}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableFrame>
      )}
      {asking && <RequestDialog row={asking} rules={rules} onClose={() => setAsking(null)} />}
    </>
  );
}

type Send = (cents: number, delivery: "standard" | "expedited") => Promise<{ ok: true } | { ok: false; error: string }>;

/** One request, with the terms; `send` and `title` let the worker app make the worker's own request with it. */
export function RequestDialog({ row, rules, onClose, send, title }: { row: Pick<WageAccessRow, "workerId" | "workerName" | "availability">; rules: WageAccessRules; onClose: () => void; send?: Send; title?: string }) {
  const t = useTranslations("money.wage");
  const tc = useTranslations("common");
  const locale = useLocale();
  const available = row.availability.availableCents;
  const [text, setText] = useState(`${Math.trunc(available / 100)}.${String(available % 100).padStart(2, "0")}`);
  const [delivery, setDelivery] = useState<"standard" | "expedited">("standard");
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const submit = () => {
    const cents = parseDollars(text);
    if (cents === null || cents < 100) return setProblem(t("errors.amount"));
    if (cents > available) return setProblem(t("errors.too_much"));
    setProblem(null);
    start(async () => {
      const r = send ? await send(cents, delivery) : await requestWageAccessAction(row.workerId, cents, delivery);
      if (r.ok) {
        toast.success(t("done"));
        onClose();
      } else setProblem(t(`errors.${r.error === "amount" || r.error === "too_much" || r.error === "none" || r.error === "not_allowed" || r.error === "not_found" ? r.error : "generic"}`));
    });
  };
  const choice = (value: "standard" | "expedited", title: string, note: string) => (
    <label
      className={cn(
        "flex flex-1 cursor-pointer flex-col gap-0.5 rounded-lg border p-3 text-sm transition-colors outline-none has-focus-visible:ring-2 has-focus-visible:ring-ring/50 hover:bg-muted/50",
        delivery === value && "border-foreground ring-1 ring-foreground",
      )}
    >
      <input type="radio" name="delivery" value={value} checked={delivery === value} onChange={() => setDelivery(value)} className="sr-only" data-testid={`delivery-${value}`} />
      <span className="font-medium">{title}</span>
      <span className="text-[13px] text-muted-foreground">{note}</span>
    </label>
  );
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title ?? t("dialogTitle", { name: row.workerName })}</DialogTitle>
          <DialogDescription>{t("amountHint", { amount: money(available, locale) })}</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="wage-amount">{t("amount")}</Label>
            <Input id="wage-amount" inputMode="decimal" value={text} onChange={(e) => setText(e.target.value)} aria-invalid={problem !== null} aria-describedby={problem ? "wage-problem" : undefined} data-testid="wage-amount" />
            {problem && (
              <p id="wage-problem" className="text-[13px] text-destructive" role="alert">
                {problem}
              </p>
            )}
          </div>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-medium">{t("delivery")}</legend>
            <div className="flex flex-col gap-2 sm:flex-row">
              {choice("standard", t("standard"), t("standardNote"))}
              {choice("expedited", t("faster"), rules.expeditedFeeCents > 0 ? t("fasterNote", { fee: money(rules.expeditedFeeCents, locale) }) : t("standardNote"))}
            </div>
          </fieldset>
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">{t("termsTitle")}</h3>
            <ul className="flex flex-col gap-1 text-[13px] text-muted-foreground" data-testid="wage-terms">
              {TERMS.map((k) => (
                <li key={k} className="flex items-start gap-2">
                  <span aria-hidden className="mt-1.5 size-1 shrink-0 rounded-full bg-muted-foreground" />
                  {t(`terms.${k}`)}
                </li>
              ))}
            </ul>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {tc("cancel")}
            </Button>
            <Button type="submit" loading={pending} loadingLabel={t("confirm")} data-testid="wage-confirm">
              {t("confirm")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
