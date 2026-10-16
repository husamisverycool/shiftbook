// Status badges (decision 0029; docs/patterns/_components/status.md): Stripe's small tinted badge,
// the word only — no dot, no icon. One tone per meaning across the app.
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export type Tone = "neutral" | "info" | "success" | "warning" | "critical";

/** Tailwind's default palette: a light tint, the word in the tone's dark shade. */
export const TONE_CLASSES: Record<Tone, string> = {
  neutral: "bg-muted text-foreground/70",
  info: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  success: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  warning: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  critical: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
};

/** A status; `size="lg"` beside a detail page's title. */
export function Status({ tone, size = "default", className, children, ...props }: ComponentProps<"span"> & { tone: Tone; size?: "default" | "lg" }) {
  return (
    <span
      data-tone={tone}
      className={cn("inline-flex w-fit shrink-0 items-center rounded-[4px] font-medium whitespace-nowrap", size === "lg" ? "h-6 px-2 text-sm" : "h-5 px-1.5 text-xs", TONE_CLASSES[tone], className)}
      {...props}
    >
      {children}
    </span>
  );
}
