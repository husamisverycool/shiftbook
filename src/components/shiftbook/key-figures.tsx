// Figures (decision 0029; docs/patterns/_components/key-figures.md): plain type as Stripe and Mercury
// set them, never boxed. From Stripe's own screenshots: Home's "Today" — a label in the secondary
// text colour, the figure 20px in regular weight, a short line under it; its right column — the label
// in medium weight with "View" at the right; the app overview's "Program summary" — the figure 20px
// semibold. Mercury's Transactions page sets a headline figure large and light with its cents small
// and raised.
import type { ComponentProps, ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export function KeyFigures({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex flex-wrap gap-x-14 gap-y-6", className)} {...props} />;
}

/**
 * `size`: "default" — Stripe's summary figure (20px semibold); "sm" — Stripe Home's Today and balance
 * figures (20px regular); "lg" — Mercury's headline (32px light).
 */
export function KeyFigure({
  label,
  value,
  note,
  action,
  size = "default",
  className,
  testId,
}: {
  label: ReactNode;
  value: ReactNode;
  note?: ReactNode;
  /** A "View" link at the label's right (Stripe Home's right column), the label then in medium weight. */
  action?: { label: string; href: ComponentProps<typeof Link>["href"] };
  size?: "sm" | "default" | "lg";
  className?: string;
  testId?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col", className)} data-testid={testId}>
      <div className="flex items-baseline justify-between gap-4">
        <span className={cn("text-sm", action ? "font-medium text-foreground/80" : "whitespace-nowrap text-foreground/70")}>{label}</span>
        {action && (
          <Link href={action.href} className="text-sm font-medium underline-offset-4 hover:underline rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
            {action.label}
          </Link>
        )}
      </div>
      <span
        className={cn("mt-1 tabular-nums", size === "lg" ? "text-[32px] leading-10 font-light tracking-tight" : size === "sm" ? "text-xl leading-7 font-normal" : "text-xl leading-7 font-semibold")}
        data-testid={testId ? `${testId}-value` : undefined}
      >
        {value}
      </span>
      {note && <span className="text-[13px] text-muted-foreground">{note}</span>}
    </div>
  );
}

/** An amount with its cents small and raised, as Mercury writes its figures ("$1,051,312.80"). */
export function RaisedCents({ whole, cents }: { whole: string; cents: string }) {
  return (
    <>
      {whole}
      <span className="relative -top-[0.6em] ml-px text-[0.5em] font-normal">{cents}</span>
    </>
  );
}
