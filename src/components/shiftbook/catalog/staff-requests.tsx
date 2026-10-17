"use client";

// Pattern: docs/patterns/job-orders.md, "Requested by clients" (slice v) — Linear's Triage: what came
// in from outside sits above the list, each row with Accept and Decline (a decline needs a reason the
// requester sees; TempWorks order requests: "rejecting requires a comment").
import { InboxIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { acceptStaffRequestAction, declineStaffRequestAction } from "@/app/[locale]/(app)/job-orders/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import type { StaffRequestView } from "@/server/portal/service";
import { clock, shortDate } from "../format";

export function StaffRequests({ requests, mayDecide }: { requests: StaffRequestView[]; mayDecide: boolean }) {
  const t = useTranslations("staffRequests");
  const locale = useLocale();
  const [accepting, setAccepting] = useState<StaffRequestView | null>(null);
  const [declining, setDeclining] = useState<StaffRequestView | null>(null);
  if (requests.length === 0) return null;
  return (
    <section aria-labelledby="staff-requests-title" className="border-t" data-testid="staff-requests">
      <div className="flex items-center gap-2 bg-muted/60 px-4 py-2 text-sm md:px-8">
        <InboxIcon className="size-4 text-muted-foreground" aria-hidden />
        <h2 id="staff-requests-title" className="font-medium">
          {t("title")}
        </h2>
        <span className="text-muted-foreground tabular-nums">{requests.length}</span>
      </div>
      <ul className="divide-y">
        {requests.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-sm transition-colors hover:bg-muted/40 md:px-8" data-testid="staff-request">
            <div className="flex min-w-0 flex-col">
              <span className="font-medium">{r.position}</span>
              <span className="text-muted-foreground">
                {t("from", { client: r.clientName, contact: r.contactName })} · {t("summary", { start: shortDate(r.startsOn, locale), shift: `${clock(r.shiftStartMinute, locale)}–${clock(r.shiftEndMinute % 1440, locale)}`, count: r.headcount })}
                {r.endsOn ? ` ${t("until", { end: shortDate(r.endsOn, locale) })}` : ""}
              </span>
              {(r.worksiteName ?? r.worksiteNote) && <span className="text-muted-foreground">{r.worksiteName ?? t("siteNote", { note: r.worksiteNote ?? "" })}</span>}
              {r.notes && <span className="whitespace-pre-wrap text-muted-foreground">{r.notes}</span>}
            </div>
            {mayDecide && (
              <div className="ml-auto flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setDeclining(r)} data-testid="staff-request-decline">
                  {t("decline")}
                </Button>
                <Button size="sm" onClick={() => setAccepting(r)} data-testid="staff-request-accept">
                  {t("create")}
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {accepting && <Accept request={accepting} onClose={() => setAccepting(null)} />}
      {declining && <Decline request={declining} onClose={() => setDeclining(null)} />}
    </section>
  );
}

function Accept({ request, onClose }: { request: StaffRequestView; onClose: () => void }) {
  const t = useTranslations("staffRequests");
  const router = useRouter();
  const id = useId();
  const [site, setSite] = useState(request.worksiteId ?? request.worksites[0]?.id ?? "");
  const [pending, start] = useTransition();
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("acceptTitle")}</DialogTitle>
          <DialogDescription>{t("acceptBody")}</DialogDescription>
        </DialogHeader>
        {request.worksites.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noWorksite")}</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-site`}>{t("worksite")}</Label>
            <NativeSelect id={`${id}-site`} value={site} onChange={(e) => setSite(e.target.value)} data-testid="staff-request-site">
              {request.worksites.map((w) => (
                <NativeSelectOption key={w.id} value={w.id}>
                  {w.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            {request.worksiteNote && <p className="text-[13px] text-muted-foreground">{t("siteNote", { note: request.worksiteNote })}</p>}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button
            disabled={!site}
            loading={pending}
            loadingLabel={t("acceptSubmit")}
            data-testid="staff-request-accept-confirm"
            onClick={() =>
              start(async () => {
                const r = await acceptStaffRequestAction(request.id, site);
                if (r.ok) {
                  toast.success(t("created"));
                  onClose();
                  router.refresh();
                } else toast.error(t.has(`errors.${r.error}`) ? t(`errors.${r.error}`) : t("errors.generic"));
              })
            }
          >
            {t("acceptSubmit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Decline({ request, onClose }: { request: StaffRequestView; onClose: () => void }) {
  const t = useTranslations("staffRequests");
  const router = useRouter();
  const id = useId();
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("declineTitle")}</DialogTitle>
          <DialogDescription>{request.position}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-reason`}>{t("reason")}</Label>
          <Textarea id={`${id}-reason`} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={2000} rows={3} data-testid="staff-request-reason" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button
            variant="destructive"
            disabled={!reason.trim()}
            loading={pending}
            loadingLabel={t("declineSubmit")}
            data-testid="staff-request-decline-confirm"
            onClick={() =>
              start(async () => {
                const r = await declineStaffRequestAction(request.id, reason);
                if (r.ok) {
                  toast.success(t("declined"));
                  onClose();
                  router.refresh();
                } else toast.error(t.has(`errors.${r.error}`) ? t(`errors.${r.error}`) : t("errors.generic"));
              })
            }
          >
            {t("declineSubmit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
