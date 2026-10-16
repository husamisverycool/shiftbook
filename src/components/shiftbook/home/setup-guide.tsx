"use client";

// Pattern: docs/patterns/home.md — Polaris setup guide, as its published screenshot shows it: "Setup
// guide" with hide and collapse buttons, one intro line, "0 out of 3 steps completed", then the steps
// in a bordered box, each a checkbox, its title and a chevron; one step open at a time.
import { CheckIcon, ChevronDownIcon, ChevronUpIcon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Link, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import type { SetupStep } from "@/server/home/queries";

export const GUIDE_COOKIE = "shiftbook_setup_guide";

export interface GuideStep {
  key: SetupStep;
  done: boolean;
  href: string | { pathname: string; query: Record<string, string> };
}

export function SetupGuide({ steps, demo }: { steps: GuideStep[]; demo: boolean }) {
  const t = useTranslations("home.guide");
  const router = useRouter();
  const done = steps.filter((s) => s.done).length;
  const [open, setOpen] = useState<SetupStep | null>(steps.find((s) => !s.done)?.key ?? null);
  const [collapsed, setCollapsed] = useState(false);

  const hide = () => {
    // A convenience kept on this browser (a year), read by Home on the server.
    document.cookie = `${GUIDE_COOKIE}=hidden; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  };

  return (
    <section aria-labelledby="setup-guide-title" className="flex flex-col gap-4 rounded-xl border bg-card p-5 shadow-xs" data-testid="setup-guide">
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <h2 id="setup-guide-title" className="text-base font-semibold">
            {t("title")}
          </h2>
          <p className="text-sm">{done === steps.length ? t("allDone") : t("intro")}</p>
          <p className="text-sm tabular-nums" data-testid="setup-progress">
            {t("progress", { done, total: steps.length })}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button variant="ghost" size="icon-sm" onClick={hide} aria-label={t("hide")} title={t("hide")} data-testid="setup-hide">
            <XIcon />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => setCollapsed((c) => !c)} aria-expanded={!collapsed} aria-controls="setup-guide-steps" aria-label={collapsed ? t("expand") : t("collapse")} title={collapsed ? t("expand") : t("collapse")}>
            {collapsed ? <ChevronDownIcon /> : <ChevronUpIcon />}
          </Button>
        </div>
      </div>
      {!collapsed && (
        <ol id="setup-guide-steps" className="flex flex-col divide-y rounded-lg border">
          {steps.map((s) => {
            const expanded = open === s.key;
            return (
              <li key={s.key} className={cn(expanded && "bg-muted/40")} data-testid={`setup-step-${s.key}`} data-done={s.done}>
                <button
                  type="button"
                  className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset"
                  aria-expanded={expanded}
                  aria-controls={`setup-step-${s.key}-body`}
                  onClick={() => setOpen(expanded ? null : s.key)}
                >
                  {/* A checkbox the guide ticks itself when the step has happened (Polaris). */}
                  <span aria-hidden className={cn("flex size-5 shrink-0 items-center justify-center rounded-[5px] border", s.done ? "border-foreground bg-foreground text-background" : "border-input bg-background")}>
                    {s.done && <CheckIcon className="size-3.5" strokeWidth={3} />}
                  </span>
                  <span className="flex-1">{t(`steps.${s.key}.title`)}</span>
                  <span className="sr-only">{s.done ? t("done") : t("notDone")}</span>
                  <ChevronDownIcon className={cn("size-4 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-180")} aria-hidden />
                </button>
                {expanded && (
                  <div id={`setup-step-${s.key}-body`} className="flex flex-col items-start gap-3 pr-4 pb-4 pl-12 text-sm">
                    <p className="text-muted-foreground">
                      {t(`steps.${s.key}.body`)}
                      {s.key === "convert" && demo && <> {t("steps.convert.demo")}</>}
                    </p>
                    <Link href={s.href} className={buttonVariants({ size: "sm", variant: s.done ? "outline" : "default" })} data-testid={`setup-action-${s.key}`}>
                      {t(`steps.${s.key}.action`)}
                    </Link>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

/** Home's header button that brings a hidden guide back. */
export function ShowGuide({ label }: { label: string }) {
  const router = useRouter();
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => {
        document.cookie = `${GUIDE_COOKIE}=; path=/; max-age=0; samesite=lax`;
        router.refresh();
      }}
      data-testid="setup-show"
    >
      {label}
    </Button>
  );
}
