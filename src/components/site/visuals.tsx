// The website's product pictures (slice aa), built from the app's own pieces the way Linear builds its
// hero from real interface elements, with the demo agency's sample data (Cedar Row Staffing, the week
// of October 5, 2026: the Prairie Line sign-in sheet of October 6, the control totals and margin of
// that week's run). Pattern: docs/patterns/site.md.
import { FileSpreadsheetIcon, FileTextIcon, ImageIcon, TableIcon } from "lucide-react";
import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { Avatar, ColorDot } from "@/components/shiftbook/avatar";
import { Status } from "@/components/shiftbook/status";
import { cn } from "@/lib/utils";

/** The October 6 sheet as Tabulado read it: as written, the roster's worker, how it matched, the times. */
const SHEET_ROWS = [
  { written: "Bob Jones", worker: "Robert Jones", match: "nickname", in: "3:00 PM", out: "11:30 PM", lunch: "30", hours: "8:00", flagged: true },
  { written: "Maria Fernandez", worker: "María José Fernández Ruiz", match: "accents", in: "3:00 PM", out: "11:30 PM", lunch: "30", hours: "8:00" },
  { written: "Chuy Delgado", worker: "Jesús Delgado", match: "nickname", in: "3:00 PM", out: "11:30 PM", lunch: "30", hours: "8:00" },
  { written: "Andre Lewis", worker: "Andre Lewis", in: "3:00 PM", out: "11:30 PM", lunch: "30", hours: "8:00" },
  { written: "Tran Nguyen", worker: "Tran Nguyen", in: "2:00 PM", out: "11:30 PM", lunch: "30", hours: "9:00" },
  { written: "K. Bondarenko", worker: "Kateryna Bondarenko", match: "initial", in: "3:00 PM", out: "11:00 PM", lunch: "30", hours: "7:30" },
] as const;

const TH = "px-3 py-2 text-left text-xs font-medium text-muted-foreground whitespace-nowrap";
const TD = "px-3 py-2.5 align-middle whitespace-nowrap";

/** The hero: the photographed sheet beside the hours read from it, one cell held for a person. */
export async function ReviewVisual() {
  const t = await getTranslations("site.frame");
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.35fr)]">
      <div className="flex items-center border-b bg-muted/40 p-4 lg:border-r lg:border-b-0">
        <div className="relative w-full">
          <Image src="/site/sign-in-sheet.jpg" alt={t("photo")} width={900} height={555} priority className="h-auto w-full rounded-md border" sizes="(min-width: 1024px) 480px, 100vw" />
          {/* Where the held cell sits on the photo: row 1's total, under the coffee ring. */}
          <span aria-hidden className="absolute top-[34.5%] left-[68.5%] h-[8%] w-[11%] rounded-sm ring-2 ring-amber-500/80" />
        </div>
      </div>
      <div className="flex min-w-0 flex-col">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b px-4 py-3">
          <div>
            <p className="text-sm font-semibold">{t("title")}</p>
            <p className="text-xs text-muted-foreground">{t("subtitle")}</p>
          </div>
          <Status tone="neutral">{t("sample")}</Status>
        </div>
        <div className="min-w-0 overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <thead className="border-b bg-muted/40">
              <tr>
                <th className={TH}>{t("worker")}</th>
                <th className={TH}>{t("in")}</th>
                <th className={TH}>{t("out")}</th>
                <th className={cn(TH, "text-right")}>{t("hours")}</th>
                <th className={TH}>{t("status")}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {SHEET_ROWS.map((r) => (
                <tr key={r.written} className={cn("flagged" in r && "bg-amber-50/70 dark:bg-amber-950/30")}>
                  <td className={TD}>
                    <div className="flex items-center gap-2">
                      <Avatar name={r.worker} size={24} />
                      <div className="min-w-0">
                        <p className="truncate font-medium">{r.worker}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          “{r.written}”{"match" in r && <> · {t(r.match)}</>}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className={TD}>{r.in}</td>
                  <td className={TD}>{r.out}</td>
                  <td className={cn(TD, "text-right font-medium")}>
                    {"flagged" in r ? <span className="rounded-sm px-1 ring-2 ring-amber-500/80">{r.hours}</span> : r.hours}
                  </td>
                  <td className={TD}>{"flagged" in r ? <Status tone="warning">{t("check")}</Status> : <Status tone="success">{t("ready")}</Status>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t bg-amber-50/60 px-4 py-3 text-sm dark:bg-amber-950/25">
          <p className="min-w-0 flex-1 text-amber-900 dark:text-amber-100">{t("disagree")}</p>
          <span aria-hidden className="inline-flex h-7 items-center rounded-md border bg-background px-2.5 text-xs font-medium">
            {t("keep")}
          </span>
        </div>
      </div>
    </div>
  );
}

const FILES = [
  { key: "photo", name: "Prairie Line · sign-in sheets", detail: "photos", count: 5, Icon: ImageIcon, flagged: true },
  { key: "clock", name: "Prairie Line · time clock", detail: "csv", Icon: TableIcon },
  { key: "pdf", name: "Harborview · weekly hours (signed)", detail: "pdf", Icon: FileTextIcon },
  { key: "portal", name: "Pacific Crest · approved time sheets", detail: "csv", Icon: FileSpreadsheetIcon },
] as const;

/** Step 1: this week's files, each read twice. */
export async function UploadVisual() {
  const t = await getTranslations("site.frame");
  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <p className="text-sm font-semibold">{t("uploadTitle")}</p>
        <Status tone="neutral">{t("sample")}</Status>
      </div>
      <ul className="divide-y">
        {FILES.map((f) => (
          <li key={f.key} className="flex items-center gap-3 px-4 py-3 text-sm">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md border bg-muted/50">
              <f.Icon aria-hidden className="size-4 text-muted-foreground" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{f.name}</p>
              <p className="truncate text-xs text-muted-foreground">{"count" in f ? t("photos", { count: f.count }) : t(`kinds.${f.key}`)}</p>
            </div>
            {"flagged" in f ? <Status tone="warning">{t("flagged")}</Status> : <Status tone="success">{t("readTwice")}</Status>}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Step 2: the only things a person looks at. */
export async function ExceptionsVisual() {
  const t = await getTranslations("site.frame");
  const items = [
    { title: t("exception1"), note: t("exception1Note"), tone: "warning" as const, label: t("check") },
    { title: t("exception2"), note: t("exception2Note"), tone: "info" as const, label: t("accents") },
    { title: t("exception3"), note: t("exception3Note"), tone: "neutral" as const, label: "OT" },
  ];
  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <p className="text-sm font-semibold">{t("exceptionsTitle")}</p>
        <Status tone="neutral">{t("sample")}</Status>
      </div>
      <ul className="divide-y">
        {items.map((i) => (
          <li key={i.title} className="flex items-start gap-3 px-4 py-3.5 text-sm">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{i.title}</p>
              <p className="text-muted-foreground">{i.note}</p>
            </div>
            <Status tone={i.tone}>{i.label}</Status>
          </li>
        ))}
      </ul>
      <div className="border-t bg-muted/40 p-4">
        <Image src="/site/sign-in-sheet.jpg" alt={t("photo")} width={900} height={555} className="h-28 w-full rounded-md border object-cover object-[70%_30%]" sizes="480px" />
      </div>
    </div>
  );
}

/** Step 3: the week's client approvals. */
export async function ApprovalVisual() {
  const t = await getTranslations("site.frame");
  const p = await getTranslations("site.home.paid");
  const rows = [
    { client: "Prairie Line Manufacturing", approver: p("approver"), shifts: p("shifts", { count: 55, hours: "436:40" }), status: <Status tone="success">{p("approved")}</Status>, when: p("answered") },
    { client: "Pacific Crest Distribution", approver: "—", shifts: p("shifts", { count: 58, hours: "471:00" }), status: <Status tone="neutral">{p("notSent")}</Status>, when: "" },
  ];
  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <p className="text-sm font-semibold">{t("approvalTitle")}</p>
        <Status tone="neutral">{t("sample")}</Status>
      </div>
      <ul className="divide-y">
        {rows.map((r) => (
          <li key={r.client} className="flex items-center gap-3 px-4 py-3.5 text-sm">
            <Avatar name={r.client} kind="organization" size={32} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{r.client}</p>
              <p className="truncate text-xs text-muted-foreground tabular-nums">
                {r.shifts}
                {r.approver !== "—" && <> · {r.approver}</>}
              </p>
              {r.when && <p className="truncate text-xs text-muted-foreground">{r.when}</p>}
            </div>
            {r.status}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Step 4 and the payroll section: the run's control totals, as the Files step shows them. */
export async function FilesVisual({ withInvoices = true }: { withInvoices?: boolean }) {
  const t = await getTranslations("site.home.provider");
  const f = await getTranslations("site.frame");
  const totals = [
    { label: t("workers"), value: "24" },
    { label: t("regular"), value: "881:00" },
    { label: t("overtime"), value: "26:40" },
    { label: t("gross"), value: "$17,263.87" },
    { label: t("theirs"), value: "$17,263.96" },
    { label: t("difference"), value: "$0.09" },
  ];
  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">{t("totals")}</p>
          <p className="truncate text-xs text-muted-foreground">gusto-hours-2026-10-05-to-2026-10-11.csv</p>
        </div>
        <Status tone="neutral">{f("sample")}</Status>
      </div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 px-4 py-4 sm:grid-cols-3">
        {totals.map((x) => (
          <div key={x.label} className="min-w-0">
            <dt className="truncate text-xs text-muted-foreground">{x.label}</dt>
            <dd className="text-lg font-semibold tracking-tight tabular-nums">{x.value}</dd>
          </div>
        ))}
      </dl>
      <p className="border-t px-4 py-3 text-xs text-muted-foreground">{t("differenceNote")}</p>
      {withInvoices && (
        <ul className="divide-y border-t text-sm tabular-nums">
          {[
            { number: "PCD-20261005", client: "Pacific Crest Distribution", amount: "$13,756.88", id: "pcd" },
            { number: "PLM-20261005", client: "Prairie Line Manufacturing", amount: "$11,583.75", id: "plm" },
          ].map((i) => (
            <li key={i.number} className="flex items-center gap-3 px-4 py-2.5">
              <ColorDot id={i.id} />
              <span className="font-medium">{i.number}</span>
              <span className="min-w-0 flex-1 truncate text-muted-foreground">{i.client}</span>
              <span className="font-medium">{i.amount}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Margin by client for the week (Margin › Overview). */
export async function MarginVisual() {
  const t = await getTranslations("site.home.paid");
  const f = await getTranslations("site.frame");
  const rows = [
    { client: "Pacific Crest Distribution", hours: "471:00", billed: "$13,756.88", pay: "$9,330.75", margin: "$2,962.38" },
    { client: "Prairie Line Manufacturing", hours: "436:40", billed: "$11,583.75", pay: "$7,933.12", margin: "$2,487.64" },
  ];
  const R = "px-3 py-2.5 text-right whitespace-nowrap";
  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <p className="text-sm font-semibold">{t("marginTitle")}</p>
        <Status tone="neutral">{f("sample")}</Status>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm tabular-nums">
          <thead className="border-b bg-muted/40">
            <tr>
              <th className={cn(TH, "pl-4")}>{t("client")}</th>
              <th className={cn(TH, "text-right")}>{t("hours")}</th>
              <th className={cn(TH, "text-right")}>{t("billed")}</th>
              <th className={cn(TH, "text-right")}>{t("pay")}</th>
              <th className={cn(TH, "pr-4 text-right")}>{t("marginCol")}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => (
              <tr key={r.client}>
                <td className="px-3 py-2.5 pl-4 whitespace-nowrap">
                  <span className="flex items-center gap-2">
                    <ColorDot id={r.client} />
                    {r.client}
                  </span>
                </td>
                <td className={R}>{r.hours}</td>
                <td className={R}>{r.billed}</td>
                <td className={R}>{r.pay}</td>
                <td className={cn(R, "pr-4 font-medium")}>{r.margin}</td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td className="px-3 py-2.5 pl-4">{t("total")}</td>
              <td className={R}>907:40</td>
              <td className={R}>$25,340.63</td>
              <td className={R}>$17,263.87</td>
              <td className={cn(R, "pr-4")}>$5,450.02</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
