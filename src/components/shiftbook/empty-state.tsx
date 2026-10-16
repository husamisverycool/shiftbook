// Empty states (decision 0029; docs/patterns/_components/empty-state.md): Linear's and Stripe's —
// a small muted icon, what is missing, what to do, the one action. No box, no tinted circle.
import { CircleAlertIcon, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondary,
  kind = "first",
  className,
  testId,
}: {
  icon?: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  secondary?: ReactNode;
  /** First use, filters that hide everything, or something that went wrong. */
  kind?: "first" | "filtered" | "error";
  className?: string;
  testId?: string;
}) {
  const Shown = kind === "error" ? CircleAlertIcon : Icon;
  return (
    // Centred in the content area (Linear's empty views sit in the middle of the list's space).
    <div className={cn("flex min-h-[50svh] flex-col items-center justify-center gap-3 px-6 py-16 text-center", className)} data-testid={testId} data-kind={kind} role={kind === "error" ? "alert" : undefined}>
      {Shown && <Shown className={cn("size-6", kind === "error" ? "text-destructive" : "text-muted-foreground")} aria-hidden />}
      <div className="flex max-w-md flex-col gap-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description && <div className="text-sm text-muted-foreground">{description}</div>}
      </div>
      {(action || secondary) && (
        <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
          {action}
          {secondary}
        </div>
      )}
    </div>
  );
}
