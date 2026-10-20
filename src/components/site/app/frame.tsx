// Pattern: docs/patterns/site.md, "The app on the page" — the app's frame as the website draws it, after
// the real one (docs/patterns/_layouts/app.md, Linear's): the agency's switcher, search with ⌘K, the areas
// grouped as the app groups them (Payroll, Billing, Staffing) with counts, the signed-in person at the
// foot; a header of breadcrumbs and actions; an optional view bar; the work; an optional record panel.
// Sizes follow the frame's own width (container queries), so one drawing serves the hero, the tour and
// a phone. Sample agency and people only.
import { Building2, CalendarClock, CalendarDays, ChevronDown, ChevronRight, CircleAlert, CircleCheck, FileText, House, Inbox, Receipt, Search, SquarePen, Users, Wallet, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Avatar, Kbd } from "@/components/site/app/kit";
import { cn } from "@/lib/utils";

export type Area = "home" | "inbox" | "check" | "weeks" | "payRuns" | "files" | "invoices" | "approvals" | "clients" | "workers" | "schedule";

export const AGENCY = "Cedar Row Staffing";
export const ME = "Dana Price";

/** A desktop window around the app (Attio's and Cursor's framed product shots). */
export function AppWindow({ children, title, dark, className }: { children: ReactNode; title?: string; dark?: boolean; className?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-xl", dark ? "site-app site-app-dark ring-1 ring-white/10" : "site-app ring-1 ring-black/[0.08]", "shadow-[0_40px_90px_-30px_rgb(10_11_20/0.55),0_18px_40px_-24px_rgb(10_11_20/0.4)]", className)}>
      {title !== undefined && (
        <div className="flex h-9 items-center gap-2 border-b border-[var(--a-line)] bg-[var(--a-side)] px-3.5">
          <span aria-hidden className="flex gap-1.5">
            {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
              <span key={c} className="size-[10px] rounded-full opacity-90" style={{ backgroundColor: dark ? "rgb(255 255 255 / 0.14)" : c }} />
            ))}
          </span>
          <span className="mx-auto truncate text-[11px] font-medium text-[var(--a-muted)]">{title}</span>
          <span className="w-12" />
        </div>
      )}
      {children}
    </div>
  );
}

function NavItem({ icon: I, label, active, count, tone }: { icon: LucideIcon; label: string; active?: boolean; count?: number; tone?: "amber" }) {
  return (
    <span className={cn("flex h-7 items-center gap-2.5 rounded-md px-2 text-[12.5px]", active ? "bg-[var(--a-chip)] font-medium text-[var(--a-text)]" : "text-[var(--a-muted)]")}>
      <I aria-hidden className={cn("size-[15px] shrink-0", active ? "text-[var(--a-text)]" : "text-[var(--a-faint)]")} strokeWidth={1.8} />
      <span className="flex-1 truncate">{label}</span>
      {!!count && <span className={cn("min-w-5 rounded-full px-1.5 text-center text-[10.5px] font-medium tabular-nums site-crossfade", tone === "amber" ? "bg-amber-500/15 text-amber-700 [.site-app-dark_&]:text-amber-300" : "text-[var(--a-muted)]")}>{count}</span>}
    </span>
  );
}

function Sidebar({ area, counts }: { area: Area; counts: { inbox: number; check: number } }) {
  const t = useTranslations("site.app.nav");
  const group = (label: string, items: { a: Area; icon: LucideIcon }[]) => (
    <div className="mt-4">
      <p className="flex items-center gap-1 px-2 pb-1 text-[11px] font-medium text-[var(--a-faint)]">
        {label}
        <ChevronDown aria-hidden className="size-3" />
      </p>
      {items.map((i) => (
        <NavItem key={i.a} icon={i.icon} label={t(i.a)} active={area === i.a} />
      ))}
    </div>
  );
  return (
    <div aria-hidden className="hidden w-[208px] shrink-0 flex-col border-r border-[var(--a-line)] bg-[var(--a-side)] px-2.5 py-3 @3xl:flex">
      <span className="flex h-8 items-center gap-2 px-1.5">
        <span className="flex size-5 items-center justify-center rounded-[5px] bg-[linear-gradient(135deg,#5b6cff,#2bb59a)] text-[10px] font-bold text-white">{AGENCY[0]}</span>
        <span className="truncate text-[13px] font-semibold">{AGENCY}</span>
        <ChevronDown className="size-3 text-[var(--a-faint)]" />
        <SquarePen className="ml-auto size-[15px] text-[var(--a-muted)]" strokeWidth={1.8} />
      </span>
      <span className="mt-2 mb-2 flex h-7 items-center gap-2 rounded-md px-2 text-[12.5px] text-[var(--a-faint)] shadow-[var(--a-shadow)]">
        <Search className="size-[14px]" strokeWidth={1.8} />
        <span className="flex-1">{t("search")}</span>
        <Kbd>⌘K</Kbd>
      </span>
      <NavItem icon={House} label={t("home")} active={area === "home"} />
      <NavItem icon={Inbox} label={t("inbox")} active={area === "inbox"} count={counts.inbox} />
      <NavItem icon={CircleAlert} label={t("check")} active={area === "check"} count={counts.check} tone="amber" />
      {group(t("payroll"), [
        { a: "weeks", icon: CalendarClock },
        { a: "payRuns", icon: Wallet },
        { a: "files", icon: FileText },
      ])}
      {group(t("billing"), [
        { a: "approvals", icon: CircleCheck },
        { a: "invoices", icon: Receipt },
      ])}
      {group(t("staffing"), [
        { a: "workers", icon: Users },
        { a: "clients", icon: Building2 },
        { a: "schedule", icon: CalendarDays },
      ])}
      <span className="mt-auto flex h-9 items-center gap-2 px-1.5 pt-3 text-[12px]">
        <Avatar name={ME} size={20} />
        <span className="truncate font-medium">{ME}</span>
        <span className="truncate text-[var(--a-faint)]">· {t("role")}</span>
      </span>
    </div>
  );
}

/** The app's frame: sidebar, header, optional view bar, the work, an optional record panel. */
export function AppShell({ area, crumbs, actions, bar, aside, children, counts = { inbox: 3, check: 1 }, className }: { area: Area; crumbs: string[]; actions?: ReactNode; bar?: ReactNode; aside?: ReactNode; children: ReactNode; counts?: { inbox: number; check: number }; className?: string }) {
  return (
    <div className={cn("@container flex min-h-0 bg-[var(--a-bg)] text-[var(--a-text)]", className)}>
      <Sidebar area={area} counts={counts} />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-11 shrink-0 items-center gap-2 border-b border-[var(--a-line)] px-4">
          <span className="flex min-w-0 flex-1 items-center gap-1.5 text-[12.5px]">
            {crumbs.map((c, i) => (
              <span key={c} className={cn("flex min-w-0 items-center gap-1.5", i < crumbs.length - 1 ? "hidden text-[var(--a-muted)] @xl:flex" : "font-medium")}>
                <span className="truncate">{c}</span>
                {i < crumbs.length - 1 && <ChevronRight aria-hidden className="size-3 shrink-0 text-[var(--a-faint)]" />}
              </span>
            ))}
          </span>
          {actions}
        </div>
        {bar && <div className="flex h-10 shrink-0 items-center gap-2 border-b border-[var(--a-line)] px-4 text-[12px]">{bar}</div>}
        <div className="flex min-h-0 flex-1">
          <div className="@container/main relative min-w-0 flex-1 overflow-hidden">{children}</div>
          {aside && <div className="hidden w-[272px] shrink-0 overflow-hidden border-l border-[var(--a-line)] bg-[var(--a-panel)] @5xl:block">{aside}</div>}
        </div>
      </div>
    </div>
  );
}

/** A view bar's tab (Linear's "All issues · Active · Backlog"). */
export function ViewTab({ active, children, count }: { active?: boolean; children: ReactNode; count?: number }) {
  return (
    <span className={cn("inline-flex h-6 items-center gap-1.5 rounded-md px-2 whitespace-nowrap", active ? "bg-[var(--a-chip)] font-medium text-[var(--a-text)] shadow-[var(--a-shadow)]" : "text-[var(--a-muted)]")}>
      {children}
      {count !== undefined && <span className="text-[var(--a-faint)] tabular-nums">{count}</span>}
    </span>
  );
}
