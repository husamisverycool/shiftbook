"use client";

// Pattern: docs/patterns/compliance/[id].md — Drata control detail (Overview cards and owners;
// Evidence: link, unlink, create, download), Vanta test detail tabs (Evidence, History, Notes) and
// documents (a new file; expired files move to History; Mark as complete).
import { DownloadIcon, ExternalLinkIcon, PaperclipIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { addFileAction, addNoteAction, closeAction, makeDocumentAction, recordI9Action, reopenAction, reverifyAction, removeEqualPayRateAction, saveNoticeDetailsAction, setEqualPayRateAction, unlinkFileAction, type ComplianceActionResult } from "@/app/[locale]/(app)/compliance/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { Link, useRouter } from "@/i18n/navigation";
import { parseDollars } from "@/lib/amounts";
import type { Explain } from "@/lib/explain";
import type { ObligationDetail } from "@/server/compliance/queries";
import { longDate, money } from "../format";
import { Crumbs, Facts, Page, PageHeader, PageTabs, RecordLayout, Section } from "../page";
import { useCite, useSay } from "./explain";
import { dueIn, OwnerPicker } from "./list";
import { StatusBadge } from "./status-badge";
import { useDateTime } from "../agency-zone";

export type DetailTab = "overview" | "evidence" | "history" | "notes";
const TABS: DetailTab[] = ["overview", "evidence", "history", "notes"];

export function useAct() {
  const te = useTranslations("compliance.errors");
  const router = useRouter();
  const [pending, run] = useTransition();
  const act = (fn: () => Promise<ComplianceActionResult>, onOk?: () => void) =>
    run(async () => {
      const r = await fn();
      if (r.ok) {
        onOk?.();
        router.refresh();
        return;
      }
      if (r.error === "invalid" && "field" in r && r.field) toast.error(te.has(`fields.${r.field}`) ? te(`fields.${r.field}` as "fields.reason") : te("generic"));
      else toast.error(te(r.error === "invalid" ? "generic" : r.error));
    });
  return { pending, act };
}

export function ObligationView({ d, tab, today }: { d: ObligationDetail; tab: DetailTab; today: string }) {
  const say = useSay();
  const t = useTranslations("compliance");
  const td = useTranslations("compliance.detail");
  const tc = useTranslations("common");
  const locale = useLocale();
  const when = useDateTime();
  const i = d.item;
  const open = i.status === "overdue" || i.status === "due_soon" || i.status === "upcoming";
  const [closing, setClosing] = useState<"done" | "not_applicable" | null>(null);
  const { pending, act } = useAct();

  return (
    <Page>
      <PageHeader
        context={<Crumbs label={tc("breadcrumb")} items={[{ label: td("back"), href: "/compliance", testId: "back-to-compliance" }]} />}
        title={t(`kinds.${i.kind}` as "kinds.ma_job_order")}
        status={<StatusBadge status={i.status} size="lg" />}
        description={`${i.subject} · ${t(`states.${i.jurisdiction}` as "states.IL")}`}
        actions={
          <>
            {i.mayAct && open && (
              <>
                <Button variant="outline" size="sm" disabled={pending} onClick={() => setClosing("not_applicable")} data-testid="not-applicable">
                  {td("notApplicable")}
                </Button>
                <Button size="sm" disabled={pending} onClick={() => setClosing("done")} data-testid="mark-done">
                  {td("markDone")}
                </Button>
              </>
            )}
            {d.mayReopen && (
              <Button variant="outline" size="sm" disabled={pending} onClick={() => act(() => reopenAction(i.id))} data-testid="reopen">
                {td("reopen")}
              </Button>
            )}
          </>
        }
      />
      {!open && (
        <p className="text-sm" data-testid="closed-note">
          {(i.status === "done" ? td("doneBy", { by: d.closedBySystem ? td("byShiftbook") : (d.doneByLabel ?? ""), date: d.doneAt ? when(d.doneAt, { date: "long", time: false }) : "" }) : td("naBy", { by: d.closedBySystem ? td("byShiftbook") : (d.doneByLabel ?? ""), date: d.doneAt ? when(d.doneAt, { date: "long", time: false }) : "" })) +
            (d.closedBySystem ? ` ${systemNote(td, d, locale)}` : d.noteKey ? ` ${td("note", { note: say(d.noteKey) })}` : d.statusNote ? ` ${td("note", { note: d.statusNote })}` : "")}
        </p>
      )}
      {!i.mayAct && <p className="text-sm text-muted-foreground">{td("readOnly", { who: t(`who.${whoFor(d)}`) })}</p>}
      <RecordLayout aside={<Summary d={d} />}>
        <div className="flex min-w-0 flex-col gap-6">
      <PageTabs
        label={td("tabs.overview")}
        current={tab}
        tabs={TABS.map((x) => ({
          key: x,
          label: td(`tabs.${x}`),
          count: x === "evidence" && d.files.length > 0 ? d.files.length : x === "notes" && d.notes.length > 0 ? d.notes.length : undefined,
          href: x === "overview" ? `/compliance/${i.id}` : `/compliance/${i.id}?tab=${x}`,
          testId: `obligation-tab-${x}`,
        }))}
      />
      {tab === "overview" && <Overview d={d} today={today} />}
      {tab === "evidence" && <Evidence d={d} today={today} />}
      {tab === "history" && <History d={d} />}
      {tab === "notes" && <Notes d={d} />}
        </div>
      </RecordLayout>
      <CloseDialog id={i.id} status={closing} onClose={() => setClosing(null)} />
    </Page>
  );
}

/** What Shiftbook closed a duty for, in the reader's language (the stored note is the English record). */
function systemNote(td: ReturnType<typeof useTranslations<"compliance.detail">>, d: ObligationDetail, locale: string): string {
  const f = d.facts as Record<string, string | null | undefined>;
  const date = (v: string | null | undefined) => (v ? longDate(v, locale) : "");
  if (d.item.status === "not_applicable") return td("system.noLonger");
  if (f.renewedBy) return td("system.renewed", { number: f.renewedBy, date: date(f.renewedUntil) });
  if (f.completedOn) return td("system.completed", { date: date(f.completedOn) });
  return d.statusNote ? td("note", { note: d.statusNote }) : "";
}

const whoFor = (d: ObligationDetail): "owner" | "coordinator" | "billing" => (["placements", "workers"].includes(d.item.area) ? "coordinator" : d.item.area === "clients" ? "billing" : "owner");

function Overview({ d, today }: { d: ObligationDetail; today: string }) {
  const say = useSay();
  const cite = useCite();
  const t = useTranslations("compliance");
  const td = useTranslations("compliance.detail");
  const i = d.item;
  const open = i.status === "overdue" || i.status === "due_soon" || i.status === "upcoming";
  const days = d.rule ? Math.abs(d.rule.offsetDays) || d.rule.businessDays : 0;
  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-3" aria-labelledby="law">
        <h2 id="law" className="border-b pb-2 text-base font-semibold">
          {td("whatLaw")}
        </h2>
        <p className="max-w-3xl text-sm">{t(`asks.${i.kind}` as "asks.ma_job_order", { days })}</p>
        {d.rule && (
          <p className="text-xs text-muted-foreground">
            {td("citation")}: {d.rule.citationCode ? cite(d.rule.citationCode, d.rule.citation) : d.rule.citation}.{" "}
            <a href={d.rule.sourceUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-0.5 underline underline-offset-4">
              {td("source")}
              <ExternalLinkIcon className="size-3" />
            </a>
          </p>
        )}
      </section>
      <section className="flex flex-col gap-3" aria-labelledby="about">
        <h2 id="about" className="border-b pb-2 text-base font-semibold">
          {td("about")}
        </h2>
        <dl className="grid max-w-3xl grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
          <dt className="text-muted-foreground">{td("subject")}</dt>
          <dd>{i.subject}</dd>
          {d.names.client && i.links.clientId && (
            <>
              <dt className="text-muted-foreground">{td("client")}</dt>
              <dd>
                <Link href={`/clients/${i.links.clientId}`} className="underline underline-offset-4">
                  {d.names.client}
                </Link>
              </dd>
            </>
          )}
          {d.names.jobOrderId && (
            <>
              <dt className="text-muted-foreground">{td("placement")}</dt>
              <dd>
                <Link href={`/job-orders/${d.names.jobOrderId}`} className="underline underline-offset-4">
                  {td("openPlacement")}
                </Link>
              </dd>
            </>
          )}
          <dt className="text-muted-foreground">{td("workedOut")}</dt>
          <dd className="text-muted-foreground" data-testid="obligation-message">
            {d.explain ? say(d.explain) : d.message}
          </dd>
        </dl>
        {i.kind === "aca_offer" && (
          <Link href="/compliance/aca" className="w-fit text-sm underline underline-offset-4" data-testid="open-aca">
            {td("acaLink")}
          </Link>
        )}
        {(i.subjectKind === "registration" || i.subjectKind === "policy") && (
          <Link href="/settings/compliance" className="w-fit text-sm underline underline-offset-4">
            {td("settingsLink")}
          </Link>
        )}
      </section>
      {d.notice && <NoticeForm d={d} />}
      {d.i9 && (i.kind === "i9_section1" || i.kind === "i9_section2") && <I9Form d={d} today={today} />}
      {d.i9 && i.kind === "i9_reverify" && open && i.mayAct && <ReverifyForm d={d} today={today} />}
      {/* A saved or removed row starts the form afresh, with its default date. */}
      {d.equalPay && <EqualPayForm key={d.equalPay.rates.filter((r) => r.replacedAt === null).map((r) => r.id).join()} d={d} today={today} />}
    </div>
  );
}

/** The duty's key facts beside its tabs (Drata's summary cards, set as Stripe's details column). */
function Summary({ d }: { d: ObligationDetail }) {
  const t = useTranslations("compliance");
  const td = useTranslations("compliance.detail");
  const locale = useLocale();
  const i = d.item;
  const open = i.status === "overdue" || i.status === "due_soon" || i.status === "upcoming";
  return (
    <Section id="duty-summary" title={td("summary")} testId="obligation-cards">
      <Facts
        items={[
          {
            label: td("cards.due"),
            value: (
              <span className="flex flex-col">
                <span>{longDate(i.dueOn, locale)}</span>
                {open && <span className={`text-[13px] ${i.status === "overdue" ? "text-destructive" : "text-muted-foreground"}`}>{dueIn(t, i.dueInDays)}</span>}
              </span>
            ),
          },
          { label: td("cards.owner"), value: <OwnerPicker item={i} users={d.users} /> },
          {
            label: td("cards.evidence"),
            value: (
              <Link href={`/compliance/${i.id}?tab=evidence`} className="underline-offset-4 hover:underline">
                {td("files", { count: d.files.length })}
              </Link>
            ),
          },
          { label: td("cards.status"), value: <StatusBadge status={i.status} /> },
        ]}
      />
    </Section>
  );
}

/** The job order's details for its Massachusetts job orders (M.G.L. c. 149 § 159C(b)); kept on the job order. */
function NoticeForm({ d }: { d: ObligationDetail }) {
  const tn = useTranslations("compliance.detail.notice");
  const n = d.notice!.details;
  const [v, setV] = useState({ employerPhone: n?.employerPhone ?? "", startTime: n?.startTime ?? "", endTime: n?.endTime ?? "", overtime: n?.overtime ?? "possible", requirements: n?.requirements ?? "", meals: n?.meals ?? "", transport: n?.transport ?? "", strike: n?.strike ?? false });
  const { pending, act } = useAct();
  const can = d.item.mayAct;
  const text = (key: "requirements" | "meals" | "transport", label: string) => (
    <div className="flex flex-col gap-1 sm:col-span-2">
      <Label htmlFor={`notice-${key}`} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Input id={`notice-${key}`} value={v[key]} maxLength={300} disabled={!can} onChange={(e) => setV({ ...v, [key]: e.target.value })} data-testid={`notice-${key}`} />
    </div>
  );
  return (
    <section className="flex flex-col gap-3" aria-labelledby="notice" data-testid="notice-form">
      <h2 id="notice" className="border-b pb-2 text-base font-semibold">
        {tn("title")}
      </h2>
      <p className="text-xs text-muted-foreground">{tn("intro")}</p>
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="flex flex-col gap-1 sm:col-span-4">
          <Label htmlFor="notice-phone" className="text-xs text-muted-foreground">
            {tn("employerPhone", { client: d.names.client ?? "" })}
          </Label>
          <Input id="notice-phone" type="tel" className="sm:w-60" value={v.employerPhone} maxLength={40} disabled={!can} onChange={(e) => setV({ ...v, employerPhone: e.target.value })} data-testid="notice-phone" />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="notice-start" className="text-xs text-muted-foreground">
            {tn("startTime")}
          </Label>
          <Input id="notice-start" type="time" value={v.startTime} disabled={!can} onChange={(e) => setV({ ...v, startTime: e.target.value })} data-testid="notice-start" />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="notice-end" className="text-xs text-muted-foreground">
            {tn("endTime")}
          </Label>
          <Input id="notice-end" type="time" value={v.endTime} disabled={!can} onChange={(e) => setV({ ...v, endTime: e.target.value })} data-testid="notice-end" />
        </div>
        <div className="flex flex-col gap-1 sm:col-span-2">
          <Label htmlFor="notice-overtime" className="text-xs text-muted-foreground">
            {tn("overtime")}
          </Label>
          <NativeSelect id="notice-overtime" className="w-full" value={v.overtime} disabled={!can} onChange={(e) => setV({ ...v, overtime: e.target.value as "yes" | "no" | "possible" })}>
            {(["yes", "possible", "no"] as const).map((o) => (
              <NativeSelectOption key={o} value={o}>
                {tn(`overtimeOptions.${o}`)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        {text("requirements", tn("requirements"))}
        {text("meals", tn("meals"))}
        {text("transport", tn("transport"))}
        <div className="flex items-center gap-2 sm:col-span-2">
          <Checkbox id="notice-strike" checked={v.strike} disabled={!can} onCheckedChange={(on) => setV({ ...v, strike: on === true })} />
          <Label htmlFor="notice-strike">{tn("strike")}</Label>
        </div>
      </div>
      {can && (
        <Button size="sm" className="w-fit" disabled={pending} onClick={() => act(() => saveNoticeDetailsAction(d.item.id, v), () => toast.success(tn("saved")))} data-testid="save-notice">
          {tn("save")}
        </Button>
      )}
    </section>
  );
}

function I9Form({ d, today }: { d: ObligationDetail; today: string }) {
  const td = useTranslations("compliance.detail.i9");
  const i9 = d.i9!;
  const [v, setV] = useState({ hireDate: i9.hireDate ?? "", section1On: i9.section1On ?? "", section2On: i9.section2On ?? "", workAuthExpiresOn: i9.workAuthExpiresOn ?? "" });
  const { pending, act } = useAct();
  const field = (key: keyof typeof v, label: string, max?: string) => (
    <div className="flex flex-col gap-1">
      <Label htmlFor={`i9-${key}`} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Input id={`i9-${key}`} type="date" className="w-44" value={v[key]} max={max} disabled={!d.item.mayAct} onChange={(e) => setV({ ...v, [key]: e.target.value })} data-testid={`i9-${key}`} />
    </div>
  );
  return (
    <section className="flex flex-col gap-3" aria-labelledby="i9">
      <h2 id="i9" className="border-b pb-2 text-base font-semibold">
        {td("title")}
      </h2>
      <div className="flex flex-wrap items-end gap-3">
        {field("hireDate", td("hireDate"))}
        {field("section1On", td("section1"), today)}
        {field("section2On", td("section2"), today)}
        {field("workAuthExpiresOn", td("workAuth"))}
        {d.item.mayAct && (
          <Button
            size="sm"
            disabled={pending}
            onClick={() => act(() => recordI9Action(i9.workerId, { hireDate: v.hireDate || null, section1On: v.section1On || null, section2On: v.section2On || null, workAuthExpiresOn: v.workAuthExpiresOn || null }), () => toast.success(td("saved")))}
            data-testid="save-i9"
          >
            {td("save")}
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{td("datesOnly")}</p>
    </section>
  );
}

function ReverifyForm({ d, today }: { d: ObligationDetail; today: string }) {
  const td = useTranslations("compliance.detail.reverify");
  const [on, setOn] = useState(today);
  const [next, setNext] = useState("");
  const { pending, act } = useAct();
  return (
    <section className="flex flex-col gap-3" aria-labelledby="reverify">
      <h2 id="reverify" className="border-b pb-2 text-base font-semibold">
        {td("title")}
      </h2>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="reverified-on" className="text-xs text-muted-foreground">
            {td("reverifiedOn")}
          </Label>
          <Input id="reverified-on" type="date" className="w-44" max={today} value={on} onChange={(e) => setOn(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="next-expires" className="text-xs text-muted-foreground">
            {td("nextExpires")}
          </Label>
          <Input id="next-expires" type="date" className="w-44" min={on} value={next} onChange={(e) => setNext(e.target.value)} />
        </div>
        <Button size="sm" disabled={pending || !on} onClick={() => act(() => reverifyAction(d.item.id, on, next || null))} data-testid="save-reverify">
          {td("save")}
        </Button>
      </div>
    </section>
  );
}

function Evidence({ d, today }: { d: ObligationDetail; today: string }) {
  const td = useTranslations("compliance.detail");
  const locale = useLocale();
  const when = useDateTime();
  const [effectiveOn, setEffectiveOn] = useState(today);
  const [file, setFile] = useState<File | null>(null);
  const [key, setKey] = useState(0);
  const { pending, act } = useAct();
  const row = (f: ObligationDetail["files"][number], past: boolean) => (
    <li key={`${f.id}-${String(f.addedAt)}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5" data-testid={past ? "past-file" : "evidence-file"}>
      <PaperclipIcon className="size-4 shrink-0 text-muted-foreground" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium">{f.filename}</span>
        <span className="text-xs text-muted-foreground">
          {[
            `${td("effectiveOn")}: ${longDate(f.effectiveOn, locale)}`,
            f.source === "generated" ? td("generated") : td("uploaded"),
            past && f.unlinkedAt ? td("unlinkedBy", { by: f.unlinkedBy ?? "", date: when(f.unlinkedAt, { date: "long", time: false }) }) : td("addedBy", { by: f.addedBy, date: when(f.addedAt, { date: "long", time: false }) }),
          ].join(" · ")}
        </span>
      </span>
      <a href={`/api/files/compliance/${f.id}`} download className={buttonVariants({ variant: "ghost", size: "sm" })} aria-label={`${td("download")} ${f.filename}`}>
        <DownloadIcon />
        {td("download")}
      </a>
      {!past && d.item.mayAct && (
        <Button variant="ghost" size="sm" disabled={pending} onClick={() => act(() => unlinkFileAction(d.item.id, f.id))} data-testid="unlink-file">
          {td("unlink")}
        </Button>
      )}
    </li>
  );
  const notice = d.notice;
  const blocked = notice
    ? !notice.details?.employerPhone
      ? td("notice.missing")
      : !notice.hasContact
        ? td("notice.department")
        : !notice.hasAgencyPhone
          ? td("notice.agencyPhone")
          : null
    : d.proof && !d.proof.hasRegistration
      ? td("proofNoRegistration", { date: longDate(d.proof.on, locale) })
      : null;
  return (
    <div className="flex flex-col gap-4">
      {d.makes && d.item.mayAct && (
        <div className="flex flex-wrap items-center gap-3 border-b pb-4" data-testid="make-document">
          <Button size="sm" disabled={pending || blocked !== null} onClick={() => act(() => makeDocumentAction(d.item.id, d.item.kind), () => toast.success(td("create.made")))} data-testid="make-document-button">
            {td(`create.${d.item.kind}` as "create.ma_job_order")}
          </Button>
          <p className="flex-1 text-xs text-muted-foreground">
            {blocked ?? td("create.hint")}
            {(blocked === td("notice.department") || (d.proof && !d.proof.hasRegistration) || (notice && notice.details && !notice.hasStatement)) && (
              <>
                {" "}
                {notice && notice.details && notice.hasContact && !notice.hasStatement && <span>{td("notice.noStatement")} </span>}
                <Link href="/settings/compliance" className="underline underline-offset-4">
                  {td("settingsLink")}
                </Link>
              </>
            )}
          </p>
        </div>
      )}
      {d.keepsNoFiles && (
        <p className="text-sm text-muted-foreground" data-testid="no-i9-files">
          {td("noI9Files")}
        </p>
      )}
      {d.item.mayAct && !d.keepsNoFiles && (
        <form
          className="flex flex-wrap items-end gap-3 border-b pb-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!file) return;
            const form = new FormData();
            form.set("file", file);
            form.set("effectiveOn", effectiveOn);
            act(
              () => addFileAction(d.item.id, form),
              () => {
                setFile(null);
                setKey((k) => k + 1);
              },
            );
          }}
        >
          <div className="flex flex-col gap-1">
            <Label htmlFor="evidence-file" className="text-xs text-muted-foreground">
              {td("addFile")}
            </Label>
            <Input key={key} id="evidence-file" type="file" className="w-72" accept=".pdf,.png,.jpg,.jpeg,.csv,.txt,.xlsx,.docx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} data-testid="evidence-input" />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="evidence-date" className="text-xs text-muted-foreground">
              {td("effectiveOn")}
            </Label>
            <Input id="evidence-date" type="date" className="w-44" value={effectiveOn} onChange={(e) => setEffectiveOn(e.target.value)} />
          </div>
          <Button type="submit" size="sm" disabled={pending || !file || !effectiveOn} data-testid="add-evidence">
            {td("upload")}
          </Button>
          <p className="w-full text-xs text-muted-foreground">{td("fileTypes")}</p>
        </form>
      )}
      {d.keepsNoFiles && d.files.length === 0 ? null : d.files.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground" data-testid="no-files">
          {td("noFiles")}
        </p>
      ) : (
        <ul className="divide-y border-y">{d.files.map((f) => row(f, false))}</ul>
      )}
      {d.pastFiles.length > 0 && (
        <section aria-labelledby="past-files" className="flex flex-col gap-2">
          <h2 id="past-files" className="text-sm font-semibold">
            {td("pastFiles")}
          </h2>
          <ul className="divide-y border-y">{d.pastFiles.map((f) => row(f, true))}</ul>
        </section>
      )}
    </div>
  );
}

function History({ d }: { d: ObligationDetail }) {
  const say = useSay();
  const td = useTranslations("compliance.detail");
  const ts = useTranslations("compliance.statuses");
  const locale = useLocale();
  const when = useDateTime();
  if (d.history.length === 0) return <p className="text-sm text-muted-foreground">{td("noHistory")}</p>;
  const what = (h: ObligationDetail["history"][number]) => {
    const after = h.after ?? {};
    if (h.action === "create") return td("history.created");
    // Shiftbook's own notes in the reader's language (decision 0028); a person's note as typed.
    const note = after.noteKey && typeof after.noteKey === "object" ? say(after.noteKey as Explain) : typeof after.note === "string" ? after.note : "";
    if (typeof after.status === "string") return td("history.status", { to: after.status === "open" ? td("reopen") : ts(after.status === "done" ? "done" : "not_applicable") }) + (note ? ` — ${note}` : "");
    if ("ownerUserId" in after) return td("history.owner");
    if ("linkedDocumentId" in after) return after.linkedDocumentId ? td("history.fileAdded") : td("history.fileUnlinked");
    if (typeof after.dueOn === "string") return td("history.due", { date: longDate(after.dueOn, locale) });
    return td("history.other");
  };
  return (
    <ol className="flex flex-col border-y" data-testid="obligation-history">
      {d.history.map((h, n) => (
        <li key={n} className="flex flex-wrap items-baseline gap-x-4 border-b py-2.5 text-sm last:border-b-0">
          <span className="w-56 text-xs text-muted-foreground tabular-nums">{when(h.at)}</span>
          <span className="flex-1">{what(h)}</span>
          <span className="text-xs text-muted-foreground">{h.by}</span>
        </li>
      ))}
    </ol>
  );
}

function Notes({ d }: { d: ObligationDetail }) {
  const td = useTranslations("compliance.detail");
  const when = useDateTime();
  const [body, setBody] = useState("");
  const { pending, act } = useAct();
  return (
    <div className="flex flex-col gap-4">
      {d.item.mayAct && (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            act(
              () => addNoteAction(d.item.id, body),
              () => setBody(""),
            );
          }}
        >
          <Label htmlFor="note-body">{td("addNote")}</Label>
          <Textarea id="note-body" value={body} maxLength={2000} placeholder={td("notePlaceholder")} onChange={(e) => setBody(e.target.value)} data-testid="note-body" />
          <Button type="submit" size="sm" className="w-fit" disabled={pending || body.trim() === ""} data-testid="add-note">
            {td("saveNote")}
          </Button>
        </form>
      )}
      {d.notes.length === 0 ? (
        <p className="text-sm text-muted-foreground">{td("noNotes")}</p>
      ) : (
        <ul className="flex flex-col divide-y border-y">
          {d.notes.map((n) => (
            <li key={n.id} className="py-3" data-testid="obligation-note">
              <p className="text-sm whitespace-pre-wrap">{n.body}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {n.by} · {when(n.at)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CloseDialog({ id, status, onClose }: { id: string; status: "done" | "not_applicable" | null; onClose: () => void }) {
  const td = useTranslations("compliance.detail");
  const [note, setNote] = useState("");
  const { pending, act } = useAct();
  const na = status === "not_applicable";
  return (
    <Dialog open={status !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{na ? td("naTitle") : td("doneTitle")}</DialogTitle>
          <DialogDescription className="sr-only">{na ? td("reason") : td("doneNote")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="close-note">{na ? td("reason") : td("doneNote")}</Label>
          <Textarea id="close-note" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} data-testid="close-note-input" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {td("cancel")}
          </Button>
          <Button
            disabled={pending || (na && note.trim() === "")}
            onClick={() =>
              status &&
              act(
                () => closeAction(id, status, note.trim() || null),
                () => {
                  setNote("");
                  onClose();
                },
              )
            }
            data-testid="confirm-close"
          >
            {td("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const EQUAL_PAY_METHODS = ["comparator", "closest_seniority", "survey_median", "survey_75th"] as const;

/** The Illinois equal-pay rate (820 ILCS 175/42(a), (b)): the client's figures from a date, or that the client was asked. */
function EqualPayForm({ d, today }: { d: ObligationDetail; today: string }) {
  const te = useTranslations("compliance.detail.equalPay");
  const locale = useLocale();
  const when = useDateTime();
  const can = d.item.mayAct;
  const rates = d.equalPay!.rates;
  const live = rates.filter((r) => r.replacedAt === null);
  // The first rate from the crossing; a later one from today (a new rate rarely reaches back).
  const [v, setV] = useState({ effectiveFrom: live.some((r) => r.kind === "rate") ? today : (d.crossedOn ?? today), method: "comparator" as (typeof EQUAL_PAY_METHODS)[number], rate: "", benefits: "0", comparator: "", note: "" });
  const [removing, setRemoving] = useState<string | null>(null);
  const replaces = live.find((r) => r.kind === "rate" && r.effectiveFrom === v.effectiveFrom);
  const [askedOn, setAskedOn] = useState(today);
  const { pending, act } = useAct();
  const rateCents = parseDollars(v.rate);
  const benefitsCents = parseDollars(v.benefits);
  const ready = v.effectiveFrom !== "" && rateCents !== null && rateCents > 0 && benefitsCents !== null && v.comparator.trim() !== "";
  const trueUps = d.equalPay!.trueUps;
  return (
    <section className="flex flex-col gap-3" aria-labelledby="equal-pay" data-testid="equal-pay-form">
      <h2 id="equal-pay" className="border-b pb-2 text-base font-semibold">
        {te("title")}
      </h2>
      <p className="text-xs text-muted-foreground">{te("intro")}</p>
      {can && (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="flex flex-col gap-1">
              <Label htmlFor="ep-from" className="text-xs text-muted-foreground">
                {te("from")}
              </Label>
              <Input id="ep-from" type="date" value={v.effectiveFrom} onChange={(e) => setV({ ...v, effectiveFrom: e.target.value })} data-testid="ep-from" />
            </div>
            <div className="flex flex-col gap-1 sm:col-span-3">
              <Label htmlFor="ep-method" className="text-xs text-muted-foreground">
                {te("method")}
              </Label>
              <NativeSelect id="ep-method" className="w-full" value={v.method} onChange={(e) => setV({ ...v, method: e.target.value as (typeof EQUAL_PAY_METHODS)[number] })} data-testid="ep-method">
                {EQUAL_PAY_METHODS.map((m) => (
                  <NativeSelectOption key={m} value={m}>
                    {te(`methods.${m}`)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="ep-rate" className="text-xs text-muted-foreground">
                {te("rate")}
              </Label>
              <Input id="ep-rate" inputMode="decimal" value={v.rate} aria-invalid={v.rate !== "" && rateCents === null ? true : undefined} onChange={(e) => setV({ ...v, rate: e.target.value })} data-testid="ep-rate" />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="ep-benefits" className="text-xs text-muted-foreground">
                {te("benefits")}
              </Label>
              <Input id="ep-benefits" inputMode="decimal" value={v.benefits} aria-invalid={benefitsCents === null ? true : undefined} onChange={(e) => setV({ ...v, benefits: e.target.value })} data-testid="ep-benefits" />
            </div>
            <div className="flex flex-col gap-1 sm:col-span-2">
              <Label htmlFor="ep-comparator" className="text-xs text-muted-foreground">
                {te("comparator")}
              </Label>
              <Input id="ep-comparator" maxLength={300} value={v.comparator} onChange={(e) => setV({ ...v, comparator: e.target.value })} data-testid="ep-comparator" />
            </div>
            <div className="flex flex-col gap-1 sm:col-span-4">
              <Label htmlFor="ep-note" className="text-xs text-muted-foreground">
                {te("note")}
              </Label>
              <Input id="ep-note" maxLength={500} value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} data-testid="ep-note" />
            </div>
          </div>
          {replaces && <p className="text-xs text-muted-foreground" data-testid="ep-replaces">{te("replaces", { date: longDate(replaces.effectiveFrom, locale) })}</p>}
          <div className="flex flex-wrap items-end gap-3">
            <Button
              size="sm"
              disabled={pending || !ready}
              onClick={() =>
                act(
                  () => setEqualPayRateAction(d.item.id, { effectiveFrom: v.effectiveFrom, kind: "rate", rateCents, benefitsCents, method: v.method, comparator: v.comparator.trim(), note: v.note.trim() || null }),
                  () => toast.success(te("saved")),
                )
              }
              data-testid="save-equal-pay"
            >
              {te("save")}
            </Button>
            <span className="text-xs text-muted-foreground">{te("or")}</span>
            <div className="flex flex-col gap-1">
              <Label htmlFor="ep-asked" className="text-xs text-muted-foreground">
                {te("askedOn")}
              </Label>
              <Input id="ep-asked" type="date" className="w-44" max={today} value={askedOn} onChange={(e) => setAskedOn(e.target.value)} data-testid="ep-asked" />
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={pending || askedOn === "" || askedOn > today}
              onClick={() => act(() => setEqualPayRateAction(d.item.id, { effectiveFrom: askedOn, kind: "asked", rateCents: null, benefitsCents: null, method: null, comparator: null, note: null }), () => toast.success(te("askedSaved")))}
              data-testid="save-asked"
            >
              {te("asked")}
            </Button>
          </div>
        </>
      )}
      {removing && <RemoveRateDialog obligationId={d.item.id} rateId={removing} onClose={() => setRemoving(null)} />}
      {trueUps.length > 0 && (
        <div className="flex flex-col gap-1 rounded-md border border-destructive/40 p-3 text-sm" data-testid="ep-true-ups">
          <p className="font-medium text-destructive">{te("trueUpTitle")}</p>
          <p className="text-xs text-muted-foreground">{te("trueUpBody")}</p>
          <ul className="flex flex-wrap gap-x-4 gap-y-1">
            {trueUps.map((w) => (
              <li key={w.periodId}>
                <Link href={{ pathname: "/convert", query: { period: w.periodId, step: "files" } }} className="underline underline-offset-4">
                  {te("week", { from: longDate(w.startsOn, locale), to: longDate(w.endsOn, locale) })}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      {rates.length === 0 ? (
        <p className="text-sm text-muted-foreground">{te("none")}</p>
      ) : (
        <ul className="flex flex-col gap-1 text-sm" data-testid="equal-pay-rates">
          {rates.map((r) => (
            <li key={r.id} className={r.replacedAt ? "text-muted-foreground" : ""} data-testid="equal-pay-rate">
              <span className={r.replacedAt ? "line-through" : ""}>
                {r.kind === "asked"
                  ? te("askedRow", { date: longDate(r.effectiveFrom, locale) })
                  : te("rateRow", { date: longDate(r.effectiveFrom, locale), total: money((r.rateCents ?? 0) + (r.benefitsCents ?? 0), locale), rate: money(r.rateCents ?? 0, locale), benefits: money(r.benefitsCents ?? 0, locale), method: te(`methods.${r.method ?? "comparator"}`), comparator: r.comparator ?? "" })}
              </span>{" "}
              <span className="text-xs text-muted-foreground">{te("by", { by: r.by, date: when(r.at, { date: "long", time: false }) })}</span>
              {r.replacedAt && <span className="text-xs text-muted-foreground"> · {r.removedReason ? te("removed", { by: r.replacedBy ?? "", reason: r.removedReason }) : te("replaced")}</span>}
              {can && !r.replacedAt && (
                <Button variant="ghost" size="sm" className="h-6 px-2" onClick={() => setRemoving(r.id)} data-testid="remove-equal-pay">
                  {te("remove")}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function RemoveRateDialog({ obligationId, rateId, onClose }: { obligationId: string; rateId: string; onClose: () => void }) {
  const te = useTranslations("compliance.detail.equalPay");
  const td = useTranslations("compliance.detail");
  const [reason, setReason] = useState("");
  const { pending, act } = useAct();
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{te("removeTitle")}</DialogTitle>
          <DialogDescription>{te("removeBody")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ep-remove-reason">{td("reason")}</Label>
          <Textarea id="ep-remove-reason" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} data-testid="ep-remove-reason" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {td("cancel")}
          </Button>
          <Button
            variant="destructive"
            disabled={pending || reason.trim() === ""}
            onClick={() =>
              act(
                () => removeEqualPayRateAction(obligationId, rateId, reason.trim()),
                () => {
                  toast.success(te("removedSaved"));
                  onClose();
                },
              )
            }
            data-testid="confirm-remove-equal-pay"
          >
            {te("remove")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
