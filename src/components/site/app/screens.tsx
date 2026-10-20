// Pattern: docs/patterns/site.md, "The app on the page" — the app's screens as the website draws them,
// each after its reference: Linear's inbox (a list of what came in beside the open item), Linear's list
// with a record panel and activity (the week), Stripe's dashboard tiles over a table with an expanding row
// (the pay run), Attio's record list (approvals), Stripe's invoice beside its list, Vercel's deploy log
// (the payroll file), Raycast's and Linear's command menu (⌘K). Each takes the moment of a play as props,
// so the hero and the tour can move through it. Sample data, the engine's pay lines and the exporters' files.
import { ArrowUpRight, Check, CornerDownLeft, Download, Ellipsis, ListFilter, Paperclip, Search, Send, SlidersHorizontal, Star } from "lucide-react";
import { useTranslations } from "next-intl";
import { Money, Odometer } from "@/components/site/blocks";
import { APPROVALS, CLIENTS, INBOX, INVOICES, RUN, WEEK, type Demo } from "@/components/site/app/data";
import { AGENCY, AppShell, ME, ViewTab } from "@/components/site/app/frame";
import { Avatar, Avatars, Badge, Btn, Kbd, Prop, Ref, Source, Spark, Status, Sure, Tag } from "@/components/site/app/kit";
import { cn } from "@/lib/utils";

function Tools() {
  const t = useTranslations("site.app.common");
  return (
    <span className="ml-auto flex items-center gap-1 text-[var(--a-muted)]">
      <span className="hidden h-6 items-center gap-1.5 rounded-md px-2 @lg:inline-flex">
        <ListFilter aria-hidden className="size-3.5" />
        {t("filter")}
      </span>
      <span className="inline-flex h-6 items-center gap-1.5 rounded-md px-2 shadow-[var(--a-shadow)]">
        <SlidersHorizontal aria-hidden className="size-3.5" />
        {t("display")}
      </span>
    </span>
  );
}

/* ---------------------------------------------------------------------------------------------- */
/* Inbox: Linear's inbox. `arrived` rows have come in; the open one shows what was read from it.      */
/* ---------------------------------------------------------------------------------------------- */

export function InboxScreen({ arrived = INBOX.length, reading = false, className }: { arrived?: number; reading?: boolean; className?: string }) {
  const t = useTranslations("site.app");
  const items = INBOX.slice(INBOX.length - arrived);
  const open = INBOX[0]!;
  const rows = WEEK.filter((w) => w.client === "northgate").concat(WEEK.filter((w) => w.client !== "northgate").slice(0, 4));
  return (
    <AppShell
      area="inbox"
      className={className}
      counts={{ inbox: arrived, check: reading ? 0 : 1 }}
      crumbs={[t("nav.inbox")]}
      actions={<Ellipsis aria-hidden className="size-4 text-[var(--a-muted)]" />}
    >
      <div className="flex h-full">
        <ul className="w-full shrink-0 border-[var(--a-line)] @2xl/main:w-[260px] @2xl/main:border-r">
          {items.map((it, i) => (
            <li key={it.id} className={cn("flex gap-2.5 border-b border-[var(--a-line-2)] px-3.5 py-2.5 animate-site-row-in", i === items.length - INBOX.length && "bg-[var(--a-sel)]")} style={{ animationDelay: `${i * 40}ms` }}>
              <Source kind={it.kind} size={22} />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-2 text-[12.5px]">
                  <span className="truncate font-medium">{it.from}</span>
                  <span className="ml-auto shrink-0 text-[11px] text-[var(--a-faint)] tabular-nums">{it.time}</span>
                </span>
                <span className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-[var(--a-muted)]">
                  <Status s={it.id === open.id && reading ? "reading" : it.status} className="size-3" />
                  <span className="truncate">{t(`inbox.${it.subject}`)}</span>
                </span>
              </span>
            </li>
          ))}
        </ul>
        {/* The open item. */}
        <div className="hidden min-w-0 flex-1 flex-col @2xl/main:flex">
          <div className="border-b border-[var(--a-line)] px-5 pt-4 pb-3">
            <div className="flex items-center gap-2">
              <Ref>{open.id}</Ref>
              <Tag color={CLIENTS.northgate.color}>{CLIENTS.northgate.name}</Tag>
              <Star aria-hidden className="ml-auto size-3.5 text-[var(--a-faint)]" />
            </div>
            <p className="mt-2 text-[15px] font-semibold tracking-[-0.01em]">{t("inbox.s1")}</p>
            <p className="mt-1 flex items-center gap-1.5 text-[11.5px] text-[var(--a-muted)]">
              <Avatar name={open.from} size={16} />
              {open.from} · {t("inbox.received", { time: open.time })}
              <span className="ml-auto inline-flex items-center gap-1 rounded-md bg-[var(--a-chip)] px-1.5 py-0.5 font-mono text-[10.5px]">
                <Paperclip aria-hidden className="size-3" />
                dock3_week41.pdf
              </span>
            </p>
          </div>
          <div className="flex items-center gap-2 px-5 pt-3 pb-2 text-[11.5px] text-[var(--a-muted)]">
            <span className="font-medium text-[var(--a-text)]">{t("inbox.whatWeRead")}</span>
            {reading ? (
              <span className="flex items-center gap-1.5">
                <Status s="reading" className="size-3" />
                {t("inbox.reading")}
              </span>
            ) : (
              <span>{t("inbox.readTwice", { agree: 11, total: 12 })}</span>
            )}
          </div>
          <div className="mx-5 overflow-hidden rounded-lg border border-[var(--a-line)]">
            <div className="grid grid-cols-[minmax(0,1fr)_repeat(5,2.1rem)_3.2rem_2.75rem] gap-x-1 border-b border-[var(--a-line)] bg-[var(--a-panel)] px-3 py-1.5 text-[10.5px] text-[var(--a-faint)]">
              <span>{t("week.worker")}</span>
              {t("week.days").split(" ").slice(0, 5).map((d, i) => (
                <span key={i} className="text-center">
                  {d}
                </span>
              ))}
              <span className="text-right">{t("week.total")}</span>
              <span className="text-right">{t("inbox.sure")}</span>
            </div>
            {rows.slice(0, 6).map((r, i) => (
              <div key={r.name} className={cn("grid grid-cols-[minmax(0,1fr)_repeat(5,2.1rem)_3.2rem_2.75rem] items-center gap-x-1 border-b border-[var(--a-line-2)] px-3 py-[5px] text-[11.5px] last:border-b-0 site-crossfade", reading && i > 1 ? "opacity-30" : "opacity-100")}>
                <span className="truncate">{r.name}</span>
                {r.days.slice(0, 5).map((d, j) => (
                  <span key={j} className={cn("rounded text-center tabular-nums", r.doubt === j && !reading && "bg-amber-500/15 font-medium text-amber-700 ring-1 ring-amber-500/40 [.site-app-dark_&]:text-amber-300")}>
                    {r.doubt === j && !reading ? "8·6" : d || "–"}
                  </span>
                ))}
                <span className="text-right font-medium tabular-nums">{r.total}</span>
                <span className="flex justify-end">
                  <Sure value={r.sure} className="w-8" />
                </span>
              </div>
            ))}
          </div>
          <div className="mt-auto flex items-center gap-2 border-t border-[var(--a-line)] px-5 py-2.5">
            <span className="text-[11.5px] text-[var(--a-muted)]">{t("inbox.workers", { count: open.workers })}</span>
            <Btn className="ml-auto">{t("inbox.reply")}</Btn>
            <Btn primary>
              {t("inbox.addToWeek")}
              <CornerDownLeft aria-hidden className="size-3 opacity-70" />
            </Btn>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

/* ---------------------------------------------------------------------------------------------- */
/* The week: Linear's list with its record panel and activity. One cell waits for a person.           */
/* ---------------------------------------------------------------------------------------------- */

export function WeekScreen({ decided = false, asking = true, className }: { decided?: boolean; asking?: boolean; className?: string }) {
  const t = useTranslations("site.app");
  const days = t("week.days").split(" ");
  const robert = WEEK[0]!;
  return (
    <AppShell
      area="weeks"
      className={className}
      counts={{ inbox: 3, check: decided ? 0 : 1 }}
      crumbs={[t("nav.weeks"), t("common.week")]}
      actions={
        <span className="flex items-center gap-2">
          <Avatars names={[ME, "Luis Ramírez"]} size={20} />
          <Btn primary className="hidden @md:inline-flex">
            {t("week.runPay")}
          </Btn>
        </span>
      }
      bar={
        <>
          <ViewTab active count={WEEK.length + 38}>
            {t("common.all")}
          </ViewTab>
          <ViewTab count={decided ? 0 : 1}>{t("nav.check")}</ViewTab>
          <ViewTab>{t("week.byClient")}</ViewTab>
          <Tools />
        </>
      }
      aside={
        <div className="flex h-full flex-col">
          <div className="border-b border-[var(--a-line)] p-4">
            <div className="flex items-center gap-2.5">
              <Avatar name={robert.name} size={28} />
              <div className="min-w-0">
                <p className="truncate text-[13px] font-semibold">{robert.name}</p>
                <p className="truncate text-[11px] text-[var(--a-muted)]">{t("week.assignment")}</p>
              </div>
            </div>
            <div className="mt-3">
              <Prop label={t("week.client")}>
                <Tag color={CLIENTS.northgate.color}>{CLIENTS.northgate.name}</Tag>
              </Prop>
              <Prop label={t("week.state")}>Illinois</Prop>
              <Prop label={t("week.payRate")}>
                <Money value="$18.25" className="font-medium" />
                <span className="text-[var(--a-faint)]">/h</span>
              </Prop>
              <Prop label={t("week.billRate")}>
                <Money value="$27.40" className="font-medium" />
                <span className="text-[var(--a-faint)]">/h</span>
              </Prop>
              <Prop label={t("week.sources")}>
                <Source kind="email" size={18} />
                <Source kind="clock" size={18} />
              </Prop>
            </div>
          </div>
          <div className="flex-1 p-4">
            <p className="text-[11.5px] font-medium">{t("week.activity")}</p>
            <ol className="relative mt-3 flex flex-col gap-3 before:absolute before:top-1 before:bottom-1 before:left-[8px] before:w-px before:bg-[var(--a-line)]">
              {[
                { who: "Lena Ortiz", text: t("week.ev1"), time: "8:42" },
                { who: "Tabulado", text: t("week.ev2"), time: "8:42" },
                ...(decided ? [{ who: ME, text: t("week.ev3", { who: ME }), time: t("week.now") }] : []),
              ].map((e, i) => (
                <li key={i} className={cn("relative flex gap-2.5 text-[11.5px] leading-snug", i === 2 && "animate-site-row-in")}>
                  <Avatar name={e.who} size={17} className="ring-2 ring-[var(--a-panel)]" />
                  <span className="min-w-0 text-[var(--a-muted)]">
                    {e.text}
                    <span className="ml-1 text-[var(--a-faint)]">· {e.time}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      }
    >
      <div className="grid grid-cols-[minmax(0,1fr)_3.4rem] border-b border-[var(--a-line)] bg-[var(--a-panel)] px-4 py-1.5 text-[10.5px] text-[var(--a-faint)] @xl/main:grid-cols-[minmax(0,1fr)_repeat(7,2.25rem)_3.4rem]">
        <span>{t("week.worker")}</span>
        {days.map((d, i) => (
          <span key={i} className="hidden text-center @xl/main:block">
            {d}
          </span>
        ))}
        <span className="text-right">{t("week.total")}</span>
      </div>
      {(Object.keys(CLIENTS) as (keyof typeof CLIENTS)[]).map((c) => (
        <div key={c}>
          <div className="flex h-7 items-center gap-2 border-b border-[var(--a-line-2)] px-4 text-[11.5px] font-medium">
            <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: CLIENTS[c].color }} />
            {CLIENTS[c].name}
            <span className="font-normal text-[var(--a-faint)]">{{ northgate: 12, prairie: 9, harbor: 14, lakeshore: 6, midway: 5 }[c]}</span>
          </div>
          {WEEK.filter((w) => w.client === c).map((r) => (
            <div key={r.name} className={cn("relative grid h-9 grid-cols-[minmax(0,1fr)_3.4rem] items-center border-b border-[var(--a-line-2)] px-4 text-[12px] @xl/main:grid-cols-[minmax(0,1fr)_repeat(7,2.25rem)_3.4rem]", r.doubt !== undefined && "bg-[var(--a-sel)]")}>
              <span className="flex min-w-0 items-center gap-2">
                <Status s={r.doubt !== undefined && !decided ? "check" : "done"} />
                <Avatar name={r.name} size={18} />
                <span className="truncate font-medium">{r.name}</span>
                <span className="hidden @3xl/main:inline-flex">
                  <Source kind={r.from} size={16} />
                </span>
              </span>
              {r.days.map((d, j) => (
                <span key={j} className="hidden justify-center @xl/main:flex">
                  {r.doubt === j ? (
                    <span className={cn("rounded px-1.5 py-0.5 text-[11.5px] font-medium tabular-nums site-crossfade", decided ? "bg-emerald-500/14 text-emerald-700 [.site-app-dark_&]:text-emerald-300" : "bg-amber-500/16 text-amber-700 ring-1 ring-amber-500/50 [.site-app-dark_&]:text-amber-300")}>{decided ? "8" : "8·6"}</span>
                  ) : (
                    <span className={cn("tabular-nums", d ? "" : "text-[var(--a-faint)]")}>{d || "·"}</span>
                  )}
                </span>
              ))}
              <span className="text-right font-medium tabular-nums">{r.total}</span>
              {/* Linear's popover on the cell: the two readings, and the person's choice. */}
              {r.doubt !== undefined && (
                <span className={cn("absolute top-8 right-[5.6rem] z-10 hidden w-[230px] rounded-lg bg-[var(--a-raise)] p-2.5 shadow-[var(--a-shadow),0_16px_40px_-12px_rgb(0_0_0/0.35)] site-crossfade @xl/main:block", asking && !decided ? "opacity-100" : "pointer-events-none -translate-y-1 opacity-0")}>
                  <span className="block text-[11px] font-medium">{t("week.differ")}</span>
                  <span className="mt-2 grid grid-cols-2 gap-1.5">
                    {[
                      { label: t("week.read1"), n: "8" },
                      { label: t("week.read2"), n: "6" },
                    ].map((x, k) => (
                      <span key={k} className={cn("flex flex-col rounded-md border px-2 py-1.5", k === 0 ? "border-[var(--a-accent)] bg-[var(--a-sel)]" : "border-[var(--a-line)]")}>
                        <span className="text-[10px] text-[var(--a-muted)]">{x.label}</span>
                        <span className="text-[16px] font-semibold tabular-nums">{x.n}</span>
                      </span>
                    ))}
                  </span>
                  <span className="mt-2 flex items-center justify-between text-[10.5px] text-[var(--a-muted)]">
                    {t("week.keep", { n: 8 })}
                    <Kbd>1</Kbd>
                  </span>
                </span>
              )}
            </div>
          ))}
        </div>
      ))}
    </AppShell>
  );
}

/* ---------------------------------------------------------------------------------------------- */
/* Pay run: Stripe's dashboard tiles over a table; Tran's row open on the engine's lines.             */
/* ---------------------------------------------------------------------------------------------- */

export function PayScreen({ demo, shown, className }: { demo: Demo; shown?: number; className?: string }) {
  const t = useTranslations("site.app");
  const n = Math.min(shown ?? demo.lines.length, demo.lines.length);
  const tiles = [
    { label: t("pay.workers"), value: "46", spark: [41, 43, 42, 44, 45, 44, 46] },
    { label: t("pay.hours"), value: "1,862:30", spark: [1710, 1790, 1760, 1820, 1801, 1840, 1862] },
    { label: t("pay.gross"), value: "$36,914.20", spark: [33.1, 34.6, 34, 35.8, 35.2, 36.1, 36.9] },
    { label: t("pay.overtime"), value: "41:00", spark: [52, 47, 49, 44, 46, 43, 41] },
  ];
  return (
    <AppShell
      area="payRuns"
      className={className}
      counts={{ inbox: 3, check: 0 }}
      crumbs={[t("nav.payRuns"), t("common.week")]}
      actions={
        <span className="flex items-center gap-2">
          <Badge tone={n === demo.lines.length ? "green" : "grey"} className="site-crossfade">
            {n === demo.lines.length ? t("pay.ready") : t("pay.working")}
          </Badge>
          <Btn primary className="hidden @md:inline-flex">
            {t("pay.makeFile")}
          </Btn>
        </span>
      }
    >
      <div className="grid grid-cols-2 border-b border-[var(--a-line)] @2xl/main:grid-cols-4">
        {tiles.map((x, i) => (
          <div key={x.label} className={cn("flex flex-col gap-1 px-4 pt-3 pb-2", i > 0 && "border-l border-[var(--a-line)]", i === 2 && "border-l-0 @2xl/main:border-l", i > 1 && "border-t border-[var(--a-line)] @2xl/main:border-t-0")}>
            <span className="text-[11px] text-[var(--a-muted)]">{x.label}</span>
            <span className="text-[17px] font-semibold tracking-[-0.02em] tabular-nums">{i === 2 ? <Money value={x.value} /> : x.value}</span>
            <Spark points={x.spark} className="h-5" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_4.75rem] border-b border-[var(--a-line)] bg-[var(--a-panel)] px-4 py-1.5 text-[10.5px] text-[var(--a-faint)] @xl/main:grid-cols-[minmax(0,1fr)_2.5rem_3.5rem_3.5rem_3.5rem_4.75rem]">
        <span>{t("week.worker")}</span>
        <span className="hidden @xl/main:block">{t("pay.state")}</span>
        <span className="hidden text-right @xl/main:block">{t("pay.reg")}</span>
        <span className="hidden text-right @xl/main:block">{t("pay.ot")}</span>
        <span className="hidden text-right @xl/main:block">{t("pay.dt")}</span>
        <span className="text-right">{t("pay.gross")}</span>
      </div>
      {/* Tran's week, open: the engine's lines with their reasons. */}
      <div className="border-b border-[var(--a-line)] bg-[var(--a-sel)]/40">
        <div className="grid h-9 grid-cols-[minmax(0,1fr)_4.75rem] items-center px-4 text-[12px] @xl/main:grid-cols-[minmax(0,1fr)_2.5rem_3.5rem_3.5rem_3.5rem_4.75rem]">
          <span className="flex min-w-0 items-center gap-2">
            <Status s={n === demo.lines.length ? "done" : "ready"} />
            <Avatar name="Tran Nguyen" size={18} />
            <span className="truncate font-medium">Tran Nguyen</span>
          </span>
          <span className="hidden @xl/main:block">
            <Badge tone="grey">IL</Badge>
          </span>
          <span className="hidden text-right tabular-nums @xl/main:block">40:00</span>
          <span className="hidden text-right font-medium text-[var(--a-accent)] tabular-nums @xl/main:block">8:00</span>
          <span className="hidden text-right text-[var(--a-faint)] @xl/main:block">—</span>
          <Odometer value={n === demo.lines.length ? demo.total : "$0.00"} className="justify-end text-right font-semibold" />
        </div>
        <ul className="px-4 pb-2.5 pl-[3.1rem]">
          {demo.lines.map((line, i) => (
            <li key={line.label} className={cn("flex flex-col gap-0.5 border-l-2 py-1.5 pl-3 site-crossfade", i === 1 ? "border-[var(--a-accent)]" : "border-[var(--a-line)]", i < n ? "opacity-100" : "translate-y-1 opacity-0")}>
              <span className="flex items-baseline justify-between gap-3 text-[11.5px]">
                <span className="font-medium">
                  {line.label} <span className="font-normal text-[var(--a-muted)]">· {line.hours}</span>
                </span>
                <Money value={line.amount} className="font-medium" />
              </span>
              <span className="line-clamp-1 text-[10.5px] leading-snug text-[var(--a-muted)] @2xl/main:line-clamp-2">{line.explain}</span>
            </li>
          ))}
        </ul>
      </div>
      {RUN.map((r) => (
        <div key={r.name} className="grid h-9 grid-cols-[minmax(0,1fr)_4.75rem] items-center border-b border-[var(--a-line-2)] px-4 text-[12px] @xl/main:grid-cols-[minmax(0,1fr)_2.5rem_3.5rem_3.5rem_3.5rem_4.75rem]">
          <span className="flex min-w-0 items-center gap-2">
            <Status s="done" />
            <Avatar name={r.name} size={18} />
            <span className="truncate">{r.name}</span>
          </span>
          <span className="hidden @xl/main:block">
            <Badge tone="grey">{r.state}</Badge>
          </span>
          <span className="hidden text-right tabular-nums @xl/main:block">{r.reg}</span>
          <span className={cn("hidden text-right tabular-nums @xl/main:block", r.ot === "—" ? "text-[var(--a-faint)]" : "text-[var(--a-accent)]")}>{r.ot}</span>
          <span className="hidden text-right text-[var(--a-faint)] @xl/main:block">{r.dt}</span>
          <Money value={r.gross} className="text-right font-medium" />
        </div>
      ))}
    </AppShell>
  );
}

/* ---------------------------------------------------------------------------------------------- */
/* Approvals: Attio's record list, and what the client sees.                                         */
/* ---------------------------------------------------------------------------------------------- */

export function ApprovalsScreen({ approved = 2, className }: { approved?: number; className?: string }) {
  const t = useTranslations("site.app");
  const state = (i: number) => (i < approved ? "approved" : APPROVALS[i]!.status === "approved" ? "opened" : APPROVALS[i]!.status);
  return (
    <AppShell
      area="approvals"
      className={className}
      counts={{ inbox: 3, check: 0 }}
      crumbs={[t("nav.approvals"), t("common.week")]}
      actions={
        <Btn>
          <Send aria-hidden className="size-3" />
          {t("approvals.remind")}
        </Btn>
      }
      bar={
        <>
          <ViewTab active count={APPROVALS.length}>
            {t("common.all")}
          </ViewTab>
          <ViewTab count={approved}>{t("approvals.approved")}</ViewTab>
          <ViewTab count={APPROVALS.length - approved}>{t("approvals.waiting")}</ViewTab>
          <Tools />
        </>
      }
      aside={
        <div className="flex h-full flex-col p-4">
          <p className="text-[11px] text-[var(--a-muted)]">{t("approvals.clientSees")}</p>
          <div className="mt-2 rounded-lg bg-[var(--a-raise)] p-3 shadow-[var(--a-shadow)]">
            <p className="text-[12.5px] font-semibold">{CLIENTS.northgate.name}</p>
            <p className="text-[11px] text-[var(--a-muted)]">
              {t("common.week")} · {t("inbox.workers", { count: 12 })} · 486:00
            </p>
            <div className="mt-3 flex flex-col gap-1.5">
              {WEEK.filter((w) => w.client === "northgate").map((w) => (
                <span key={w.name} className="flex items-center justify-between text-[11px]">
                  <span className="truncate">{w.name}</span>
                  <span className="tabular-nums">{w.doubt !== undefined ? "40:00" : w.total}</span>
                </span>
              ))}
              <span className="text-[10.5px] text-[var(--a-faint)]">{t("approvals.more", { count: 10 })}</span>
            </div>
            <span className={cn("mt-3 flex h-7 items-center justify-center gap-1.5 rounded-md text-[11.5px] font-medium site-crossfade", approved > 0 ? "bg-emerald-500/14 text-emerald-700 [.site-app-dark_&]:text-emerald-300" : "bg-[var(--a-accent)] text-white")}>
              {approved > 0 && <Check aria-hidden className="size-3" />}
              {approved > 0 ? t("approvals.approvedBy", { who: "Lena Ortiz" }) : t("approvals.approve")}
            </span>
          </div>
          <p className="mt-4 text-[11px] leading-snug text-[var(--a-muted)]">{t("approvals.note")}</p>
        </div>
      }
    >
      {APPROVALS.map((a, i) => {
        const s = state(i);
        return (
          <div key={a.client} className="flex h-11 items-center gap-3 border-b border-[var(--a-line-2)] px-4 text-[12px]">
            <span aria-hidden className="flex size-6 shrink-0 items-center justify-center rounded-md text-[10px] font-bold text-white" style={{ backgroundColor: CLIENTS[a.client].color }}>
              {CLIENTS[a.client].name[0]}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{CLIENTS[a.client].name}</span>
              <span className="block truncate text-[11px] text-[var(--a-muted)]">
                {a.who} · {t("inbox.workers", { count: a.workers })}
              </span>
            </span>
            <span className="hidden w-14 text-right tabular-nums @lg/main:block">{a.hours}</span>
            <Badge tone={s === "approved" ? "green" : s === "opened" ? "blue" : "grey"} className="w-[84px] justify-center site-crossfade">
              {t(`approvals.${s}`)}
            </Badge>
            <span className="hidden w-9 text-right text-[11px] text-[var(--a-faint)] tabular-nums @md/main:block">{a.time}</span>
          </div>
        );
      })}
    </AppShell>
  );
}

/* ---------------------------------------------------------------------------------------------- */
/* Invoices: Stripe's invoice beside its list.                                                        */
/* ---------------------------------------------------------------------------------------------- */

export function InvoicesScreen({ className }: { className?: string }) {
  const t = useTranslations("site.app");
  const tone = { approved: "blue", draft: "grey", sent: "amber", paid: "green" } as const;
  const lines = [
    { what: t("invoices.l1"), hours: "322:00", rate: "$27.40", amount: "$8,822.80" },
    { what: t("invoices.l2"), hours: "41:30", rate: "$41.10", amount: "$1,705.65" },
    { what: t("invoices.l3"), hours: "122:30", rate: "$31.75", amount: "$3,889.38" },
  ];
  return (
    <AppShell area="invoices" className={className} counts={{ inbox: 3, check: 0 }} crumbs={[t("nav.invoices"), "INV-1044"]} actions={<Btn primary>{t("invoices.send")}</Btn>}>
      <div className="flex h-full">
        <ul className="hidden w-[230px] shrink-0 border-r border-[var(--a-line)] @2xl/main:block">
          {INVOICES.map((inv, i) => (
            <li key={inv.no} className={cn("flex flex-col gap-1 border-b border-[var(--a-line-2)] px-3.5 py-2.5", i === 0 && "bg-[var(--a-sel)]")}>
              <span className="flex items-center gap-2 text-[12px]">
                <span className="truncate font-medium">{CLIENTS[inv.client].name}</span>
                <Money value={inv.total} className="ml-auto font-medium" />
              </span>
              <span className="flex items-center gap-2 text-[11px] text-[var(--a-muted)]">
                <Ref>{inv.no}</Ref>
                <span className="tabular-nums">{inv.hours}</span>
                <Badge tone={tone[inv.status]} className="ml-auto h-[18px] text-[10px]">
                  {t(`invoices.${inv.status}`)}
                </Badge>
              </span>
            </li>
          ))}
        </ul>
        {/* The invoice as the client receives it. */}
        <div className="flex min-w-0 flex-1 justify-center bg-[var(--a-panel)] p-4 @lg/main:p-6">
          <div className="w-full max-w-[440px] rounded-md bg-white p-5 text-[#17181e] shadow-[0_1px_2px_rgb(0_0_0/0.08),0_10px_30px_-12px_rgb(0_0_0/0.25)]">
            <div className="flex items-start justify-between">
              <span className="flex items-center gap-1.5 text-[12px] font-semibold">
                <span className="flex size-4 items-center justify-center rounded-[4px] bg-[linear-gradient(135deg,#5b6cff,#2bb59a)] text-[8px] font-bold text-white">{AGENCY[0]}</span>
                {AGENCY}
              </span>
              <span className="text-right">
                <span className="block text-[15px] font-semibold tracking-[-0.01em]">{t("invoices.invoice")}</span>
                <span className="block font-mono text-[10px] text-[#8a8c96]">INV-1044</span>
              </span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-[10.5px]">
              <span>
                <span className="block text-[#8a8c96]">{t("invoices.billTo")}</span>
                <span className="font-medium">{CLIENTS.northgate.name}</span>
              </span>
              <span className="text-right">
                <span className="block text-[#8a8c96]">{t("invoices.period")}</span>
                <span className="font-medium">{t("common.week")}</span>
              </span>
            </div>
            <div className="mt-4 grid grid-cols-[minmax(0,1fr)_3rem_3.25rem_4.5rem] gap-x-2 border-b border-black/10 pb-1 text-[9.5px] text-[#8a8c96]">
              <span>{t("invoices.what")}</span>
              <span className="text-right">{t("invoices.hours")}</span>
              <span className="text-right">{t("invoices.rate")}</span>
              <span className="text-right">{t("invoices.amount")}</span>
            </div>
            {lines.map((l) => (
              <div key={l.what} className="grid grid-cols-[minmax(0,1fr)_3rem_3.25rem_4.5rem] gap-x-2 border-b border-black/[0.06] py-1.5 text-[10.5px]">
                <span className="truncate">{l.what}</span>
                <span className="text-right tabular-nums">{l.hours}</span>
                <span className="text-right tabular-nums">{l.rate}</span>
                <span className="text-right tabular-nums">{l.amount}</span>
              </div>
            ))}
            <div className="mt-3 flex items-baseline justify-between">
              <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[9.5px] font-medium text-emerald-700">
                <Check aria-hidden className="size-2.5" />
                {t("invoices.backup")}
              </span>
              <span className="text-right">
                <span className="block text-[9.5px] text-[#8a8c96]">{t("invoices.due")}</span>
                <Money value="$24,114.25" className="text-[17px] font-semibold tracking-[-0.02em]" />
              </span>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

/* ---------------------------------------------------------------------------------------------- */
/* Payroll file: Vercel's build log beside its checks; the exporter's real lines.                    */
/* ---------------------------------------------------------------------------------------------- */

export function FileScreen({ demo, system = 0, linesShown, className }: { demo: Demo; system?: number; linesShown?: number; className?: string }) {
  const t = useTranslations("site.app");
  const file = demo.files[system]!;
  const n = linesShown ?? file.preview.length;
  const done = n >= file.preview.length;
  const checks = [t("file.c1", { count: file.workers, system: file.system }), t("file.c2", { amount: file.gross }), t("file.c3", { system: file.system, amount: file.theirs }), t("file.c4", { amount: file.difference })];
  return (
    <AppShell
      area="files"
      className={className}
      counts={{ inbox: 3, check: 0 }}
      crumbs={[t("nav.files"), t("common.week")]}
      actions={
        <Btn primary className={cn("site-crossfade", done ? "opacity-100" : "opacity-50")}>
          <Download aria-hidden className="size-3" />
          {t("file.download")}
        </Btn>
      }
      bar={
        <>
          {demo.files.map((f, i) => (
            <ViewTab key={f.system} active={i === system}>
              {f.system}
            </ViewTab>
          ))}
        </>
      }
    >
      <div className="flex h-full flex-col @2xl/main:flex-row">
        <ol className="flex shrink-0 flex-col gap-2.5 border-b border-[var(--a-line)] p-4 @2xl/main:w-[230px] @2xl/main:border-r @2xl/main:border-b-0">
          {checks.map((c, i) => {
            const ok = done || i < Math.floor((n / file.preview.length) * checks.length);
            return (
              <li key={i} className="flex items-start gap-2 text-[11.5px] leading-snug">
                <span className={cn("mt-px flex size-3.5 shrink-0 items-center justify-center rounded-full site-crossfade", ok ? "bg-emerald-500 text-white" : "border border-[var(--a-line)]")}>{ok && <Check aria-hidden className="size-2.5" strokeWidth={3} />}</span>
                <span className={ok ? "" : "text-[var(--a-faint)]"}>{c}</span>
              </li>
            );
          })}
          <li className="mt-1 flex items-center gap-1.5 text-[11px] text-[var(--a-accent)]">
            <ArrowUpRight aria-hidden className="size-3" />
            {t("file.how", { system: file.system })}
          </li>
        </ol>
        <div className="site-app-dark min-w-0 flex-1 bg-[#0c0d12] text-[#c9cbe0]">
          <div className="flex items-center gap-2 border-b border-white/[0.07] px-4 py-2 text-[11px]">
            <span className="truncate font-mono text-white/75">{file.filename}</span>
            <span className={cn("ml-auto flex shrink-0 items-center gap-1.5 text-emerald-300 site-crossfade", done ? "opacity-100" : "opacity-0")}>
              <span aria-hidden className="size-1.5 rounded-full bg-current" />
              {t("file.ready")}
            </span>
          </div>
          <pre className="overflow-hidden px-4 py-3 font-mono text-[10.5px] leading-[1.85]">
            {file.preview.map((line, i) => (
              <span key={`${file.system}-${i}`} className={cn("flex site-crossfade", i < n ? "opacity-100" : "opacity-0")}>
                <span aria-hidden className="mr-3 w-3 shrink-0 text-right text-white/25 select-none">
                  {i + 1}
                </span>
                <span className={cn("truncate", i === 0 && "text-[#aab4ff]")}>{line}</span>
              </span>
            ))}
          </pre>
          {/* Vercel's summary under the log: the file's control totals. */}
          <dl className={cn("mx-4 mb-4 grid grid-cols-2 overflow-hidden rounded-lg border border-white/[0.08] site-crossfade @lg/main:grid-cols-4", done ? "opacity-100" : "opacity-0")}>
            {[
              { k: t("file.workers"), v: file.workers },
              { k: t("file.gross"), v: file.gross },
              { k: t("file.theirs", { system: file.system }), v: file.theirs },
              { k: t("file.difference"), v: file.difference },
            ].map((x, i) => (
              <div key={x.k} className={cn("flex flex-col gap-1 px-3 py-2.5", i > 0 && "border-l border-white/[0.08]", i === 2 && "border-l-0 @lg/main:border-l", i > 1 && "border-t border-white/[0.08] @lg/main:border-t-0")}>
                <dt className="truncate text-[10.5px] text-white/45">{x.k}</dt>
                <dd className="text-[15px] font-semibold text-white tabular-nums">{i === 0 ? x.v : <Money value={x.v} />}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </AppShell>
  );
}

/* ---------------------------------------------------------------------------------------------- */
/* ⌘K: Raycast's and Linear's command menu over whatever screen is open.                             */
/* ---------------------------------------------------------------------------------------------- */

export function Palette({ query, active = 0, className }: { query: string; active?: number; className?: string }) {
  const t = useTranslations("site.app.palette");
  const groups = [
    { label: t("goTo"), items: [{ text: t("g1"), kbd: "G W" }, { text: t("g2"), kbd: "G C" }] },
    { label: t("actions"), items: [{ text: t("a1"), kbd: "⌘ ⏎" }, { text: t("a2"), kbd: "⌘ E" }, { text: t("a3"), kbd: "" }] },
  ];
  let k = -1;
  return (
    <div className={cn("w-full max-w-[520px] overflow-hidden rounded-xl bg-[var(--a-raise)] text-[var(--a-text)] shadow-[var(--a-shadow),0_30px_80px_-20px_rgb(0_0_0/0.55)] ring-1 ring-[var(--a-line)]", className)}>
      <div className="flex h-12 items-center gap-2.5 border-b border-[var(--a-line)] px-4">
        <Search aria-hidden className="size-4 text-[var(--a-muted)]" />
        <span className="text-[14px]">
          {query || <span className="text-[var(--a-faint)]">{t("placeholder")}</span>}
          <span aria-hidden className="ml-px inline-block h-4 w-px translate-y-0.5 bg-[var(--a-accent)] animate-site-caret" />
        </span>
        <Kbd className="ml-auto">esc</Kbd>
      </div>
      <div className="p-1.5">
        {groups.map((g) => (
          <div key={g.label} className="pb-1">
            <p className="px-2.5 pt-2 pb-1 text-[10.5px] font-medium text-[var(--a-faint)]">{g.label}</p>
            {g.items.map((it) => {
              k++;
              return (
                <span key={it.text} className={cn("flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[12.5px] site-crossfade", k === active ? "bg-[var(--a-chip)] text-[var(--a-text)]" : "text-[var(--a-muted)]")}>
                  <Status s={k === 1 ? "check" : k === 0 ? "ready" : "done"} className="size-3.5" />
                  <span className="flex-1 truncate">{it.text}</span>
                  {it.kbd && (
                    <span className="flex gap-0.5">
                      {it.kbd.split(" ").map((key) => (
                        <Kbd key={key}>{key}</Kbd>
                      ))}
                    </span>
                  )}
                </span>
              );
            })}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 border-t border-[var(--a-line)] px-4 py-2 text-[10.5px] text-[var(--a-faint)]">
        <span className="flex items-center gap-1">
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd>
          {t("move")}
        </span>
        <span className="flex items-center gap-1">
          <Kbd>⏎</Kbd>
          {t("open")}
        </span>
      </div>
    </div>
  );
}

