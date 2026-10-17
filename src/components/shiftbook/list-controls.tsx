"use client";

// Lists of records as Stripe's Dashboard draws them today (decision 0029, amended 2026-10-17;
// docs/patterns/_components/list.md), from Stripe's own published screenshots: the connected accounts
// list (https://docs.stripe.com/connect/dashboard/review-actionable-accounts) and the invoices list on
// https://stripe.com/invoicing. The statuses as a row of bordered boxes with their counts, the chosen
// one outlined; under them the filters as small pills — dashed with a plus while unused, solid with
// the chosen value once used — and the list's own buttons at the right of that row; a hairline; the
// table; the number of results under it. Stripe's colours, icons and wording are not copied.
import { ChevronDownIcon, CirclePlusIcon, CircleXIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ComponentProps, ReactNode } from "react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Link, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

type Href = ComponentProps<typeof Link>["href"];

export interface StatusTab {
  key: string;
  label: ReactNode;
  count: number;
  href: Href;
  testId?: string;
}

/**
 * The statuses that divide a list, each a bordered box with its label over its count; the current one
 * outlined (Stripe: "All 15,586 · Restricted 624 · …"). Each is its own address.
 */
export function StatusTabs({ tabs, current, label, className }: { tabs: StatusTab[]; current: string; label: string; className?: string }) {
  return (
    <nav aria-label={label} className={cn("-mx-px flex gap-2 overflow-x-auto px-px py-px", className)}>
      {tabs.map((tab) => {
        const active = tab.key === current;
        return (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            data-testid={tab.testId}
            className={cn(
              "flex min-w-32 flex-1 flex-col rounded-md border px-3 py-2.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50",
              active ? "border-foreground ring-1 ring-foreground" : "hover:border-foreground/30",
            )}
          >
            <span className={cn("truncate text-sm", active ? "text-foreground" : "text-foreground/80")}>{tab.label}</span>
            <span className="text-base font-semibold tabular-nums">{tab.count.toLocaleString("en-US")}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * A filter as Stripe's pills: dashed with a plus while unused ("⊕ Client"); once used, solid with the
 * value after a thin rule ("⊗ Client | Prairie Line ⌄"), the cross taking the filter off. `onClear`
 * absent: a filter that always has a value (Stripe's "Date range | Last 7 days"). The menu is the
 * children (items for a DropdownMenuContent).
 */
export function FilterPill({ label, value, onClear, children, testId, align = "start" }: { label: string; value?: ReactNode; onClear?: () => void; children: ReactNode; testId?: string; align?: "start" | "end" }) {
  const t = useTranslations("list");
  const used = value !== undefined && value !== null && value !== "";
  return (
    <span className={cn("inline-flex h-6 shrink-0 items-center rounded-full border text-[13px] font-medium", used ? "border-border" : "border-dashed border-foreground/25")}>
      {used && onClear && (
        <button type="button" onClick={onClear} aria-label={t("removeFilter", { name: label })} className="-mr-0.5 flex h-full items-center rounded-l-full pl-1.5 text-foreground/60 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50" data-testid={testId ? `${testId}-clear` : undefined}>
          <CircleXIcon className="size-3.5" aria-hidden />
        </button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn("flex h-full items-center gap-1 rounded-full pr-2 text-foreground/70 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 data-popup-open:text-foreground", used && onClear ? "pl-1" : "pl-1.5")}
          data-testid={testId}
        >
          {!used && <CirclePlusIcon className="size-3.5" aria-hidden />}
          <span>{label}</span>
          {used && (
            <>
              <span className="mx-1 h-3 w-px bg-border" aria-hidden />
              <span className="max-w-56 truncate font-semibold text-foreground">{value}</span>
              <ChevronDownIcon className="size-3.5 text-foreground/60" aria-hidden />
            </>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align={align} className="w-auto min-w-48">
          {children}
        </DropdownMenuContent>
      </DropdownMenu>
    </span>
  );
}

/** A pill's menu of single choices: "Filter by client", then the choices. */
export function PillChoices({ heading, value, options, onChoose }: { heading: string; value: string; options: { value: string; label: ReactNode; testId?: string }[]; onChoose: (value: string) => void }) {
  return (
    <DropdownMenuGroup>
      <DropdownMenuLabel>{heading}</DropdownMenuLabel>
      <DropdownMenuRadioGroup value={value} onValueChange={(v) => onChoose(String(v))}>
        {options.map((o) => (
          <DropdownMenuRadioItem key={o.value} value={o.value} data-testid={o.testId}>
            {o.label}
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
    </DropdownMenuGroup>
  );
}

/**
 * A pill that always has a value and goes to an address when changed (Stripe Home's "Date range |
 * Last 7 days"): the choices each their own link, so the page and its address agree.
 */
export function NavPill({ label, current, options, testId, align }: { label: string; current: string; options: { value: string; label: string; href: string | { pathname: string; query?: Record<string, string> }; testId?: string }[]; testId?: string; align?: "start" | "end" }) {
  const router = useRouter();
  return (
    <FilterPill label={label} value={options.find((o) => o.value === current)?.label} testId={testId} align={align}>
      <PillChoices
        heading={label}
        value={current}
        options={options}
        onChoose={(v) => {
          const chosen = options.find((o) => o.value === v);
          if (chosen) router.replace(chosen.href, { scroll: false });
        }}
      />
    </FilterPill>
  );
}

/** The filters on the left and the list's own buttons on the right, a hairline under them (Stripe). */
export function ListToolbar({ children, end, className }: { children?: ReactNode; end?: ReactNode; className?: string }) {
  const t = useTranslations("list");
  return (
    <div className={cn("flex flex-wrap items-center gap-x-2 gap-y-2 border-b pb-4", className)} role="group" aria-label={t("filters")}>
      {children}
      {end && <div className="ml-auto flex flex-wrap items-center gap-2">{end}</div>}
    </div>
  );
}

/** How many rows the list shows, under it (Stripe's results line); "3 of 40" when a search narrows them. */
export function ResultsCount({ shown, total, testId }: { shown: number; total?: number; testId?: string }) {
  const t = useTranslations("list");
  const b = (chunks: ReactNode) => <span className="font-semibold text-foreground">{chunks}</span>;
  return (
    <p className="text-[13px] text-foreground/70 tabular-nums" aria-live="polite" data-testid={testId}>
      {total === undefined || total === shown ? t.rich("results", { count: shown, b }) : t.rich("resultsOf", { shown, total, b })}
    </p>
  );
}

/** An amount as Stripe's lists set it: the figure in semibold, then the currency in muted type. */
export function ListAmount({ text, className }: { text: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-baseline gap-1.5 whitespace-nowrap", className)}>
      <span className="font-semibold tabular-nums">{text}</span>
      <span className="text-muted-foreground">USD</span>
    </span>
  );
}
