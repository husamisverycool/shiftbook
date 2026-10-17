"use client";

// Pattern: docs/patterns/_layouts/portal-portal-token.md — Stripe's customer portal: the business's
// name and the portal's sections in a left column, the customer under them; the section on the right;
// the business's contact details at the foot (Stripe hosted invoice page). On phones the column is a
// bar on top with the sections in a scrolling row.
import { CalendarCheckIcon, FileTextIcon, FolderIcon, LayoutGridIcon, ReceiptIcon, UserPlusIcon, type LucideIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { Avatar } from "../avatar";
import { dateTime } from "../format";

export interface ShellAgency {
  name: string;
  phone: string | null;
  email: string | null;
  timeZone: string;
}

const SECTIONS: { key: "overview" | "invoices" | "payments" | "hours" | "documents" | "request"; path: string; icon: LucideIcon }[] = [
  { key: "overview", path: "", icon: LayoutGridIcon },
  { key: "invoices", path: "/invoices", icon: FileTextIcon },
  { key: "payments", path: "/payments", icon: ReceiptIcon },
  { key: "hours", path: "/hours", icon: CalendarCheckIcon },
  { key: "documents", path: "/documents", icon: FolderIcon },
  { key: "request", path: "/request", icon: UserPlusIcon },
];

function LanguageSwitch() {
  const t = useTranslations("portal");
  const locale = useLocale();
  const pathname = usePathname();
  return (
    <nav aria-label={t("language")} className="flex items-center gap-3 text-sm">
      {(["en", "es"] as const).map((l) => (
        <Link
          key={l}
          href={pathname}
          locale={l}
          aria-current={l === locale ? "true" : undefined}
          className={cn("rounded-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50", l === locale ? "font-medium" : "text-muted-foreground underline-offset-4 hover:text-foreground hover:underline")}
        >
          {t(l === "en" ? "english" : "spanish")}
        </Link>
      ))}
    </nav>
  );
}

export function PortalShell({
  token,
  agency,
  clientName,
  contact,
  expiresAt,
  children,
}: {
  token: string;
  agency: ShellAgency;
  clientName: string;
  contact: { name: string; email: string };
  expiresAt: Date;
  children: ReactNode;
}) {
  const t = useTranslations("clientPortal");
  const tp = useTranslations("portal");
  const locale = useLocale();
  const pathname = usePathname();
  const base = `/portal/${token}`;
  const current = SECTIONS.slice()
    .reverse()
    .find((s) => (s.path === "" ? pathname === base : pathname.startsWith(`${base}${s.path}`)))?.key;
  const contactLine = [agency.phone, agency.email].filter(Boolean).join(" · ");
  const items = SECTIONS.map((s) => {
    const Icon = s.icon;
    const active = s.key === current;
    return (
      <li key={s.key} className="shrink-0">
        <Link
          href={`${base}${s.path}`}
          aria-current={active ? "page" : undefined}
          data-testid={`portal-nav-${s.key}`}
          className={cn(
            "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm whitespace-nowrap outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50",
            active ? "bg-background font-medium text-foreground shadow-xs" : "text-foreground/70 hover:bg-background/60 hover:text-foreground",
          )}
        >
          <Icon className="size-4 text-muted-foreground" aria-hidden />
          {t(`nav.${s.key}`)}
        </Link>
      </li>
    );
  });
  return (
    <div className="flex min-h-svh flex-1 flex-col md:flex-row">
      <aside className="flex flex-col gap-4 border-b bg-muted/50 px-4 py-4 md:sticky md:top-0 md:h-svh md:w-64 md:shrink-0 md:border-r md:border-b-0 md:py-6">
        {/* The agency's square before its name, as the app's sidebar shows it (decision 0046). */}
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={agency.name} kind="organization" size={32} />
          <div className="flex min-w-0 flex-col">
            <p className="truncate font-semibold" data-testid="portal-agency">
              {agency.name}
            </p>
            <p className="truncate text-sm text-muted-foreground" data-testid="portal-client">
              {t("for", { client: clientName })}
            </p>
          </div>
        </div>
        <nav aria-label={t("navLabel")} className="-mx-1 overflow-x-auto md:overflow-visible">
          <ul className="flex gap-1 px-1 md:flex-col">{items}</ul>
        </nav>
        <div className="mt-auto hidden flex-col gap-3 text-sm md:flex">
          <div className="min-w-0">
            <p className="truncate font-medium">{contact.name}</p>
            <p className="truncate text-muted-foreground">{contact.email}</p>
          </div>
          <p className="text-[13px] text-muted-foreground">{t("linkUntil", { when: dateTime(expiresAt, locale, agency.timeZone, { date: "long", time: true }) })}</p>
          <LanguageSwitch />
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="mx-auto flex w-full max-w-5xl min-w-0 flex-1 flex-col gap-6 px-4 py-6 md:px-8 md:py-8">{children}</main>
        <footer className="border-t">
          <div className="mx-auto flex w-full max-w-5xl flex-col gap-1 px-4 py-4 text-sm text-muted-foreground md:px-8">
            {contactLine && <p>{tp("contact", { agency: agency.name, contact: contactLine })}</p>}
            <p>{tp("providedBy", { agency: agency.name })}</p>
            <div className="md:hidden">
              <LanguageSwitch />
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
