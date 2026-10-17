"use client";

// Pattern: docs/patterns/_layouts/app.md — Linear sidebar and keyboard navigation.
import { ActivityIcon, BanknoteIcon, BriefcaseIcon, Building2Icon, ChartColumnIcon, ChevronDownIcon, ClipboardCheckIcon, ContactRoundIcon, CreditCardIcon, FileSpreadsheetIcon, HouseIcon, KeyboardIcon, LandmarkIcon, LogOutIcon, ReceiptTextIcon, SettingsIcon, ShieldCheckIcon, UserCogIcon, UserIcon, UsersIcon, WalletIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { signOutAction } from "@/app/[locale]/(auth)/actions";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import type { Role } from "@/server/permissions";
import { useCan } from "./abilities";
import { initialsOf, withoutNote } from "./person";

// Home first, then the areas in groups under short labels (decision 0029: Stripe's sidebar sections,
// Apple's two levels at most). The G-then-letter keys stay as they were.
const AREAS = [
  { href: "/", key: "home", jump: "h", icon: HouseIcon, group: null },
  { href: "/convert", key: "convert", jump: "c", icon: FileSpreadsheetIcon, group: "payroll" },
  { href: "/approvals", key: "approvals", jump: "p", icon: ClipboardCheckIcon, group: "payroll" },
  { href: "/invoices", key: "invoices", jump: "i", icon: ReceiptTextIcon, group: "billing" },
  { href: "/receivables", key: "receivables", jump: "r", icon: WalletIcon, group: "billing" },
  { href: "/payments", key: "payments", jump: "y", icon: BanknoteIcon, group: "billing" },
  { href: "/bank", key: "bank", jump: "b", icon: LandmarkIcon, group: "billing" },
  { href: "/job-orders", key: "jobOrders", jump: "j", icon: BriefcaseIcon, group: "staffing" },
  { href: "/assignments", key: "assignments", jump: "a", icon: UsersIcon, group: "staffing" },
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

export function AppSidebar({ agencyName, person, showMargin = false, complianceCount = 0 }: { agencyName: string; person: { name: string; role: Role }; showMargin?: boolean; complianceCount?: number }) {
  const t = useTranslations("nav");
  const tr = useTranslations("roles");
  const [leaving, leave] = useTransition();
  const pathname = usePathname();
  const router = useRouter();
  const [help, setHelp] = useState(false);
  const pendingG = useRef<number | null>(null);
  const areas = useMemo(() => AREAS.filter((a) => a.key !== "margin" || showMargin), [showMargin]);
  const mayViewActivity = useCan()("viewActivity");
  const mayManageMembers = useCan()("members");
  const mayManageBilling = useCan()("billing");

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
              <span className="truncate" title={agencyName}>
                {withoutNote(agencyName)}
              </span>
              <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem render={<Link href="/settings/payroll" />} data-testid="menu-settings">
                <SettingsIcon />
                {t("settings")}
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
              <DropdownMenuSeparator />
              {/* The person's own items (slice k). */}
              <DropdownMenuGroup>
                <DropdownMenuLabel data-testid="menu-person">{t("youAre", { name: person.name, role: tr(`${person.role}.name`) })}</DropdownMenuLabel>
                <DropdownMenuItem render={<Link href="/settings/account" />} data-testid="menu-account">
                  <UserIcon />
                  {t("account")}
                </DropdownMenuItem>
                <DropdownMenuItem disabled={leaving} onClick={() => leave(() => signOutAction())} data-testid="menu-sign-out">
                  <LogOutIcon />
                  {t("signOut")}
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
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
              <kbd className="rounded border px-1.5 font-mono text-xs">?</kbd>
            </dt>
            <dd>{t("shortcuts")}</dd>
          </dl>
        </DialogContent>
      </Dialog>
    </>
  );
}
