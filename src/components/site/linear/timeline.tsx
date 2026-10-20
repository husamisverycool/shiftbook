// Pattern: docs/patterns/site.md — Linear's project timeline (linear.app, the "Plan" part of its homepage,
// 2026-10-20): a month axis across the top with faint vertical gridlines, a lit "Today" line with its date
// in a pill, and each item a diamond milestone on its own row at its date, named beside it. Here the
// milestones are the dated rows of Tabulado's own minimum-wage tables: those in force grey, those still
// to come white with the days left. Narrow screens scroll the timeline sideways.
import { cn } from "@/lib/utils";

export interface TimelineEntry {
  key: string;
  title: string;
  citation: string;
  date: string;
  /** Days from today; zero or less once in force. */
  daysUntil: number;
  /** Days from the epoch, for placing it. */
  day: number;
  until: string;
}

const DAY = 86_400_000;
const dayOf = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / DAY);

export function Timeline({ id, title, body, todayLabel, today, todayText, entries, month }: { id: string; title: string; body: string; todayLabel: string; today: string; todayText: string; entries: TimelineEntry[]; month: (iso: string) => string }) {
  const now = dayOf(today);
  const days = [now, ...entries.map((e) => e.day)];
  // From the first of the month before the earliest date to the first of the month after the latest.
  const first = new Date(Math.min(...days) * DAY);
  const last = new Date(Math.max(...days) * DAY);
  const start = Date.UTC(first.getUTCFullYear(), first.getUTCMonth() - 1, 1) / DAY;
  const end = Date.UTC(last.getUTCFullYear(), last.getUTCMonth() + 2, 1) / DAY;
  const x = (d: number) => `${((d - start) / (end - start)) * 100}%`;
  const months: string[] = [];
  for (let m = new Date(start * DAY); m.getTime() / DAY < end; m = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1))) months.push(m.toISOString().slice(0, 10));
  const sorted = [...entries].sort((a, b) => a.day - b.day);

  return (
    <section aria-labelledby={id} className="py-32 md:py-40">
      <div className="mx-auto w-full max-w-[1440px] px-6 md:px-20">
        <div className="site-reveal grid grid-cols-1 gap-6 md:grid-cols-2">
          <h2 id={id} className="l-title-6 text-[var(--l-text)]">
            {title}
          </h2>
          <p className="max-w-[34ch] l-title-2 text-[var(--l-text-3)]">{body}</p>
        </div>

        <div className="site-reveal mt-16 hidden overflow-x-auto rounded-xl md:block border border-white/[0.08] bg-[var(--l-panel)] [--reveal-delay:120ms] md:mt-20">
          <div className="relative min-w-[900px]">
            {/* The month axis and its gridlines. */}
            <div className="relative h-11 border-b border-white/[0.06]">
              {months.filter((m) => Math.abs(dayOf(m) + 12 - now) > 16).map((m) => (
                <span key={m} className="absolute top-0 flex h-full items-center pl-3 l-text-mini text-[var(--l-text-4)]" style={{ left: x(dayOf(m)) }}>
                  {month(m)}
                </span>
              ))}
            </div>
            <div aria-hidden className="pointer-events-none absolute inset-x-0 top-11 bottom-0">
              {months.map((m) => (
                <span key={m} className="absolute inset-y-0 w-px bg-white/[0.04]" style={{ left: x(dayOf(m)) }} />
              ))}
              {/* The upcoming stretch, faintly lit. */}
              <span className="absolute inset-y-0 right-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.025),transparent)]" style={{ left: x(now) }} />
            </div>

            {/* Today. */}
            <div className="pointer-events-none absolute top-0 bottom-0 z-10" style={{ left: x(now) }}>
              <span className="absolute top-2.5 -translate-x-1/2 rounded-md bg-[var(--l-text)] px-1.5 py-0.5 l-text-micro font-[510] whitespace-nowrap text-[var(--l-bg)]" title={todayText}>
                {todayLabel}
              </span>
              <span className="absolute top-11 bottom-0 w-px -translate-x-1/2 bg-[var(--l-text)]/70 shadow-[0_0_12px_rgba(255,255,255,0.5)]" />
            </div>

            {/* One row per change. */}
            <ol className="relative z-20 py-4">
              {sorted.map((e, i) => {
                const coming = e.daysUntil > 0;
                const left = (e.day - start) / (end - start) > 0.62;
                return (
                  <li key={e.key} className="site-reveal relative h-16" style={{ ["--reveal-delay" as string]: `${200 + i * 90}ms` }}>
                    <span aria-hidden className={cn("absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[2px]", coming ? "bg-[var(--l-text)] shadow-[0_0_12px_rgba(255,255,255,0.6)]" : "bg-[var(--l-text-4)]")} style={{ left: x(e.day) }} />
                    <div className={cn("absolute top-1/2 z-20 flex -translate-y-1/2 flex-col", left ? "mr-4 items-end" : "ml-4")} style={left ? { right: `calc(100% - ${x(e.day)})` } : { left: x(e.day) }}>
                      <span className="flex items-center gap-2 rounded-md bg-[var(--l-panel)] px-1.5 whitespace-nowrap">
                        <span className={cn("l-text-regular font-[510]", coming ? "text-[var(--l-text)]" : "text-[var(--l-text-3)]")}>{e.title}</span>
                        {coming && <span className="rounded-md bg-white/[0.08] px-1.5 py-0.5 l-text-micro text-[var(--l-text-2)]">{e.until}</span>}
                      </span>
                      <span className="mt-0.5 rounded-md bg-[var(--l-panel)] px-1.5 l-text-mini whitespace-nowrap text-[var(--l-text-4)]">
                        {e.date}, {e.citation}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>

        {/* Phones: the same milestones down the page, "Today" between those in force and those to come. */}
        <ol className="mt-12 flex flex-col md:hidden">
          {sorted.map((e, i) => {
            const coming = e.daysUntil > 0;
            const firstComing = coming && (i === 0 || sorted[i - 1]!.daysUntil <= 0);
            return (
              <li key={e.key} className="site-reveal">
                {firstComing && (
                  <div className="flex items-center gap-3 py-3">
                    <span className="rounded-md bg-[var(--l-text)] px-1.5 py-0.5 l-text-micro font-[510] text-[var(--l-bg)]">{todayLabel}</span>
                    <span className="h-px flex-1 bg-[var(--l-text)]/60 shadow-[0_0_10px_rgba(255,255,255,0.4)]" />
                  </div>
                )}
                <div className="flex gap-4 border-l border-white/[0.08] py-3 pl-5">
                  <span aria-hidden className={cn("mt-1.5 -ml-[26px] size-2.5 shrink-0 rotate-45 rounded-[2px]", coming ? "bg-[var(--l-text)] shadow-[0_0_10px_rgba(255,255,255,0.6)]" : "bg-[var(--l-text-4)]")} />
                  <div className="min-w-0">
                    <p className={cn("l-text-regular font-[510]", coming ? "text-[var(--l-text)]" : "text-[var(--l-text-3)]")}>{e.title}</p>
                    <p className="mt-0.5 l-text-mini text-[var(--l-text-4)]">
                      {e.date}, {e.citation}
                    </p>
                    {coming && <span className="mt-2 inline-block rounded-md bg-white/[0.08] px-1.5 py-0.5 l-text-micro text-[var(--l-text-2)]">{e.until}</span>}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
