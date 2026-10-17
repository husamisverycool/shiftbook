"use client";

// Pattern: docs/patterns/_layouts/worker-w-tabs.md — the Gusto mobile app's frame: tabs fixed at the
// bottom (an icon over its label), a profile entry at the top right; one column a phone wide.
import { CalendarDaysIcon, ClockIcon, HouseIcon, MessageCircleIcon, ReceiptTextIcon, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

// Five tabs at most (Apple HIG, tab bars); More is the initials at the top right (Gusto's Profile).
const TABS: { key: "home" | "shifts" | "time" | "pay" | "messages"; href: string; icon: LucideIcon }[] = [
  { key: "home", href: "/w", icon: HouseIcon },
  { key: "shifts", href: "/w/shifts", icon: CalendarDaysIcon },
  { key: "time", href: "/w/time", icon: ClockIcon },
  { key: "pay", href: "/w/pay", icon: ReceiptTextIcon },
  { key: "messages", href: "/w/messages", icon: MessageCircleIcon },
];

const activeTab = (pathname: string) => (pathname === "/w" || pathname === "/w/onboarding" ? "home" : (TABS.find((t) => t.key !== "home" && pathname.startsWith(t.href))?.key ?? null));

export function WorkerFrame({ agencyName, initials, unread, shiftsWaiting = 0, children }: { agencyName: string; initials: string; unread: number; shiftsWaiting?: number; children: ReactNode }) {
  const t = useTranslations("workerApp");
  const pathname = usePathname();
  const current = activeTab(pathname);
  return (
    <div className="flex min-h-[calc(100svh-var(--banner-height,0px))] flex-col bg-background">
      <header className="sticky top-(--banner-height,0px) z-10 border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80">
        <div className="mx-auto flex h-12 w-full max-w-lg items-center gap-3 px-4">
          <span className="min-w-0 flex-1 truncate text-sm font-semibold" data-testid="worker-agency">
            {agencyName}
          </span>
          <Link href="/w/more" aria-label={t("profile")} aria-current={current === null && pathname.startsWith("/w/more") ? "page" : undefined} data-testid="worker-tab-more" className="flex size-8 items-center justify-center rounded-full bg-muted text-xs font-medium outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50">
            {initials}
          </Link>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-lg min-w-0 flex-1 flex-col gap-6 px-4 pt-5 pb-28">{children}</main>
      <nav aria-label={t("tabs.label")} className="fixed inset-x-0 bottom-0 z-10 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur supports-backdrop-filter:bg-background/80">
        <ul className="mx-auto grid max-w-lg grid-cols-5">
          {TABS.map(({ key, href, icon: Icon }) => {
            const active = key === current;
            return (
              <li key={key}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn("relative flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset", active ? "text-foreground" : "text-muted-foreground hover:text-foreground")}
                  data-testid={`worker-tab-${key}`}
                >
                  <Icon className="size-5" aria-hidden />
                  {t(`tabs.${key}`)}
                  {key === "messages" && unread > 0 && (
                    <span className="absolute top-2 left-1/2 ml-1.5 min-w-4 rounded-full bg-destructive px-1 text-center text-[10px] leading-4 text-white tabular-nums" data-testid="worker-unread">
                      {unread}
                    </span>
                  )}
                  {key === "shifts" && shiftsWaiting > 0 && (
                    <span className="absolute top-2 left-1/2 ml-1.5 min-w-4 rounded-full bg-destructive px-1 text-center text-[10px] leading-4 text-white tabular-nums" data-testid="worker-shifts-waiting">
                      {shiftsWaiting}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
