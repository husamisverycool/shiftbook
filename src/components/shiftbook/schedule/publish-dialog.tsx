"use client";

// Pattern: docs/patterns/schedule.md §5 — Deputy's three-step publish: what (only the changes, or every
// shift in view), which clients, how to notify (with confirmation, notify only, or published silently),
// an optional message (When I Work's publisher).
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import type { NotifyMode } from "@/server/schedule/service";
import type { WeekView } from "@/server/schedule/queries";
import { publishAction } from "@/app/[locale]/(app)/schedule/actions";

const NOTIFY: { mode: NotifyMode; key: "notifyConfirm" | "notifyOnly" | "silent" }[] = [
  { mode: "confirm", key: "notifyConfirm" },
  { mode: "notify", key: "notifyOnly" },
  { mode: "silent", key: "silent" },
];

export function PublishDialog({ view, onClose }: { view: WeekView; onClose: () => void }) {
  const t = useTranslations("schedule.publishDialog");
  const te = useTranslations("schedule.errors");
  const tc = useTranslations("common");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const changes = view.status.unpublished.length;
  const [scope, setScope] = useState<"changes" | "all">(changes > 0 ? "changes" : "all");
  const inView = [...new Map(view.shifts.map((s) => [s.clientId, s.clientName])).entries()].map(([id, name]) => ({ id, name }));
  const [clients, setClients] = useState<Set<string>>(new Set(inView.map((c) => c.id)));
  const [notify, setNotify] = useState<NotifyMode>("confirm");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const count = scope === "changes" ? changes : view.shifts.length;

  const publish = () =>
    startTransition(async () => {
      const result = await publishAction({
        from: view.days[0]!,
        to: view.days[6]!,
        scope,
        clientIds: clients.size === inView.length ? null : [...clients],
        notify,
        message: message.trim() || null,
      });
      if (!result.ok) return setError(te.has(result.error as never) ? te(result.error as never) : te("generic"));
      toast.success(result.published === 0 ? t("nothing") : t("done", { published: result.published, offered: result.offered }));
      router.refresh();
      onClose();
    });

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md" data-testid="publish-dialog">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("stepOf", { step })}</DialogDescription>
        </DialogHeader>
        {step === 1 && (
          <fieldset className="grid gap-3">
            <legend className="mb-2 text-sm font-medium">{t("what")}</legend>
            {(["changes", "all"] as const).map((k) => (
              <label key={k} className="flex items-center gap-2 text-sm">
                <input type="radio" name="publish-scope" value={k} checked={scope === k} disabled={k === "changes" && changes === 0} onChange={() => setScope(k)} className="size-4 accent-primary" data-testid={`publish-scope-${k}`} />
                {k === "changes" ? t("changes", { count: changes }) : t("all", { count: view.shifts.length })}
              </label>
            ))}
          </fieldset>
        )}
        {step === 2 && (
          <fieldset className="grid gap-3">
            <legend className="mb-2 text-sm font-medium">{t("which")}</legend>
            {inView.map((c) => (
              <div key={c.id} className="flex items-center gap-2">
                <Checkbox
                  id={`publish-client-${c.id}`}
                  checked={clients.has(c.id)}
                  onCheckedChange={(on) =>
                    setClients((was) => {
                      const next = new Set(was);
                      if (on === true) next.add(c.id);
                      else next.delete(c.id);
                      return next;
                    })
                  }
                />
                <Label htmlFor={`publish-client-${c.id}`}>{c.name}</Label>
              </div>
            ))}
          </fieldset>
        )}
        {step === 3 && (
          <div className="grid gap-4">
            <fieldset className="grid gap-3">
              <legend className="mb-2 text-sm font-medium">{t("notify")}</legend>
              {NOTIFY.map((n) => (
                <label key={n.mode} className="flex items-center gap-2 text-sm">
                  <input type="radio" name="publish-notify" value={n.mode} checked={notify === n.mode} onChange={() => setNotify(n.mode)} className="size-4 accent-primary" data-testid={`publish-notify-${n.mode}`} />
                  {t(n.key)}
                </label>
              ))}
            </fieldset>
            {notify !== "silent" && (
              <div className="grid gap-1.5">
                <Label htmlFor="publish-message">{t("message")}</Label>
                <Textarea id="publish-message" maxLength={1000} value={message} onChange={(e) => setMessage(e.target.value)} />
              </div>
            )}
          </div>
        )}
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <DialogFooter>
          {step > 1 && (
            <Button variant="outline" onClick={() => setStep((s) => (s - 1) as 1 | 2)} disabled={pending}>
              {t("back")}
            </Button>
          )}
          {step < 3 ? (
            <Button onClick={() => setStep((s) => (s + 1) as 2 | 3)} disabled={count === 0 || (step === 2 && clients.size === 0)} data-testid="publish-next">
              {t("next")}
            </Button>
          ) : (
            <Button onClick={publish} loading={pending} loadingLabel={tc("loading")} disabled={pending} data-testid="publish-confirm">
              {t("publish")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
