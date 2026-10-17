// Status badges (decision 0029; docs/patterns/_components/status.md): Stripe's small tinted badge as
// its current lists draw it (https://docs.stripe.com/connect/dashboard/review-actionable-accounts) — the
// word only, no dot, no icon, on a light tint inside a hairline of the same tone. One tone per meaning.
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export type Tone = "neutral" | "info" | "success" | "warning" | "critical";

/** Tailwind's default palette: the lightest tint, its hairline, the word in the tone's dark shade. */
export const TONE_CLASSES: Record<Tone, string> = {
  neutral: "border-border bg-muted text-foreground/70",
  info: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-200",
  success: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  warning: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200",
  critical: "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200",
};

/** A status; `size="lg"` beside a detail page's title. */
export function Status({ tone, size = "default", className, children, ...props }: ComponentProps<"span"> & { tone: Tone; size?: "default" | "lg" }) {
  return (
    <span
      data-tone={tone}
      className={cn("inline-flex w-fit shrink-0 items-center rounded-[5px] border font-medium whitespace-nowrap", size === "lg" ? "h-6 px-2 text-sm" : "h-5 px-1.5 text-xs", TONE_CLASSES[tone], className)}
      {...props}
    >
      {children}
    </span>
  );
}
