"use client";

/**
 * Upload step from docs/patterns/inbox.md (Dext "Add documents" panel → Processing → list; Expensify
 * reading states). Refused files are listed with their reason at once; accepted files are read in
 * the background and the list refreshes until reading is done.
 */
import { CircleAlertIcon, FileTextIcon, Loader2Icon, UploadIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";
import { archiveAction, retryAction, uploadTimesheets, type UploadResult } from "@/app/[locale]/(app)/convert/actions";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { useRouter } from "@/i18n/navigation";
import { REFUSAL_MESSAGE, type ActionRefusal } from "./types";

export interface UploadDoc {
  id: string;
  filename: string;
  kind: string;
  status: "received" | "reading" | "read" | "failed" | "archived";
  /** Its reading stopped part-way: shown like a failed reading, with Retry and Archive. */
  stuck: boolean;
  error: string | null;
  clientName: string | null;
  entries: number;
  needsReview: number;
}

export function UploadStep({ periodId, documents }: { periodId: string; documents: UploadDoc[] }) {
  const t = useTranslations("convert.upload");
  const tcommon = useTranslations("common");
  const tc = useTranslations("convert.errors");
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [refused, setRefused] = useState<UploadResult["refused"]>([]);
  const [uploading, start] = useTransition();
  const failed = (d: UploadDoc) => d.status === "failed" || d.stuck;
  const processing = documents.filter((d) => (d.status === "received" || d.status === "reading") && !d.stuck);
  const done = documents.filter((d) => d.status === "read" || d.status === "archived" || failed(d));
  const [archiving, setArchiving] = useState<UploadDoc | null>(null);
  const [archiveReason, setArchiveReason] = useState("");
  const run = (fn: () => Promise<{ ok: true } | { error: ActionRefusal }>) =>
    start(async () => {
      const r = await fn();
      if ("error" in r) toast.error(tc(REFUSAL_MESSAGE[r.error]));
      router.refresh();
    });

  // Keep the list fresh while files are being read.
  useEffect(() => {
    if (processing.length === 0) return;
    const timer = setInterval(() => router.refresh(), 1500);
    return () => clearInterval(timer);
  }, [processing.length, router]);

  const send = (files: FileList | File[]) => {
    const list = [...files];
    if (list.length === 0) return;
    const form = new FormData();
    for (const f of list) form.append("files", f);
    start(async () => {
      const result = await uploadTimesheets(periodId, form);
      setRefused(result.refused);
      if (result.locked) toast.error(tc("periodLocked"));
      if (result.busy) toast.error(tc("busy"));
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-8">
      <section aria-label={t("dropTitle")} className="flex flex-col gap-3">
        <div
          data-testid="drop-zone"
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            send(e.dataTransfer.files);
          }}
          className={`flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-10 text-center transition-colors ${dragging ? "border-primary bg-muted" : ""}`}
        >
          {uploading ? <Loader2Icon className="size-6 animate-spin text-muted-foreground" /> : <UploadIcon className="size-6 text-muted-foreground" />}
          <p className="font-medium">{uploading ? t("uploading") : t("dropTitle")}</p>
          <p className="max-w-prose text-sm text-muted-foreground">{t("dropBody")}</p>
          <input
            ref={input}
            type="file"
            multiple
            className="sr-only"
            aria-label={t("select")}
            tabIndex={-1}
            data-testid="file-input"
            accept=".jpg,.jpeg,.png,.heic,.heif,.pdf,.csv,.xlsx"
            onChange={(e) => {
              if (e.target.files) send(e.target.files);
              e.target.value = "";
            }}
          />
          <Button variant="outline" onClick={() => input.current?.click()} disabled={uploading}>
            {t("select")}
          </Button>
        </div>
        {refused.length > 0 && (
          <div className="flex flex-col gap-1 rounded-lg border p-3 text-sm" data-testid="refused">
            <p className="font-medium">{t("refused")}</p>
            <ul className="flex flex-col gap-0.5">
              {refused.map((r) => (
                <li key={r.filename} className="text-muted-foreground">
                  {r.filename} — {t(r.reason)}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {processing.length > 0 && (
        <section className="flex flex-col gap-2" data-testid="processing">
          <h2 className="text-lg font-semibold">{t("processing")}</h2>
          <p className="text-sm text-muted-foreground">{t("processingBody", { count: processing.length })}</p>
          <ul className="flex flex-col gap-1">
            {processing.map((d) => (
              <li key={d.id} className="flex items-center gap-2 text-sm">
                <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
                {d.filename}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t("documents")}</h2>
        {done.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-sm text-muted-foreground">
            <FileTextIcon className="size-5" />
            <p>{t("empty")}</p>
          </div>
        ) : (
          <div className="rounded-lg border">
            <Table aria-label={t("documents")}>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("colFile")}</TableHead>
                  <TableHead>{t("colKind")}</TableHead>
                  <TableHead>{t("colStatus")}</TableHead>
                  <TableHead>{t("colClient")}</TableHead>
                  <TableHead className="text-right">{t("colEntries")}</TableHead>
                  <TableHead className="text-right">{t("colReview")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {done.map((d) => (
                  <TableRow key={d.id} data-testid="document-row">
                    <TableCell className="max-w-64 truncate font-medium" title={d.filename}>
                      {d.filename}
                    </TableCell>
                    <TableCell>{t(`kind.${d.kind}`)}</TableCell>
                    <TableCell>
                      {failed(d) ? (
                        <div className="flex flex-col gap-1">
                          <span className="flex items-center gap-1.5 text-destructive">
                            <CircleAlertIcon className="size-4" />
                            {t("status.failed")}
                          </span>
                          {(d.stuck || d.error) && <span className="max-w-80 text-xs whitespace-normal text-muted-foreground">{d.stuck ? t("stuck") : d.error}</span>}
                          <div className="flex gap-3">
                            <Button variant="link" size="sm" className="h-auto justify-start px-0" onClick={() => run(() => retryAction(d.id))}>
                              {tcommon("retry")}
                            </Button>
                            <Button variant="link" size="sm" className="h-auto justify-start px-0" onClick={() => setArchiving(d)} data-testid="archive">
                              {t("archive")}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <Badge variant="secondary">{t(`status.${d.status}`)}</Badge>
                      )}
                    </TableCell>
                    <TableCell>{d.clientName ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{d.entries}</TableCell>
                    <TableCell className="text-right tabular-nums">{d.needsReview}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <Dialog open={archiving !== null} onOpenChange={(open) => !open && setArchiving(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("archiveTitle")}</DialogTitle>
            <DialogDescription>{t("archiveBody")}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="archive-reason">{t("archiveReason")}</Label>
            <Textarea id="archive-reason" value={archiveReason} onChange={(e) => setArchiveReason(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setArchiving(null)}>
              {tcommon("cancel")}
            </Button>
            <Button
              disabled={uploading || archiveReason.trim() === ""}
              data-testid="confirm-archive"
              onClick={() => {
                const doc = archiving;
                if (!doc) return;
                setArchiving(null);
                setArchiveReason("");
                run(() => archiveAction(doc.id, archiveReason));
              }}
            >
              {t("archiveConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
