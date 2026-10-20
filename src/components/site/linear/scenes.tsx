// Pattern: docs/patterns/site.md — Linear's product scenes (linear.app, 2026-10-20): a full app screen set
// back and dimmed, fading into the page at its right and bottom edges, with one brighter panel standing in
// front of it (Linear's Slack thread over the board; its chart card over the timeline). Ours use the app's
// own screens in the dark theme, sample data, the engine's pay lines and the exporters' files.
import { Check, CornerDownLeft, MessageSquare } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import type { Demo } from "@/components/site/app/data";
import { AppWindow } from "@/components/site/app/frame";
import { Avatar } from "@/components/site/app/kit";
import { ApprovalsScreen, FileScreen, InboxScreen, PayScreen } from "@/components/site/app/screens";
import { cn } from "@/lib/utils";

function Stage({ back, front, side = "left", height = 540 }: { back: ReactNode; front: ReactNode; side?: "left" | "right"; height?: number }) {
  return (
    <div className="relative" style={{ height }}>
      <div aria-hidden className="absolute inset-x-[10%] top-10 bottom-0 rounded-[50%] bg-[radial-gradient(closest-side,rgba(255,255,255,0.05),transparent)] blur-2xl" />
      <div className={cn("absolute top-12 bottom-0 w-[min(1180px,92%)] opacity-80 [mask-image:linear-gradient(to_bottom,#000_55%,transparent),linear-gradient(to_right,transparent,#000_8%,#000_80%,transparent)] [mask-composite:intersect]", side === "left" ? "left-[14%]" : "left-[2%]")}>
        <AppWindow dark className="h-full rounded-xl shadow-none">
          <div aria-hidden className="h-full">{back}</div>
        </AppWindow>
      </div>
      <div className={cn("absolute top-0 z-10 hidden w-[380px] md:block", side === "left" ? "left-[3%]" : "right-[4%]")}>{front}</div>
    </div>
  );
}

function Card({ title, icon, children }: { title: ReactNode; icon?: ReactNode; children: ReactNode }) {
  return (
    <div aria-hidden className="site-app site-app-dark overflow-hidden rounded-xl bg-[#121314] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)] ring-1 ring-white/[0.08]">
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-3 text-[13px] font-[510] text-[var(--a-text)]">
        {icon}
        {title}
      </div>
      {children}
    </div>
  );
}

/** Intake: the client's text thread over the inbox. */
export function IntakeScene() {
  const t = useTranslations("site.linear.scenes.intake");
  const messages = [
    { who: "María José Fernández Ruiz", time: "7:24", text: t("m1") },
    { who: "Lena Ortiz", time: "7:31", text: t("m2") },
    { who: "María José Fernández Ruiz", time: "7:33", text: t("m3") },
  ];
  return (
    <Stage
      back={<InboxScreen className="h-full" />}
      front={
        <Card title={t("title")} icon={<MessageSquare className="size-3.5 text-[var(--a-muted)]" />}>
          <ul className="flex flex-col gap-4 px-4 py-4">
            {messages.map((m, i) => (
              <li key={i} className="flex gap-3">
                <Avatar name={m.who} size={26} />
                <div className="min-w-0">
                  <p className="text-[13px] text-[var(--a-text)]">
                    <span className="font-[510]">{m.who.split(" ")[0]}</span> <span className="text-[11px] text-[var(--a-faint)]">{m.time}</span>
                  </p>
                  <p className="mt-0.5 text-[13px] leading-snug text-[var(--a-muted)]">{m.text}</p>
                </div>
              </li>
            ))}
          </ul>
          <div className="mx-3 mb-3 flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-2.5 ring-1 ring-white/[0.06]">
            <span className="text-[13px] text-[var(--a-muted)]">{t("action")}</span>
            <span className="inline-flex size-6 items-center justify-center rounded-md bg-[var(--a-accent)] text-[#0c0d11]">
              <CornerDownLeft className="size-3.5" />
            </span>
          </div>
        </Card>
      }
    />
  );
}

/** Wage rules: the California day chart over the pay run. */
export function RulesScene({ demo, days }: { demo: Demo; days: { label: string; minutes: number }[] }) {
  const t = useTranslations("site.linear.scenes.rules");
  const max = 14 * 60;
  return (
    <Stage
      side="right"
      back={<PayScreen demo={demo} className="h-full" />}
      front={
        <Card title={t("title")}>
          <div className="relative mx-4 mt-4 mb-2 h-48">
            {[
              { m: 480, label: t("eight") },
              { m: 720, label: t("twelve") },
            ].map((l) => (
              <div key={l.m} className="absolute inset-x-0 border-t border-dashed border-white/20" style={{ bottom: `${(l.m / max) * 100}%` }}>
                <span className="absolute -top-4 right-0 text-[10px] text-[var(--a-faint)]">{l.label}</span>
              </div>
            ))}
            <div className="absolute inset-0 flex items-end justify-between gap-3 px-1">
              {days.map((d) => (
                <div key={d.label} className="flex w-full max-w-9 flex-col-reverse overflow-hidden rounded-[4px]" style={{ height: `${(d.minutes / max) * 100}%` }}>
                  <span className="block bg-white/20" style={{ height: `${(Math.min(d.minutes, 480) / d.minutes) * 100}%` }} />
                  <span className="block bg-[#6fb6ff]" style={{ height: `${(Math.min(Math.max(d.minutes - 480, 0), 240) / d.minutes) * 100}%` }} />
                  <span className="block bg-[#e0b04c]" style={{ height: `${(Math.max(d.minutes - 720, 0) / d.minutes) * 100}%` }} />
                </div>
              ))}
            </div>
          </div>
          <div className="flex justify-between px-5 pb-4 text-[11px] text-[var(--a-faint)]">
            {days.map((d) => (
              <span key={d.label}>{d.label}</span>
            ))}
          </div>
        </Card>
      }
    />
  );
}

/** Approvals: the client's email over the approvals list. */
export function ApprovalsScene() {
  const t = useTranslations("site.linear.scenes.approvals");
  return (
    <Stage
      back={<ApprovalsScreen className="h-full" />}
      front={
        <Card title={t("subject")}>
          <div className="px-4 py-4">
            <p className="text-[13px] text-[var(--a-text)]">{t("from")}</p>
            <p className="mt-3 text-[13px] leading-relaxed text-[var(--a-muted)]">{t("body")}</p>
            <div className="mt-4 overflow-hidden rounded-lg ring-1 ring-white/[0.06]">
              {[
                ["Robert Jones", "40:00"],
                ["María José Fernández Ruiz", "38:00"],
                ["DeShawn Carter", "40:00"],
              ].map(([n, h]) => (
                <div key={n} className="flex items-center justify-between border-b border-white/[0.05] px-3 py-2 text-[12px] last:border-b-0">
                  <span className="text-[var(--a-text)]">{n}</span>
                  <span className="text-[var(--a-muted)] tabular-nums">{h}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 flex gap-2">
              <span className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[var(--a-accent)] px-3 text-[12px] font-[510] text-[#0c0d11]">
                <Check className="size-3.5" />
                {t("approve")}
              </span>
              <span className="inline-flex h-8 items-center rounded-md px-3 text-[12px] text-[var(--a-text)] ring-1 ring-white/10">{t("question")}</span>
            </div>
          </div>
        </Card>
      }
    />
  );
}

/** Payroll files: the control totals over the file. */
export function FileScene({ demo, l }: { demo: Demo; l: { workers: string; gross: string; theirs: string; difference: string } }) {
  const t = useTranslations("site.linear.scenes.file");
  const f = demo.files[0]!;
  return (
    <Stage
      side="right"
      back={<FileScreen demo={demo} className="h-full" />}
      front={
        <Card title={t("title")}>
          <dl className="px-4 py-2">
            {[
              [l.workers, f.workers],
              [l.gross, f.gross],
              [l.theirs, f.theirs],
              [l.difference, f.difference],
            ].map(([k, v], i) => (
              <div key={k} className="flex items-baseline justify-between gap-4 border-b border-white/[0.05] py-2.5 text-[13px] last:border-b-0">
                <dt className="text-[var(--a-muted)]">{k}</dt>
                <dd className={cn("tabular-nums", i === 3 ? "text-[var(--a-accent)]" : "text-[var(--a-text)]")}>{v}</dd>
              </div>
            ))}
          </dl>
          <p className="border-t border-white/[0.06] px-4 py-3 text-[12px] leading-relaxed text-[var(--a-faint)]">{t("note")}</p>
        </Card>
      }
    />
  );
}
