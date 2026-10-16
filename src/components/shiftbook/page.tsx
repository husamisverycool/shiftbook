// Shared page pieces (decision 0029). Patterns: docs/patterns/_components/page-header.md (Primer
// PageHeader and UnderlineNav, Polaris page, Atlassian page header, Stripe detail page).
import { CheckIcon, ChevronRightIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

const WIDTHS = {
  /** Lists with many columns and dashboards (Polaris: full width for wide index pages). */
  wide: "max-w-7xl",
  /** Detail pages. */
  default: "max-w-6xl",
  /** Forms and settings (Polaris `small`). */
  narrow: "max-w-4xl",
} as const;

/** The page's column inside the frame's sheet: one width, one padding, one rhythm. */
export function Page({ width = "wide", className, ...props }: ComponentProps<"div"> & { width?: keyof typeof WIDTHS }) {
  return <div className={cn("mx-auto flex w-full min-w-0 flex-col gap-6 px-4 py-6 md:px-8 md:py-8", WIDTHS[width], className)} {...props} />;
}

/**
 * Context (breadcrumb or back link), the title as the page's h1 with its status, one muted line, the
 * page's actions on the right, then its tabs.
 */
export function PageHeader({
  title,
  description,
  status,
  leading,
  actions,
  context,
  tabs,
  className,
  titleTestId,
}: {
  title: ReactNode;
  description?: ReactNode;
  status?: ReactNode;
  leading?: ReactNode;
  actions?: ReactNode;
  context?: ReactNode;
  tabs?: ReactNode;
  className?: string;
  titleTestId?: string;
}) {
  return (
    <header className={cn("flex flex-col gap-3", className)}>
      {context && <div className="text-sm text-muted-foreground">{context}</div>}
      <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
        {leading && <div className="shrink-0 pt-0.5">{leading}</div>}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="text-[28px] leading-9 font-bold tracking-tight text-balance" data-testid={titleTestId}>
              {title}
            </h1>
            {status}
          </div>
          {description && <div className="text-sm text-muted-foreground">{description}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {tabs}
    </header>
  );
}

export interface PageTab {
  key: string;
  label: ReactNode;
  href: ComponentProps<typeof Link>["href"];
  count?: number | null;
  testId?: string;
}

/** Underline tabs, each its own address, with an optional count (Primer UnderlineNav). */
export function PageTabs({ tabs, current, label, className }: { tabs: PageTab[]; current: string; label: string; className?: string }) {
  return (
    <nav aria-label={label} className={cn("flex gap-6 overflow-x-auto border-b", className)}>
      {tabs.map((tab) => {
        const active = tab.key === current;
        return (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            data-testid={tab.testId}
            className={cn(
              "relative -mb-px inline-flex items-center gap-1.5 border-b-2 border-transparent px-1 pt-1 pb-2.5 text-sm font-medium whitespace-nowrap text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring/50",
              active && "border-foreground text-foreground",
            )}
          >
            {tab.label}
            {tab.count !== undefined && tab.count !== null && <span className="text-muted-foreground tabular-nums">{tab.count}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

type Href = ComponentProps<typeof Link>["href"];

/**
 * A detail page's ancestors above its title, never the page itself (Stripe detail page: "breadcrumbs
 * are ancestors only"; docs/patterns/_components/record-page.md).
 */
export function Crumbs({ items, label }: { items: { label: ReactNode; href: Href; testId?: string }[]; label: string }) {
  return (
    <nav aria-label={label}>
      <ol className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
        {items.map((item, n) => (
          <li key={n} className="inline-flex items-center gap-1.5">
            {n > 0 && <ChevronRightIcon className="size-3.5" aria-hidden />}
            <Link href={item.href} className="rounded-sm transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50" data-testid={item.testId}>
              {item.label}
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/**
 * A detail page's body (Stripe detail page: "line items on the left and a summary on the right"; "a
 * main activity feed and a sidebar of metadata"): the record's sections, then its details beside
 * them on wide screens and under them on narrow ones.
 */
export function RecordLayout({ children, aside, className }: { children: ReactNode; aside?: ReactNode; className?: string }) {
  if (!aside) return <div className={cn("flex min-w-0 flex-col gap-10", className)}>{children}</div>;
  return (
    <div className={cn("grid min-w-0 items-start gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,1fr)_18rem] xl:grid-cols-[minmax(0,1fr)_20rem]", className)}>
      <div className="flex min-w-0 flex-col gap-10">{children}</div>
      <aside className="flex min-w-0 flex-col gap-8">{aside}</aside>
    </div>
  );
}

/**
 * A titled module (Stripe detail modules; Polaris section: at most two actions inline, a count as
 * its accessory): the heading and its actions over a hairline, then the content. No box.
 */
export function Section({
  id,
  title,
  accessory,
  actions,
  children,
  className,
  testId,
}: {
  id: string;
  title: ReactNode;
  accessory?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <section aria-labelledby={id} className={cn("flex min-w-0 flex-col gap-3", className)} data-testid={testId}>
      <div className="flex min-h-8 flex-wrap items-center gap-x-3 gap-y-2 border-b pb-2">
        <h2 id={id} className="text-base font-semibold">
          {title}
        </h2>
        {accessory && <span className="text-sm text-muted-foreground tabular-nums">{accessory}</span>}
        {actions && <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

/**
 * A wizard's steps, one at a time (Attio's import; QuickBooks Online's Upload from file): each
 * numbered, the ones done ticked, the current one in bold.
 */
export function Steps({ steps, current, label }: { steps: { key: string; label: ReactNode }[]; current: string; label: string }) {
  const at = steps.findIndex((s) => s.key === current);
  return (
    <ol className="flex flex-wrap gap-x-6 gap-y-2 text-sm" aria-label={label}>
      {steps.map((s, i) => (
        <li key={s.key} aria-current={s.key === current ? "step" : undefined} className={cn("flex items-center gap-2", i > at && "text-muted-foreground", s.key === current && "font-semibold")}>
          <span className={cn("flex size-6 items-center justify-center rounded-full border text-xs tabular-nums", i < at && "border-primary bg-primary text-primary-foreground", s.key === current && "border-foreground")}>
            {i < at ? <CheckIcon className="size-3.5" aria-hidden /> : i + 1}
          </span>
          {s.label}
        </li>
      ))}
    </ol>
  );
}

/** A label/value list for a record's key facts (Geist description list; Polaris detail sidebar). */
export function Facts({ items, className }: { items: { label: ReactNode; value: ReactNode; testId?: string }[]; className?: string }) {
  return (
    <dl className={cn("grid gap-4 text-sm", className)}>
      {items.map((item, n) => (
        <div key={n} className="grid gap-0.5" data-testid={item.testId}>
          <dt className="text-[13px] text-muted-foreground">{item.label}</dt>
          <dd className="break-words">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A table at the page's full width, no box around it (Stripe's lists; decision 0029, `_components/table.md`). */
export function TableFrame({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("min-w-0", className)} {...props} />;
}
