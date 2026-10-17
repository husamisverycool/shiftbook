"use client";

// Pattern: docs/patterns/_layouts/app.md — Linear sidebar and keyboard navigation.
import { ActivityIcon, BanknoteIcon, BellIcon, BriefcaseIcon, Building2Icon, CalendarDaysIcon, ChartColumnIcon, ChevronDownIcon, ClipboardCheckIcon, CoinsIcon, ContactRoundIcon, CreditCardIcon, FileSpreadsheetIcon, HandCoinsIcon, HouseIcon, KeyboardIcon, LandmarkIcon, LogOutIcon, PlugIcon, ReceiptTextIcon, SearchIcon, SettingsIcon, ShieldCheckIcon, StoreIcon, UserCogIcon, UserIcon, UsersIcon, WalletIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { signOutAction } from "@/app/[locale]/(auth)/actions";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { can, type Role } from "@/server/permissions";
import { useCan } from "./abilities";
import { CommandMenu, type CommandPage } from "./command-menu";
import { initialsOf, withoutNote } from "./person";
import { Tip } from "./tip";

// Home first, then the areas in groups under short labels (decision 0029: Stripe's sidebar sections,
// Apple's two levels at most). The G-then-letter keys stay as they were.
const AREAS = [
  { href: "/", key: "home", jump: "h", icon: HouseIcon, group: null },
  // Slice r: Linear's Inbox sits at the top of its sidebar with the unread count (G then N; I is Invoices).
  { href: "/notifications", key: "notifications", jump: "n", icon: BellIcon, group: null },
  { href: "/convert", key: "convert", jump: "c", icon: FileSpreadsheetIcon, group: "payroll" },
  { href: "/approvals", key: "approvals", jump: "p", icon: ClipboardCheckIcon, group: "payroll" },
  { href: "/invoices", key: "invoices", jump: "i", icon: ReceiptTextIcon, group: "billing" },
  { href: "/receivables", key: "receivables", jump: "r", icon: WalletIcon, group: "billing" },
  { href: "/payments", key: "payments", jump: "y", icon: BanknoteIcon, group: "billing" },
  { href: "/bank", key: "bank", jump: "b", icon: LandmarkIcon, group: "billing" },
  // Slice w: the partner handoffs (payroll, wage access, funding, the broker); nothing moves.
  { href: "/money", key: "money", jump: "f", icon: HandCoinsIcon, group: "billing" },
  { href: "/job-orders", key: "jobOrders", jump: "j", icon: BriefcaseIcon, group: "staffing" },
  { href: "/assignments", key: "assignments", jump: "a", icon: UsersIcon, group: "staffing" },
  // Slice u: the week's shifts (When I Work; Deputy).
  { href: "/schedule", key: "schedule", jump: "s", icon: CalendarDaysIcon, group: "staffing" },
  // Slice k: the roster, read by everyone; the Owner and coordinators change it.
  { href: "/workers", key: "workers", jump: "w", icon: ContactRoundIcon, group: "staffing" },
  { href: "/clients", key: "clients", jump: "l", icon: Building2Icon, group: "staffing" },
  // Slice i: the Owner and the accountant only (SPEC §2).
  { href: "/margin", key: "margin", jump: "m", icon: ChartColumnIcon, group: "oversight" },
  // Slice j: everyone reads compliance; the badge counts what is overdue or due soon.
  { href: "/compliance", key: "compliance", jump: "o", icon: ShieldCheckIcon, group: "oversight" },
] as const;
const GROUPS = ["payroll", "billing", "staffing", "oversight"] as const;

/** True while the person is typing, so single-letter shortcuts stay out of the way. */
export function typing(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || el.getAttribute("role") === "combobox");
}

export function AppSidebar({ agencyName, person, showMargin = false, complianceCount = 0, unreadCount = 0 }: { agencyName: string; person: { name: string; role: Role }; showMargin?: boolean; complianceCount?: number; unreadCount?: number }) {
  const t = useTranslations("nav");
  const tr = useTranslations("roles");
  const [leaving, leave] = useTransition();
  const pathname = usePathname();
  const router = useRouter();
  const [help, setHelp] = useState(false);
  const pendingG = useRef<number | null>(null);
  const areas = useMemo(() => AREAS.filter((a) => a.key !== "margin" || showMargin), [showMargin]);
  const mayViewActivity = useCan()("viewActivity");
  // Single sign-on stays in the menu while changes are paused (turning it off still works; decision 0036).
  const mayManageMembers = can({ role: person.role }, "members");
  const mayManageBilling = useCan()("billing");
  const mayMoney = useCan()("money");
  const tm = useTranslations("money.tabs");

  // The command menu (decision 0038): every area, the settings pages this person opens, and its actions.
  const [commandOpen, setCommandOpen] = useState(false);
  const tc = useTranslations("commandMenu");
  const commandPages = useMemo<CommandPage[]>(
    () => [
      ...areas.map((a) => ({ href: a.href, label: t(a.key), icon: a.icon, jump: a.jump })),
      // Money's tabs, for the Owner (slice w).
      ...(mayMoney
        ? [
            { href: "/money/payroll", label: `${t("money")} › ${tm("payroll")}`, icon: HandCoinsIcon },
            { href: "/money/wage-access", label: `${t("money")} › ${tm("wageAccess")}`, icon: HandCoinsIcon },
            { href: "/money/funding", label: `${t("money")} › ${tm("funding")}`, icon: HandCoinsIcon },
            { href: "/money/insurance", label: `${t("money")} › ${tm("insurance")}`, icon: HandCoinsIcon },
          ]
        : []),
      { href: "/settings/payroll", label: t("settings"), icon: SettingsIcon },
      { href: "/settings/agency", label: `${t("settings")} › ${t("agencySettings")}`, icon: StoreIcon },
      { href: "/settings/branches", label: `${t("settings")} › ${t("branches")}`, icon: Building2Icon },
      ...(showMargin ? [{ href: "/settings/margin", label: t("marginSettings"), icon: ChartColumnIcon }] : []),
      { href: "/settings/compliance", label: t("complianceSettings"), icon: ShieldCheckIcon },
      { href: "/settings/collections", label: t("collections"), icon: HandCoinsIcon },
      { href: "/settings/connections", label: t("connections"), icon: PlugIcon },
      { href: "/settings/notifications", label: `${t("settings")} › ${t("notificationSettings")}`, icon: BellIcon },
      { href: "/settings/money", label: t("moneySettings"), icon: CoinsIcon },
      { href: "/settings/members", label: t("members"), icon: UserCogIcon },
      ...(mayManageMembers ? [{ href: "/settings/sso", label: t("sso"), icon: Building2Icon }] : []),
      ...(mayViewActivity ? [{ href: "/settings/activity", label: t("activity"), icon: ActivityIcon }] : []),
      ...(mayManageBilling ? [{ href: "/settings/billing", label: t("billing"), icon: CreditCardIcon }] : []),
      { href: "/settings/account", label: t("account"), icon: UserIcon },
    ],
    [areas, t, tm, mayMoney, showMargin, mayManageMembers, mayViewActivity, mayManageBilling],
  );

  // ⌘K / Ctrl+K toggles it from anywhere, fields included (GitHub: the open shortcut also closes it).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || typing(e.target) || document.querySelector("[role=dialog]")) return;
      if (e.key === "?") {
        e.preventDefault();
        setHelp(true);
        return;
      }
      if (pendingG.current !== null) {
        window.clearTimeout(pendingG.current);
        pendingG.current = null;
        const area = areas.find((a) => a.jump === e.key.toLowerCase());
        if (area) {
          e.preventDefault();
          router.push(area.href);
        }
        return;
      }
      if (e.key.toLowerCase() === "g") pendingG.current = window.setTimeout(() => (pendingG.current = null), 1200);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, areas]);

  return (
    <>
      <Sidebar variant="inset" className="sticky top-0 h-[calc(100svh-var(--banner-height,0px))]">
        <SidebarHeader>
          {/* Linear: the workspace name opens the menu that holds Settings. */}
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  className="flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm font-semibold outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring"
                  aria-label={t("agencyMenu")}
                  data-testid="agency-menu"
                />
              }
            >
              {/* The workspace's initials in a small square before its name (Linear's workspace menu; shadcn's team switcher). */}
              <span aria-hidden className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary text-[11px] font-semibold text-primary-foreground">
                {initialsOf(agencyName)}
              </span>
              {/* The demo banner says it is a demo; the name stays readable beside its mark. */}
              <Tip label={agencyName} side="right">
                <span className="truncate">{withoutNote(agencyName)}</span>
              </Tip>
              <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem render={<Link href="/settings/payroll" />} data-testid="menu-settings">
                <SettingsIcon />
                {t("settings")}
              </DropdownMenuItem>
              {/* Completeness audit G1: the agency's own details and its branches (Gusto's company details and locations). */}
              <DropdownMenuItem render={<Link href="/settings/agency" />} data-testid="menu-agency">
                <StoreIcon />
                {t("agencySettings")}
              </DropdownMenuItem>
              <DropdownMenuItem render={<Link href="/settings/branches" />} data-testid="menu-branches">
                <Building2Icon />
                {t("branches")}
              </DropdownMenuItem>
              {showMargin && (
                <DropdownMenuItem render={<Link href="/settings/margin" />} data-testid="menu-margin-settings">
                  <ChartColumnIcon />
                  {t("marginSettings")}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem render={<Link href="/settings/compliance" />} data-testid="menu-compliance-settings">
                <ShieldCheckIcon />
                {t("complianceSettings")}
              </DropdownMenuItem>
              {/* Slice r: the reminder schedule (Stripe's collection settings), beside the other agency settings. */}
              <DropdownMenuItem render={<Link href="/settings/collections" />} data-testid="menu-collections">
                <HandCoinsIcon />
                {t("collections")}
              </DropdownMenuItem>
              {/* Decision 0040: every system Granite exchanges files with (Zapier's App Connections). */}
              <DropdownMenuItem render={<Link href="/settings/connections" />} data-testid="menu-connections">
                <PlugIcon />
                {t("connections")}
              </DropdownMenuItem>
              {/* SPEC §6: the agency's nickname map (docs/patterns/settings/names.md). */}
              <DropdownMenuItem render={<Link href="/settings/names" />} data-testid="menu-names">
                <ContactRoundIcon />
                {t("names")}
              </DropdownMenuItem>
              <DropdownMenuItem render={<Link href="/settings/members" />} data-testid="menu-members">
                <UserCogIcon />
                {t("members")}
              </DropdownMenuItem>
              {/* Decision 0033: the agency's single sign-on, beside Members (Linear: Security; Notion: Identity), for the Owner. */}
              {mayManageMembers && (
                <DropdownMenuItem render={<Link href="/settings/sso" />} data-testid="menu-sso">
                  <Building2Icon />
                  {t("sso")}
                </DropdownMenuItem>
              )}
              {/* Slice k: the agency's log, for the Owner and the accountant (decision 0028). */}
              {mayViewActivity && (
                <DropdownMenuItem render={<Link href="/settings/activity" />} data-testid="menu-activity">
                  <ActivityIcon />
                  {t("activity")}
                </DropdownMenuItem>
              )}
              {/* Decision 0036: the agency's subscription (Linear's Administration › Billing), for the Owner. */}
              {mayManageBilling && (
                <DropdownMenuItem render={<Link href="/settings/billing" />} data-testid="menu-billing">
                  <CreditCardIcon />
                  {t("billing")}
                </DropdownMenuItem>
              )}
              {/* Slice w: the money rules (wage access, invoice funding); everyone reads them, the Owner changes them. */}
              <DropdownMenuItem render={<Link href="/settings/money" />} data-testid="menu-money-settings">
                <CoinsIcon />
                {t("moneySettings")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {/* The person's own items (slice k). */}
              <DropdownMenuGroup>
                <DropdownMenuLabel data-testid="menu-person">{t("youAre", { name: person.name, role: tr(`${person.role}.name`) })}</DropdownMenuLabel>
                <DropdownMenuItem render={<Link href="/settings/account" />} data-testid="menu-account">
                  <UserIcon />
                  {t("account")}
                </DropdownMenuItem>
                {/* Slice r: the person's own notification settings (Linear: Account › Notifications). */}
                <DropdownMenuItem render={<Link href="/settings/notifications" />} data-testid="menu-notification-settings">
                  <BellIcon />
                  {t("notificationSettings")}
                </DropdownMenuItem>
                <DropdownMenuItem disabled={leaving} onClick={() => leave(() => signOutAction())} data-testid="menu-sign-out">
                  <LogOutIcon />
                  {t("signOut")}
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          {/* Linear: the search row under the workspace menu, its shortcut beside it (decision 0038). */}
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={() => setCommandOpen(true)} className="text-sidebar-foreground/80 [&>svg]:text-muted-foreground" data-testid="command-menu-button">
                <SearchIcon />
                <span>{tc("open")}</span>
              </SidebarMenuButton>
              <kbd className="pointer-events-none absolute top-1.5 right-2 rounded border bg-background px-1.5 font-mono text-xs text-muted-foreground">⌘K</kbd>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          <nav aria-label={t("label")} className="contents">
            {[null, ...GROUPS].map((group) => {
              const items = areas.filter((a) => a.group === group);
              if (items.length === 0) return null;
              return (
                <SidebarGroup key={group ?? "home"} className="py-1">
                  {group && <SidebarGroupLabel>{t(`groups.${group}`)}</SidebarGroupLabel>}
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {items.map((a) => {
                        const active = a.href === "/" ? pathname === "/" : pathname === a.href || pathname.startsWith(`${a.href}/`);
                        return (
                          <SidebarMenuItem key={a.key}>
                            {/* Linear's refresh: inactive items muted, the current one full strength. */}
                            <SidebarMenuButton
                              isActive={active}
                              render={<Link href={a.href} />}
                              className="text-sidebar-foreground/80 data-active:text-sidebar-accent-foreground [&>svg]:text-muted-foreground data-active:[&>svg]:text-sidebar-accent-foreground"
                            >
                              <a.icon />
                              <span>{t(a.key)}</span>
                            </SidebarMenuButton>
                            {a.key === "notifications" && unreadCount > 0 && (
                              <SidebarMenuBadge data-testid="notifications-badge" aria-label={t("notificationsBadge", { count: unreadCount })}>
                                {unreadCount}
                              </SidebarMenuBadge>
                            )}
                            {a.key === "compliance" && complianceCount > 0 && (
                              <SidebarMenuBadge data-testid="compliance-badge" aria-label={t("complianceBadge", { count: complianceCount })}>
                                {complianceCount}
                              </SidebarMenuBadge>
                            )}
                          </SidebarMenuItem>
                        );
                      })}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              );
            })}
          </nav>
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={() => setHelp(true)} className="text-sidebar-foreground/80 [&>svg]:text-muted-foreground" data-testid="shortcuts-button">
                <KeyboardIcon />
                <span>{t("shortcuts")}</span>
              </SidebarMenuButton>
              <kbd className="pointer-events-none absolute top-1.5 right-2 rounded border bg-background px-1.5 font-mono text-xs text-muted-foreground">?</kbd>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
      <Dialog open={help} onOpenChange={setHelp}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("shortcuts")}</DialogTitle>
          </DialogHeader>
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
            {areas.map((a) => (
              <div key={a.key} className="contents">
                <dt>
                  <kbd className="rounded border px-1.5 font-mono text-xs">G</kbd> <kbd className="rounded border px-1.5 font-mono text-xs">{a.jump.toUpperCase()}</kbd>
                </dt>
                <dd>{t(a.key)}</dd>
              </div>
            ))}
            <dt>
              <kbd className="rounded border px-1.5 font-mono text-xs">⌘</kbd> <kbd className="rounded border px-1.5 font-mono text-xs">K</kbd>
            </dt>
            <dd>{tc("shortcut")}</dd>
            <dt>
              <kbd className="rounded border px-1.5 font-mono text-xs">?</kbd>
            </dt>
            <dd>{t("shortcuts")}</dd>
          </dl>
        </DialogContent>
      </Dialog>
      <CommandMenu open={commandOpen} onOpenChange={setCommandOpen} pages={commandPages} onShortcuts={() => setHelp(true)} />
    </>
  );
}
