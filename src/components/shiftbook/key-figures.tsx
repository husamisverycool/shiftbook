// Figures (decision 0029; docs/patterns/_components/key-figures.md): plain type as Stripe Home and
// Mercury set them — a small muted label, the figure, an optional muted line. Never boxed.
import type { ComponentProps, ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export function KeyFigures({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex flex-wrap gap-x-14 gap-y-6", className)} {...props} />;
}

export function KeyFigure({
  label,
  value,
  note,
  action,
  size = "default",
  testId,
}: {
  label: ReactNode;
  value: ReactNode;
  note?: ReactNode;
  /** A "View" link beside the label (Stripe Home's right column). */
  action?: { label: string; href: ComponentProps<typeof Link>["href"] };
  size?: "sm" | "default" | "lg";
  testId?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1" data-testid={testId}>
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-[13px] text-muted-foreground">{label}</span>
        {action && (
          <Link href={action.href} className="text-[13px] font-medium underline-offset-4 hover:underline">
            {action.label}
          </Link>
        )}
      </div>
      <span className={cn("font-semibold tracking-tight tabular-nums", size === "lg" ? "text-[28px] leading-9" : size === "sm" ? "text-xl" : "text-2xl")} data-testid={testId ? `${testId}-value` : undefined}>
        {value}
      </span>
      {note && <span className="text-[13px] text-muted-foreground">{note}</span>}
    </div>
  );
}
