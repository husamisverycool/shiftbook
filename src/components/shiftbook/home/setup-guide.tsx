"use client";

// Pattern: docs/patterns/home.md — Polaris setup guide, as Shopify's own composition builds it
// (https://shopify.dev/docs/api/app-home/patterns/compositions/setup-guide): a card with "Setup guide",
// a dismiss (×) and a collapse (⌃) button; one intro line; "0 out of 3 steps completed" in the subdued
// colour; then the steps in a bordered box with dividers — each a checkbox and its title, with its own
// chevron button at the right; an open step shows, inset on a subdued rounded panel, its paragraph and
// its button. One step open at a time.
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
    <section aria-labelledby="setup-guide-title" className="flex flex-col gap-4 rounded-xl border bg-card p-4 shadow-xs" data-testid="setup-guide">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <h2 id="setup-guide-title" className="min-w-0 flex-1 text-sm font-semibold">
            {t("title")}
          </h2>
          <Button variant="ghost" size="icon-sm" className="text-foreground/60" onClick={hide} aria-label={t("hide")} title={t("hide")} data-testid="setup-hide">
            <XIcon />
          </Button>
          <Button variant="ghost" size="icon-sm" className="text-foreground/60 aria-expanded:bg-transparent aria-expanded:text-foreground/60 hover:aria-expanded:bg-muted" onClick={() => setCollapsed((c) => !c)} aria-expanded={!collapsed} aria-controls="setup-guide-steps" aria-label={collapsed ? t("expand") : t("collapse")} title={collapsed ? t("expand") : t("collapse")}>
            {collapsed ? <ChevronDownIcon /> : <ChevronUpIcon />}
          </Button>
        </div>
        <p className="text-sm">{done === steps.length ? t("allDone") : t("intro")}</p>
        <p className="text-sm text-muted-foreground tabular-nums" data-testid="setup-progress">
          {t("progress", { done, total: steps.length })}
        </p>
      </div>
      {!collapsed && (
        <ol id="setup-guide-steps" className="flex flex-col divide-y rounded-lg border">
          {steps.map((s) => {
            const expanded = open === s.key;
            return (
              <li key={s.key} data-testid={`setup-step-${s.key}`} data-done={s.done}>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 py-3 pr-3 pl-3 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset"
                  aria-expanded={expanded}
                  aria-controls={`setup-step-${s.key}-body`}
                  onClick={() => setOpen(expanded ? null : s.key)}
                >
                  {/* A checkbox the guide ticks itself when the step has happened (Polaris: "Mark tasks as complete when merchants finish them"). */}
                  <span aria-hidden className={cn("flex size-4 shrink-0 items-center justify-center rounded-[4px] border", s.done ? "border-foreground bg-foreground text-background" : "border-foreground/40 bg-background")}>
                    {s.done && <CheckIcon className="size-3" strokeWidth={3} />}
                  </span>
                  <span className="flex-1">{t(`steps.${s.key}.title`)}</span>
                  <span className="sr-only">{s.done ? t("done") : t("notDone")}</span>
                  {/* The step's own chevron, at the right as Polaris's tertiary icon button. */}
                  <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-md text-foreground/60">
                    {expanded ? <ChevronUpIcon className="size-4" /> : <ChevronDownIcon className="size-4" />}
                  </span>
                </button>
                {expanded && (
                  <div id={`setup-step-${s.key}-body`} className="px-3 pb-3">
                    {/* Inset on a subdued rounded panel, as Polaris's open step. */}
                    <div className="flex flex-col items-start gap-2 rounded-lg bg-muted/70 p-4 text-sm">
                      <p>
                        {t(`steps.${s.key}.body`)}
                        {s.key === "convert" && demo && <> {t("steps.convert.demo")}</>}
                        {s.key === "bank" && demo && <> {t("steps.bank.demo")}</>}
                      </p>
                      <Link href={s.href} className={buttonVariants({ size: "sm", variant: s.done ? "outline" : "default" })} data-testid={`setup-action-${s.key}`}>
                        {t(`steps.${s.key}.action`)}
                      </Link>
                    </div>
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
