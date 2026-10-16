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
import { unzipSync } from "fflate";
import { isNoRecording } from "@/lib/no-recording";
import { toast } from "sonner";
import { useRouter } from "@/i18n/navigation";
import { MAX_TIMESHEET_BYTES } from "@/lib/limits";
import { useCan } from "../abilities";
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

const MEDIA_TYPES: Record<string, string> = { csv: "text/csv", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", heic: "image/heic", heif: "image/heif", pdf: "application/pdf", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };

export function UploadStep({ periodId, documents, demo = false }: { periodId: string; documents: UploadDoc[]; demo?: boolean }) {
  const t = useTranslations("convert.upload");
  const tcommon = useTranslations("common");
  const tc = useTranslations("convert.errors");
  const router = useRouter();
  const mayChange = useCan()("hours");
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [refused, setRefused] = useState<UploadResult["refused"]>([]);
  const [uploading, start] = useTransition();
  const failed = (d: UploadDoc) => d.status === "failed" || d.stuck;
  const processing = documents.filter((d) => (d.status === "received" || d.status === "reading") && !d.stuck);
  const done = documents.filter((d) => d.status === "read" || d.status === "archived" || failed(d));
  // One timesheet, or every one that could not be read (Dext's inbox: a bulk action with one reason).
  const [archiving, setArchiving] = useState<UploadDoc | "unreadable" | null>(null);
  const unreadable = documents.filter(failed);
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

  // Demo only (decision 0031): the sample timesheets go into the same upload as dropped files.
  const [fetchingSamples, startSamples] = useTransition();
  const loadSamples = () =>
    startSamples(async () => {
      const response = await fetch("/api/demo/samples");
      if (!response.ok) return void toast.error(tcommon("retry"));
      const zip = unzipSync(new Uint8Array(await response.arrayBuffer()));
      const files = Object.entries(zip)
        .filter(([path, bytes]) => !path.endsWith("/") && bytes.length > 0)
        .map(([path, bytes]) => new File([bytes as BlobPart], path.split("/").pop()!, { type: MEDIA_TYPES[path.split(".").pop()!.toLowerCase()] ?? "application/octet-stream" }));
      send(files);
    });

  // One file per request, so a batch never meets the request size limit; files over the limit are
  // refused here with the same reason the server gives.
  const send = (files: FileList | File[]) => {
    const list = [...files];
    if (list.length === 0) return;
    start(async () => {
      const refusedNow: UploadResult["refused"] = [];
      for (const f of list) {
        if (f.size > MAX_TIMESHEET_BYTES) {
          refusedNow.push({ filename: f.name, reason: "tooLarge" });
          continue;
        }
        const form = new FormData();
        form.append("files", f);
        const result = await uploadTimesheets(periodId, form);
        refusedNow.push(...result.refused);
        if (result.locked) {
          toast.error(tc("periodLocked"));
          break;
        }
        if (result.busy) {
          toast.error(tc("busy"));
          break;
        }
      }
      setRefused(refusedNow);
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-8">
      {mayChange && (
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
          {demo && documents.length === 0 && (
            <p className="text-sm text-muted-foreground">
              {t("demoSamples")}{" "}
              <Button variant="link" className="h-auto p-0 text-foreground underline underline-offset-4" onClick={loadSamples} disabled={uploading || fetchingSamples} data-testid="use-samples">
                {t("useSamples")}
              </Button>
            </p>
          )}
          {refused.length > 0 && (
            <div className="flex flex-col gap-1 rounded-xl border bg-card p-3 text-sm" data-testid="refused">
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
      )}

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
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="mr-auto text-lg font-semibold">{t("documents")}</h2>
          {mayChange && unreadable.length >= 2 && (
            <Button size="sm" variant="outline" onClick={() => setArchiving("unreadable")} disabled={uploading} data-testid="archive-unreadable">
              {t("archiveUnreadable", { count: unreadable.length })}
            </Button>
          )}
        </div>
        {done.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-sm text-muted-foreground">
            <FileTextIcon className="size-5" />
            <p>{t("empty")}</p>
          </div>
        ) : (
          <div className="min-w-0">
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
                          {(d.stuck || d.error) && <span className="max-w-80 text-xs whitespace-normal text-muted-foreground">{d.stuck ? t("stuck") : isNoRecording(d.error) ? t("noRecording") : d.error}</span>}
                          {mayChange && (
                            <div className="flex gap-3">
                              <Button variant="link" size="sm" className="h-auto justify-start px-0" onClick={() => run(() => retryAction(d.id))}>
                                {tcommon("retry")}
                              </Button>
                              <Button variant="link" size="sm" className="h-auto justify-start px-0" onClick={() => setArchiving(d)} data-testid="archive">
                                {t("archive")}
                              </Button>
                            </div>
                          )}
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
            <DialogTitle>{archiving === "unreadable" ? t("archiveAllTitle", { count: unreadable.length }) : t("archiveTitle")}</DialogTitle>
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
                const target = archiving;
                const reason = archiveReason;
                if (!target) return;
                setArchiving(null);
                setArchiveReason("");
                if (target !== "unreadable") return run(() => archiveAction(target.id, reason));
                // Each through the same archive as one at a time; the first refusal stops the rest.
                run(async () => {
                  for (const doc of unreadable) {
                    const r = await archiveAction(doc.id, reason);
                    if ("error" in r) return r;
                  }
                  return { ok: true as const };
                });
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
