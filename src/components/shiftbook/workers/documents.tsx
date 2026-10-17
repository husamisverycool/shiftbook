"use client";

// Pattern: docs/patterns/workers/[id].md — the Documents tab: the worker's files (name, kind,
// effective date, added by and when), Add document, Remove (the file is kept); the Owner opens a file
// with a business reason, recorded like Retrieve SSN (a W-4 holds the SSN).
import { FileLockIcon, PlusIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useId, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { addDocumentAction, openDocumentAction, removeDocumentAction } from "@/app/[locale]/(app)/workers/actions";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useRouter } from "@/i18n/navigation";
import { WORKER_DOCUMENT_KINDS, type WorkerDocumentKind } from "@/lib/worker-documents";
import type { WorkerProfile } from "@/server/workers/queries";
import { useCan } from "../abilities";
import { useConfirmed } from "../auth/confirm-access";
import { mediumDate } from "./dates";
import { FieldError, useWorkerFailure } from "./results";
import { Section } from "./worker-profile";
import { useDateTime } from "../agency-zone";

type Doc = WorkerProfile["documents"][number];
const RULES = ["form", "kind", "file_type", "file_size", "file_name", "effective_on"] as const;

export function DocumentsTab({ profile, today, mayChange }: { profile: WorkerProfile; today: string; mayChange: boolean }) {
  const t = useTranslations("workers.profile.documents");
  const locale = useLocale();
  const when = useDateTime();
  const router = useRouter();
  const failure = useWorkerFailure();
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<Doc | null>(null);
  const [opening, setOpening] = useState<Doc | null>(null);
  // Decision 0027: a worker's file holds the SSN or bank details; the Owner opens it, with a reason.
  const mayOpen = useCan()("revealSsn");
  const [pending, start] = useTransition();
  const tp = useTranslations("workers.profile");
  const remove = (d: Doc) =>
    start(async () => {
      const r = await removeDocumentAction(profile.id, d.id);
      if (r.ok) {
        toast.success(t("removed"));
        setRemoving(null);
        router.refresh();
      } else failure(r);
    });
  const add = mayChange ? (
    <Button size="sm" onClick={() => setAdding(true)} data-testid="add-document">
      <PlusIcon />
      {t("add")}
    </Button>
  ) : null;

  return (
    <Section title={t("title")} testId="documents" actions={profile.documents.length > 0 ? add : null}>
      {!mayOpen && <p className="text-sm text-muted-foreground">{t("openOnly")}</p>}
      {profile.documents.length === 0 ? (
        <div className="flex flex-col items-start gap-3 text-sm" data-testid="documents-empty">
          <p className="text-muted-foreground">{t("empty")}</p>
          {add}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table aria-label={t("title")} data-testid="documents-list">
            <TableHeader>
              <TableRow>
                <TableHead>{t("name")}</TableHead>
                <TableHead>{t("kind")}</TableHead>
                <TableHead>{t("effectiveOn")}</TableHead>
                <TableHead>{t("added")}</TableHead>
                {mayChange && <TableHead className="w-0" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {profile.documents.map((d) => (
                <TableRow key={d.id} data-testid="document-row">
                  <TableCell className="max-w-72 font-medium">
                    {mayOpen ? (
                      <button type="button" onClick={() => setOpening(d)} className="inline-flex max-w-full items-center gap-1.5 rounded-sm text-left underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring" aria-label={t("open", { name: d.filename })} data-testid="open-document">
                        <FileLockIcon className="size-4 shrink-0 text-muted-foreground" />
                        <span className="truncate">{d.filename}</span>
                      </button>
                    ) : (
                      <span className="block truncate">{d.filename}</span>
                    )}
                  </TableCell>
                  <TableCell>{t(`kinds.${d.kind}`)}</TableCell>
                  <TableCell className="tabular-nums">{mediumDate(d.effectiveOn, locale)}</TableCell>
                  <TableCell className="text-muted-foreground">{t("addedBy", { who: d.addedBy, date: when(d.addedAt) })}</TableCell>
                  {mayChange && (
                    <TableCell>
                      <Button size="sm" variant="ghost" onClick={() => setRemoving(d)} data-testid="remove-document">
                        {t("remove")}
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {adding && <AddDocumentDialog workerId={profile.id} today={today} onClose={() => setAdding(false)} />}
      {opening && <OpenDocumentDialog workerId={profile.id} doc={opening} onClose={() => setOpening(null)} />}
      <AlertDialog open={removing !== null} onOpenChange={(open) => !open && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("removeTitle", { name: removing?.filename ?? "" })}</AlertDialogTitle>
            <AlertDialogDescription>{t("removeBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tp("cancel")}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={pending} onClick={() => removing && remove(removing)} data-testid="confirm-remove-document">
              {t("remove")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Section>
  );
}

function AddDocumentDialog({ workerId, today, onClose }: { workerId: string; today: string; onClose: () => void }) {
  const t = useTranslations("workers.profile.documents");
  const tc = useTranslations("common");
  const tp = useTranslations("workers.profile");
  const id = useId();
  const router = useRouter();
  const failure = useWorkerFailure();
  const file = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<WorkerDocumentKind>("w4");
  const [effectiveOn, setEffectiveOn] = useState(today);
  const [rule, setRule] = useState<(typeof RULES)[number] | null>(null);
  const [pending, start] = useTransition();
  const fieldOf = (r: typeof rule) => (r === "effective_on" ? "effective" : r === "kind" ? "kind" : r === null ? null : "file");
  const save = () =>
    start(async () => {
      const chosen = file.current?.files?.[0];
      if (!chosen) {
        setRule("form");
        return;
      }
      const form = new FormData();
      form.set("file", chosen);
      form.set("kind", kind);
      form.set("effectiveOn", effectiveOn);
      const r = await addDocumentAction(workerId, form);
      if (r.ok) {
        toast.success(t("saved"));
        onClose();
        router.refresh();
      } else if (r.error === "invalid" && "field" in r) setRule((RULES as readonly string[]).includes(r.field) ? (r.field as (typeof RULES)[number]) : "form");
      else failure(r);
    });
  const invalid = (field: string) => (fieldOf(rule) === field ? { "aria-invalid": true, "aria-describedby": `${id}-error` } : {});

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("add")}</DialogTitle>
          <DialogDescription>{t("hint")}</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${id}-file`}>{t("file")}</Label>
            <Input id={`${id}-file`} ref={file} type="file" accept=".pdf,.png,.jpg,.jpeg,.csv,.txt,.xlsx,.docx" onChange={() => setRule(null)} {...invalid("file")} data-testid="document-file" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${id}-kind`}>{t("kind")}</Label>
              <NativeSelect className="w-full" id={`${id}-kind`} value={kind} onChange={(e) => setKind(e.target.value as WorkerDocumentKind)} {...invalid("kind")} data-testid="document-kind">
                {WORKER_DOCUMENT_KINDS.map((k) => (
                  <NativeSelectOption key={k} value={k}>
                    {t(`kinds.${k}`)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${id}-effective`}>{t("effectiveOn")}</Label>
              <Input id={`${id}-effective`} type="date" value={effectiveOn} onChange={(e) => setEffectiveOn(e.target.value)} {...invalid("effective")} data-testid="document-effective" />
            </div>
          </div>
          {rule && <FieldError id={`${id}-error`} text={t(`rules.${rule}`)} />}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {tp("cancel")}
            </Button>
            <Button type="submit" disabled={pending} data-testid="save-document" loading={pending} loadingLabel={tc("loading")}>
              {t("add")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Toast's Retrieve SSN steps for a file that holds it: the business reason, then the file downloads. */
function OpenDocumentDialog({ workerId, doc, onClose }: { workerId: string; doc: Doc; onClose: () => void }) {
  const t = useTranslations("workers.profile.documents");
  const tc = useTranslations("common");
  const tw = useTranslations("workers");
  const tr = useTranslations("workers.profile.reveal");
  const id = useId();
  const router = useRouter();
  const failure = useWorkerFailure();
  const confirmed = useConfirmed();
  const [reason, setReason] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const open = () =>
    start(async () => {
      if (reason.trim() === "") {
        setProblem(tw("errors.reason_required"));
        return;
      }
      const r = await confirmed(() => openDocumentAction(workerId, doc.id, reason));
      if (!r) return;
      if (r.ok && "url" in r) {
        // The grant lasts two minutes and works only for this person: the download starts now.
        const a = document.createElement("a");
        a.href = r.url;
        a.download = doc.filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        onClose();
        router.refresh();
      } else if (!r.ok && r.error === "reason_required") setProblem(tw("errors.reason_required"));
      else if (!r.ok && r.error === "invalid" && "rule" in r && r.rule === "has_ssn") setProblem(tw("fields.reasonSsn"));
      else if (!r.ok && r.error === "invalid") setProblem(tw("fields.reason"));
      else failure(r);
    });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("openTitle", { name: doc.filename })}</DialogTitle>
          <DialogDescription>{t("openDescription")}</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-2"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            open();
          }}
        >
          <Label htmlFor={`${id}-reason`}>{tr("reason")}</Label>
          <Input id={`${id}-reason`} value={reason} onChange={(e) => setReason(e.target.value)} autoComplete="off" autoFocus maxLength={500} aria-invalid={problem ? true : undefined} aria-describedby={problem ? `${id}-reason-error` : `${id}-reason-hint`} data-testid="open-reason" />
          {problem ? (
            <FieldError id={`${id}-reason-error`} text={problem} />
          ) : (
            <p id={`${id}-reason-hint`} className="text-sm text-muted-foreground">
              {tr("reasonHint")}
            </p>
          )}
          <DialogFooter className="mt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              {tw("profile.cancel")}
            </Button>
            <Button type="submit" disabled={pending} data-testid="open-document-confirm" loading={pending} loadingLabel={tc("loading")}>
              {t("openConfirm")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
