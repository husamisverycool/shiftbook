"use client";

// Pattern: docs/patterns/shifts-preview.md — Instawork My Shifts (Upcoming / Past / Cancelled; confirm;
// can't make it with a required reason); Deputy (a count needing an answer; offers to accept).
// The worker app's Shifts screen: its actions come in bound to the worker who is looking.
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import type { WorkerShift, WorkerShifts as Data } from "@/server/schedule/queries";
import type { ShiftResult } from "@/server/schedule/service";
import { clock, dateTime, longDate } from "../format";

export interface WorkerShiftActions {
  confirm: (shiftId: string) => Promise<ShiftResult>;
  decline: (shiftId: string, reason: string) => Promise<ShiftResult>;
  answer: (offerId: string, accept: boolean, reason: string | null) => Promise<ShiftResult>;
}

type Tab = "upcoming" | "past" | "cancelled";
const TABS: Tab[] = ["upcoming", "past", "cancelled"];

export function WorkerShifts({ data, actions, zone }: { data: Data; actions: WorkerShiftActions; zone: string }) {
  const t = useTranslations("shiftsWorker");
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("upcoming");
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [declining, setDeclining] = useState<{ kind: "shift" | "offer"; id: string } | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const act = (key: string, fn: () => Promise<ShiftResult>, after?: () => void) =>
    startTransition(async () => {
      setBusy(key);
      setError(null);
      const result = await fn();
      setBusy(null);
      if (!result.ok) {
        const msg = t.has(`errors.${result.error}` as never) ? t(`errors.${result.error}` as never) : t("errors.generic");
        if (declining) setError(msg);
        else toast.error(msg);
        return;
      }
      toast.success(t("done"));
      after?.();
      router.refresh();
    });

  const list = tab === "upcoming" ? data.upcoming : tab === "past" ? data.past : data.cancelled;
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-5" data-testid="worker-shifts">
      <div role="group" aria-label={t("title")} className="flex gap-1 rounded-lg bg-muted p-[3px]">
        {TABS.map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={k === tab}
            onClick={() => setTab(k)}
            className={cn("flex-1 rounded-md px-3 py-1.5 text-sm font-medium text-foreground/60 outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 dark:text-muted-foreground", k === tab && "bg-background text-foreground shadow-sm dark:text-foreground")}
            data-testid={`worker-tab-${k}`}
          >
            {t(`tabs.${k}`)}
          </button>
        ))}
      </div>
      {tab === "upcoming" && data.needsAnswer > 0 && (
        <p className="text-sm font-medium" data-testid="worker-needs-answer">
          {t("needsAnswer", { count: data.needsAnswer })}
        </p>
      )}
      {tab === "upcoming" && data.offers.length > 0 && (
        <section className="flex flex-col gap-2" data-testid="worker-offers">
          <h2 className="text-sm font-medium text-muted-foreground">{t("offered")}</h2>
          {data.offers.map((o) => (
            <Card key={o.offerId} shift={o}>
              <div className="flex gap-2">
                <Button className="flex-1" onClick={() => act(`accept-${o.offerId}`, () => actions.answer(o.offerId, true, null))} disabled={pending} loading={busy === `accept-${o.offerId}`} data-testid="worker-accept">
                  {t("accept")}
                </Button>
                <Button className="flex-1" variant="outline" onClick={() => setDeclining({ kind: "offer", id: o.offerId })} disabled={pending} data-testid="worker-decline-offer">
                  {t("decline")}
                </Button>
              </div>
            </Card>
          ))}
        </section>
      )}
      <section className="flex flex-col gap-2" data-testid={`worker-list-${tab}`}>
        {list.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{t(`empty.${tab}`)}</p>
        ) : (
          list.map((s) => (
            <Card key={`${s.id}-${s.state}`} shift={s} zone={zone}>
              {tab === "upcoming" && s.state !== "confirmed" && (
                <div className="flex gap-2">
                  <Button className="flex-1" onClick={() => act(`confirm-${s.id}`, () => actions.confirm(s.id))} disabled={pending} loading={busy === `confirm-${s.id}`} data-testid="worker-confirm">
                    {t("confirm")}
                  </Button>
                  <Button className="flex-1" variant="outline" onClick={() => setDeclining({ kind: "shift", id: s.id })} disabled={pending} data-testid="worker-cant">
                    {t("cantMakeIt")}
                  </Button>
                </div>
              )}
              {tab === "upcoming" && s.state === "confirmed" && (
                <Button variant="ghost" size="sm" className="self-start" onClick={() => setDeclining({ kind: "shift", id: s.id })} disabled={pending} data-testid="worker-cant">
                  {t("cantMakeIt")}
                </Button>
              )}
            </Card>
          ))
        )}
      </section>
      <Dialog
        open={declining !== null}
        onOpenChange={(next) => {
          if (!next) {
            setDeclining(null);
            setReason("");
            setError(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{declining?.kind === "offer" ? t("decline") : t("cantMakeIt")}</DialogTitle>
            <DialogDescription>{t("reasonHint")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="worker-reason">{t("reason")}</Label>
            <Textarea id="worker-reason" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} aria-invalid={!!error} data-testid="worker-reason" />
            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeclining(null)}>
              {t("cancel")}
            </Button>
            <Button
              onClick={() => {
                const d = declining!;
                act(
                  "decline",
                  () => (d.kind === "offer" ? actions.answer(d.id, false, reason || null) : actions.decline(d.id, reason)),
                  () => {
                    setDeclining(null);
                    setReason("");
                  },
                );
              }}
              disabled={pending}
              loading={busy === "decline"}
              data-testid="worker-reason-send"
            >
              {t("send")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Card({ shift: s, zone, children }: { shift: WorkerShift; zone?: string; children?: React.ReactNode }) {
  const t = useTranslations("shiftsWorker");
  const locale = useLocale();
  return (
    <article className="flex flex-col gap-3 rounded-lg border bg-card p-4" data-testid="worker-shift">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium">{longDate(s.workDate, locale)}</div>
          <div className="text-sm tabular-nums">
            {clock(s.startMinute, locale)}–{clock(s.endMinute % 1440, locale)}
          </div>
          <div className="truncate text-sm text-muted-foreground">{`${s.position} · ${s.worksiteName}, ${s.city}`}</div>
        </div>
        <span className={cn("shrink-0 text-xs font-medium", s.state === "awaiting" ? "text-foreground" : "text-muted-foreground")}>{t(`states.${s.state}`)}</span>
      </div>
      {s.state === "awaiting" && s.confirmBy && zone && <p className="text-xs text-muted-foreground">{t("confirmBy", { when: dateTime(s.confirmBy, locale, zone, { date: "medium", time: true }) })}</p>}
      {s.reason && <p className="text-xs text-muted-foreground">“{s.reason}”</p>}
      {children}
    </article>
  );
}
