// A status as Linear's lists draw one (https://linear.app/docs/filters): a small circle-family icon in
// its tone at the row's left and on its group's band. Lucide's icons, never Linear's; the tones are the
// status badges' (_components/status.md).
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Tone } from "./status";

export interface RowIcon {
  icon: LucideIcon;
  tone: Tone;
  label: string;
}

/** Each tone's icon colour: Tailwind's default palette, as the status badges. */
const ICON_TONE: Record<Tone, string> = {
  neutral: "text-muted-foreground",
  info: "text-sky-600 dark:text-sky-400",
  success: "text-emerald-600 dark:text-emerald-400",
  warning: "text-amber-500 dark:text-amber-400",
  critical: "text-red-600 dark:text-red-400",
};

/** `decorative`: beside words that already say it (a group's band), so hidden from screen readers. */
export function StatusIcon({ status, decorative, className }: { status: RowIcon; decorative?: boolean; className?: string }) {
  const Icon = status.icon;
  const cls = cn("size-4 shrink-0", ICON_TONE[status.tone], className);
  return decorative ? <Icon className={cls} aria-hidden /> : <Icon className={cls} aria-label={status.label} role="img" />;
}
