"use client";

// Pattern: docs/patterns/workers/[id].md — the Employment tab: Status (Toast's status change: End
// employment / Rehire; the record is kept), Hire date and Form I-9 (dates only), Assignments.
import { TriangleAlertIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { recordI9Action } from "@/app/[locale]/(app)/compliance/actions";
import { endEmploymentAction, rehireAction } from "@/app/[locale]/(app)/workers/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link, useRouter } from "@/i18n/navigation";
import type { WorkerProfile } from "@/server/workers/queries";
import { longDate } from "../format";
import { mediumDate } from "./dates";
import { FieldError, useWorkerFailure } from "./results";
import { EditButtons, Facts, Section, useEscapeCancels } from "./worker-profile";

const I9_FIELDS = ["hireDate", "section1On", "section2On", "workAuthExpiresOn"] as const;
type I9Field = (typeof I9_FIELDS)[number];

export function EmploymentTab({ profile, today, mayChange }: { profile: WorkerProfile; today: string; mayChange: boolean }) {
  return (
    <>
      <StatusSection profile={profile} today={today} mayChange={mayChange} />
      <I9Section profile={profile} mayChange={mayChange} />
      <AssignmentsSection profile={profile} today={today} />
    </>
  );
}

function StatusSection({ profile, today, mayChange }: { profile: WorkerProfile; today: string; mayChange: boolean }) {
  const t = useTranslations("workers.profile.employment");
  const tc = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const failure = useWorkerFailure();
  const [ending, setEnding] = useState(false);
  const [pending, start] = useTransition();
  const name = `${profile.firstName} ${profile.lastName}`;
  const rehire = () =>
    start(async () => {
      const r = await rehireAction(profile.id);
      if (r.ok) {
        toast.success(t("rehired", { name }));
        router.refresh();
      } else failure(r);
    });

  return (
    <Section
      title={t("status")}
      testId="employment-status"
      actions={
        mayChange ? (
          profile.status === "active" ? (
            <Button size="sm" variant="outline" onClick={() => setEnding(true)} data-testid="end-employment">
              {t("end")}
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={rehire} disabled={pending} data-testid="rehire" loading={pending} loadingLabel={tc("loading")}>
              {t("rehire")}
            </Button>
          )
        ) : null
      }
    >
      <p className="text-sm" data-testid="employment-line">
        {profile.status === "ended" ? t("endedOn", { date: longDate(profile.endedOn!, locale) }) : profile.hireDate ? t("activeSince", { date: longDate(profile.hireDate, locale) }) : t("active")}
      </p>
      {ending && <EndDialog profile={profile} today={today} onClose={() => setEnding(false)} />}
    </Section>
  );
}

function EndDialog({ profile, today, onClose }: { profile: WorkerProfile; today: string; onClose: () => void }) {
  const t = useTranslations("workers");
  const tc = useTranslations("common");
  const locale = useLocale();
  const id = useId();
  const router = useRouter();
  const failure = useWorkerFailure();
  const [endedOn, setEndedOn] = useState(today);
  const [wrong, setWrong] = useState(false);
  const [pending, start] = useTransition();
  const current = profile.placements.filter((p) => p.current).length;
  const name = `${profile.firstName} ${profile.lastName}`;
  const end = () =>
    start(async () => {
      const r = await endEmploymentAction(profile.id, endedOn);
      if (r.ok) {
        toast.success(t("profile.employment.ended", { date: longDate(endedOn, locale) }));
        onClose();
        router.refresh();
      } else if (r.error === "invalid") setWrong(true);
      else failure(r);
    });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("profile.employment.endTitle", { name })}</DialogTitle>
          <DialogDescription>{t("profile.employment.endDescription")}</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            end();
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${id}-ended`}>{t("profile.employment.endedOnLabel")}</Label>
            <Input id={`${id}-ended`} type="date" value={endedOn} min={profile.hireDate ?? undefined} max={today} onChange={(e) => setEndedOn(e.target.value)} className="w-48" aria-invalid={wrong ? true : undefined} aria-describedby={wrong ? `${id}-ended-error` : undefined} data-testid="ended-on" />
            {wrong && <FieldError id={`${id}-ended-error`} text={t("fields.endedOn")} />}
          </div>
          {current > 0 && (
            <Alert data-testid="current-assignments">
              <TriangleAlertIcon />
              <AlertDescription>{t("profile.employment.currentPlacements", { count: current })}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t("profile.cancel")}
            </Button>
            <Button type="submit" variant="destructive" disabled={pending} data-testid="confirm-end" loading={pending} loadingLabel={tc("loading")}>
              {t("profile.employment.endConfirm")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function I9Section({ profile, mayChange }: { profile: WorkerProfile; mayChange: boolean }) {
  const t = useTranslations("workers.profile.employment.i9");
  const tw = useTranslations("workers");
  const locale = useLocale();
  const id = useId();
  const router = useRouter();
  const failure = useWorkerFailure();
  const stored = (): Record<I9Field, string> => ({ hireDate: profile.hireDate ?? "", section1On: profile.i9Section1On ?? "", section2On: profile.i9Section2On ?? "", workAuthExpiresOn: profile.workAuthExpiresOn ?? "" });
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState(stored);
  const [field, setField] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const cancel = useCallback(() => {
    setEditing(false);
    setField(null);
  }, []);
  useEscapeCancels(editing, cancel);
  const open = () => {
    setValues(stored());
    setEditing(true);
  };
  const save = () =>
    start(async () => {
      const orNull = (v: string) => (v === "" ? null : v);
      const r = await recordI9Action(profile.id, { hireDate: orNull(values.hireDate), section1On: orNull(values.section1On), section2On: orNull(values.section2On), workAuthExpiresOn: orNull(values.workAuthExpiresOn) });
      if (r.ok) {
        toast.success(tw("profile.saved"));
        cancel();
        router.refresh();
      } else if (r.error === "invalid" && r.field) setField(r.field);
      else failure(r);
    });

  return (
    <Section title={t("title")} testId="i9" onEdit={mayChange ? open : undefined} editing={editing}>
      <p className="text-sm text-muted-foreground">{t("hint")}</p>
      {editing ? (
        <form
          className="flex flex-col gap-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            {I9_FIELDS.map((f, i) => (
              <div key={f} className="flex flex-col gap-2">
                <Label htmlFor={`${id}-${f}`}>{t(f)}</Label>
                <Input
                  id={`${id}-${f}`}
                  type="date"
                  value={values[f]}
                  onChange={(e) => setValues((v) => ({ ...v, [f]: e.target.value }))}
                  autoFocus={i === 0}
                  aria-invalid={field === f ? true : undefined}
                  aria-describedby={field === f ? `${id}-${f}-error` : undefined}
                  data-testid={`i9-${f}`}
                />
                {field === f && <FieldError id={`${id}-${f}-error`} text={t(`rules.${f}`)} />}
              </div>
            ))}
          </div>
          <EditButtons pending={pending} onCancel={cancel} testId="i9" />
        </form>
      ) : (
        <Facts rows={I9_FIELDS.map((f) => [t(f), stored()[f] ? longDate(stored()[f], locale) : "—"])} />
      )}
    </Section>
  );
}

function AssignmentsSection({ profile, today }: { profile: WorkerProfile; today: string }) {
  const t = useTranslations("workers.profile.employment.placements");
  const locale = useLocale();
  const state = (p: WorkerProfile["placements"][number]) => (p.status === "cancelled" ? "cancelled" : p.current ? "current" : p.startDate > today ? "upcoming" : "past");

  return (
    <Section title={t("title")} testId="assignments">
      {profile.placements.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("none")}</p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table aria-label={t("title")}>
            <TableHeader>
              <TableRow>
                <TableHead>{t("job")}</TableHead>
                <TableHead>{t("client")}</TableHead>
                <TableHead>{t("dates")}</TableHead>
                <TableHead>{t("status")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {profile.placements.map((p) => (
                <TableRow key={p.id} data-testid="worker-assignment">
                  <TableCell className="font-medium">
                    <Link href={`/job-orders/${p.jobOrderId}?tab=assignments`} className="underline-offset-4 hover:underline rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
                      {p.position}
                    </Link>
                  </TableCell>
                  <TableCell>{p.clientName}</TableCell>
                  <TableCell className="tabular-nums">{p.endDate ? t("between", { from: mediumDate(p.startDate, locale), to: mediumDate(p.endDate, locale) }) : t("from", { date: mediumDate(p.startDate, locale) })}</TableCell>
                  <TableCell>
                    <Badge variant={state(p) === "current" ? "secondary" : "outline"}>{t(state(p))}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Section>
  );
}
