"use client";

// Pattern: docs/patterns/settings/activity.md — Stripe Workbench events (the list on the left, the
// selected event's details on the right; filters applied; Refresh; Copy link; what changed); GitHub's
// audit log (who, what, when; the past three months; Export following the filters); Vercel's export
// with each change's previous and next state.
import { DownloadIcon, LinkIcon, RefreshCwIcon, XIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useId, useRef, useState, useTransition, type KeyboardEvent } from "react";
import { toast } from "sonner";
import { moreActivityAction } from "@/app/[locale]/(app)/settings/activity/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Link, useRouter } from "@/i18n/navigation";
import { ACTIVITY_EVENTS, type ActivityEvent } from "@/server/activity/events";
import { activityParams, activityQueryString, parseActivityFilters, type ActivityFilters } from "@/server/activity/filters";
import type { ActivityPage } from "@/server/activity/queries";
import { cn } from "@/lib/utils";
import { dateRange } from "../format";

type Props = { today: string; filters: ActivityFilters; page: ActivityPage; selected: ActivityEvent | null; options: { people: string[]; types: string[] }; record: ActivityEvent["record"] | null; zone: string };

/** The page for everyone else: who reads the agency's activity (the pattern's state). */
export function NotForActivity() {
  const t = useTranslations("activityLog");
  return (
    <div className="mx-auto flex w-full max-w-7xl min-w-0 flex-col gap-4 px-4 py-6">
      <div className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">{t("eyebrow")}</p>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
      </div>
      <p className="text-sm text-muted-foreground" data-testid="activity-not-for-role">
        {t("notForRole")}
      </p>
    </div>
  );
}

export function ActivityView({ today, filters, page, selected: initial, options, record, zone }: Props) {
  const t = useTranslations("activityLog");
  const tc = useTranslations("compliance");
  const locale = useLocale();
  const router = useRouter();
  const id = useId();
  const [events, setEvents] = useState(page.events);
  const [nextAfter, setNextAfter] = useState(page.nextAfter);
  const [selectedId, setSelectedId] = useState<number | null>(initial?.id ?? page.events[0]?.id ?? null);
  const [form, setForm] = useState({ from: filters.from, to: filters.to, person: filters.person ?? "", type: filters.type ?? "", action: filters.action ?? "" });
  const [loading, startLoading] = useTransition();
  const list = useRef<HTMLUListElement>(null);
  const selected = events.find((e) => e.id === selectedId) ?? (initial && initial.id === selectedId ? initial : null);
  const params = activityParams(filters, today);
  const query = activityQueryString(filters, today);

  const typeLabel = (type: string) => (t.has(`types.${type}`) ? t(`types.${type}` as "types.worker") : t("other"));
  const eventLabel = (event: string) => (t.has(`events.${event}`) ? t(`events.${event}` as "events.create") : event);
  // In the agency's own time, as the date filters count days (and the same on the server and in the browser).
  const when = (iso: string, seconds = false) => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: seconds ? "medium" : "short", timeZone: zone }).format(new Date(iso));
  // A duty is named by its kind, then its worker or client; a run or a day by its dates.
  const recordName = (r: ActivityEvent["record"]) => {
    const period = r.period ? (r.period.from === r.period.to ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${r.period.from}T00:00:00Z`)) : dateRange(r.period.from, r.period.to, locale)) : null;
    return [r.kind && tc.has(`kinds.${r.kind}`) ? tc(`kinds.${r.kind}` as "kinds.ma_job_order") : null, r.name, period].filter(Boolean).join(" · ");
  };

  const go = (next: Record<string, string>) => router.push(`/settings/activity${Object.keys(next).length > 0 ? `?${new URLSearchParams(next).toString()}` : ""}`);
  // Clear: the past three months, everyone, everything — the fields too, when the address already says so.
  const clear = () => {
    const d = parseActivityFilters({}, today);
    setForm({ from: d.from, to: d.to, person: "", type: "", action: "" });
    go({});
  };
  const apply = () => {
    const next: Record<string, string> = { ...(filters.record ? { record: `${filters.record.type}:${filters.record.id}` } : {}) };
    if (form.from) next.from = form.from;
    if (form.to) next.to = form.to;
    if (form.person) next.person = form.person;
    if (form.type) next.type = form.type;
    if (form.action) next.action = form.action;
    go(next);
  };
  const choose = (e: ActivityEvent) => {
    setSelectedId(e.id);
    // The address names the event, so Copy link opens it (no trip to the server).
    const url = new URL(window.location.href);
    url.searchParams.set("event", String(e.id));
    window.history.replaceState(null, "", url.toString());
  };
  const onListKey = (e: KeyboardEvent<HTMLUListElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const at = events.findIndex((x) => x.id === selectedId);
    const next = events[Math.min(events.length - 1, Math.max(0, at + (e.key === "ArrowDown" ? 1 : -1)))];
    if (!next) return;
    choose(next);
    list.current?.querySelector<HTMLButtonElement>(`[data-event-id="${next.id}"]`)?.focus();
  };
  const more = () =>
    startLoading(async () => {
      if (nextAfter === null) return;
      const r = await moreActivityAction(params, nextAfter);
      if (!r) return;
      setEvents((now) => [...now, ...r.events]);
      setNextAfter(r.nextAfter);
    });
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success(t("copied"));
    } catch {
      toast.error(window.location.href);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-7xl min-w-0 flex-col gap-5 px-4 py-6">
      <header className="flex flex-wrap items-end gap-3">
        <div className="mr-auto flex flex-col gap-1">
          <p className="text-sm text-muted-foreground">{t("eyebrow")}</p>
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
        </div>
        <Button variant="outline" size="sm" onClick={() => router.refresh()} data-testid="activity-refresh">
          <RefreshCwIcon />
          {t("refresh")}
        </Button>
        <Button variant="outline" size="sm" onClick={() => void copy()} data-testid="activity-copy-link">
          <LinkIcon />
          {t("copyLink")}
        </Button>
        <a href={`/api/files/activity${query ? `?${query}` : ""}`} className={buttonVariants({ size: "sm" })} download data-testid="activity-export">
          <DownloadIcon />
          {t("export")}
        </a>
      </header>

      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          apply();
        }}
        data-testid="activity-filters"
      >
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${id}-from`}>{t("from")}</Label>
          <Input id={`${id}-from`} type="date" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} className="w-40" data-testid="activity-from" />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${id}-to`}>{t("to")}</Label>
          <Input id={`${id}-to`} type="date" value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} className="w-40" data-testid="activity-to" />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${id}-person`}>{t("person")}</Label>
          <NativeSelect id={`${id}-person`} value={form.person} onChange={(e) => setForm({ ...form, person: e.target.value })} className="w-56" data-testid="activity-person">
            <NativeSelectOption value="">{t("everyone")}</NativeSelectOption>
            {options.people.map((p) => (
              <NativeSelectOption key={p} value={p}>
                {p}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${id}-type`}>{t("type")}</Label>
          <NativeSelect id={`${id}-type`} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="w-52" data-testid="activity-type">
            <NativeSelectOption value="">{t("allTypes")}</NativeSelectOption>
            {options.types
              .filter((x) => t.has(`types.${x}`))
              .map((x) => [x, typeLabel(x)] as const)
              .sort((a, b) => a[1].localeCompare(b[1], locale))
              .map(([x, label]) => (
                <NativeSelectOption key={x} value={x}>
                  {label}
                </NativeSelectOption>
              ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${id}-action`}>{t("action")}</Label>
          <NativeSelect id={`${id}-action`} value={form.action} onChange={(e) => setForm({ ...form, action: e.target.value })} className="w-60" data-testid="activity-action">
            <NativeSelectOption value="">{t("all")}</NativeSelectOption>
            {ACTIVITY_EVENTS.map((x) => (
              <NativeSelectOption key={x} value={x}>
                {eventLabel(x)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <Button type="submit" data-testid="activity-apply">
          {t("apply")}
        </Button>
        <Button type="button" variant="ghost" onClick={clear} data-testid="activity-clear">
          {t("clear")}
        </Button>
      </form>

      <div className="flex flex-wrap items-center gap-3">
        {filters.record && (
          <span className="inline-flex items-center gap-1 rounded-full border bg-muted/50 py-0.5 pr-1 pl-3 text-sm" data-testid="activity-record-chip">
            {t("record", { name: (record && recordName(record)) || typeLabel(filters.record.type) })}
            <button
              type="button"
              className="rounded-full p-1 text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={t("removeRecord")}
              onClick={() => go(Object.fromEntries(Object.entries(params).filter(([k]) => k !== "record")))}
              data-testid="activity-record-clear"
            >
              <XIcon className="size-3.5" />
            </button>
          </span>
        )}
        <p className="text-sm text-muted-foreground" aria-live="polite" data-testid="activity-count">
          {t("count", { count: page.total ?? events.length })}
        </p>
      </div>

      {events.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-lg border p-6 text-sm" data-testid="activity-empty">
          <p>{t("noMatch")}</p>
          <Button variant="outline" size="sm" onClick={clear}>
            {t("clearFilters")}
          </Button>
        </div>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
          <div className="flex min-w-0 flex-col gap-3">
            <ul ref={list} aria-label={t("listLabel")} className="flex flex-col divide-y overflow-hidden rounded-lg border" onKeyDown={onListKey} data-testid="activity-list">
              {events.map((e) => {
                const on = e.id === selectedId;
                // A light background and a bar on the left mark the chosen row (its grey text stays readable).
                return (
                  <li key={e.id}>
                    <button
                      type="button"
                      data-event-id={e.id}
                      aria-current={on ? "true" : undefined}
                      onClick={() => choose(e)}
                      className={cn("flex w-full min-w-0 flex-col gap-0.5 px-4 py-2.5 text-left text-sm outline-none hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset", on && "bg-muted/40 shadow-[inset_3px_0_0_var(--color-primary)]")}
                      data-testid="activity-row"
                    >
                      <span className="truncate">
                        <span className="font-medium">{eventLabel(e.event)}</span>
                        <span className="text-muted-foreground"> · {typeLabel(e.entityType)}</span>
                        {recordName(e.record) && <span> · {recordName(e.record)}</span>}
                        {e.record.gone && <span className="text-muted-foreground"> · {t("gone")}</span>}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">{t("byAt", { who: e.actor, when: when(e.at) })}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {nextAfter !== null && (
              <Button variant="outline" onClick={more} disabled={loading} className="self-start" data-testid="activity-more">
                {t("loadMore")}
              </Button>
            )}
          </div>
          <Details event={selected} typeLabel={typeLabel} eventLabel={eventLabel} recordName={recordName} when={when} onRecord={(e) => go({ ...Object.fromEntries(Object.entries(params).filter(([k]) => k !== "type")), record: `${e.entityType}:${e.entityId}` })} />
        </div>
      )}
    </div>
  );
}

/** One value as the log keeps it: text as is, anything else as JSON. */
const shown = (v: unknown) => (v === undefined || v === null ? "—" : typeof v === "string" ? v : JSON.stringify(v));

function Details({ event: e, typeLabel, eventLabel, recordName, when, onRecord }: { event: ActivityEvent | null; typeLabel: (t: string) => string; eventLabel: (e: string) => string; recordName: (r: ActivityEvent["record"]) => string; when: (iso: string, seconds?: boolean) => string; onRecord: (e: ActivityEvent) => void }) {
  const t = useTranslations("activityLog.details");
  if (!e) return <p className="rounded-lg border p-6 text-sm text-muted-foreground">{t("none")}</p>;
  const before = (e.before && typeof e.before === "object" ? e.before : {}) as Record<string, unknown>;
  const after = (e.after && typeof e.after === "object" ? e.after : {}) as Record<string, unknown>;
  const fields = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  const name = recordName(e.record);
  return (
    <section className="flex min-w-0 flex-col gap-5 rounded-lg border p-5 lg:sticky lg:top-4" aria-labelledby="activity-details-title" data-testid="activity-details">
      <h2 id="activity-details-title" className="text-lg font-semibold">
        {eventLabel(e.event)} <span className="font-normal text-muted-foreground">· {typeLabel(e.entityType)}</span>
      </h2>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-[minmax(7rem,auto)_1fr]">
        <dt className="text-muted-foreground">{t("when")}</dt>
        <dd className="tabular-nums">{when(e.at, true)}</dd>
        <dt className="text-muted-foreground">{t("who")}</dt>
        <dd>{e.actor}</dd>
        <dt className="text-muted-foreground">{t("record")}</dt>
        <dd className="flex min-w-0 flex-col items-start gap-1">
          {e.record.href ? (
            <Link href={e.record.href} className="underline-offset-4 hover:underline" data-testid="activity-record-link">
              {name || typeLabel(e.entityType)}
            </Link>
          ) : (
            <span>
              {name || typeLabel(e.entityType)}
              {e.record.gone && <span className="text-muted-foreground"> · {t("gone")}</span>}
            </span>
          )}
          <button type="button" onClick={() => onRecord(e)} className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground" data-testid="activity-show-record">
            {t("showRecord")}
          </button>
        </dd>
        {e.reason && (
          <>
            <dt className="text-muted-foreground">{t("reason")}</dt>
            <dd data-testid="activity-reason">{e.reason}</dd>
          </>
        )}
      </dl>
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">{t("changes")}</h3>
        {fields.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noChanges")}</p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm" data-testid="activity-changes">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">
                    {t("field")}
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    {t("before")}
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    {t("after")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {fields.map((f) => (
                  <tr key={f} className="align-top">
                    <td className="px-3 py-2 font-mono text-xs">{f}</td>
                    <td className="px-3 py-2 break-all text-muted-foreground">{f in before ? shown(before[f]) : "—"}</td>
                    <td className="px-3 py-2 break-all">{f in after ? shown(after[f]) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">{t("data")}</summary>
        <pre className="mt-2 max-h-72 overflow-auto rounded-md bg-muted/50 p-3 text-xs">{JSON.stringify({ id: e.id, at: e.at, actor: e.actor, action: e.action, entityType: e.entityType, entityId: e.entityId, reason: e.reason, before: e.before, after: e.after }, null, 2)}</pre>
      </details>
    </section>
  );
}
