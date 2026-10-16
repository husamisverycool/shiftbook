"use client";

// Pattern: docs/patterns/_layouts/app.md — Linear sidebar and keyboard navigation.
import { BanknoteIcon, BriefcaseIcon, Building2Icon, ChartColumnIcon, ChevronDownIcon, ClipboardCheckIcon, ContactRoundIcon, FileSpreadsheetIcon, LandmarkIcon, LogOutIcon, ReceiptTextIcon, SettingsIcon, ShieldCheckIcon, UserCogIcon, UserIcon, UsersIcon, WalletIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { signOutAction } from "@/app/[locale]/(auth)/actions";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarHeader, SidebarMenu, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import type { Role } from "@/server/permissions";

const AREAS = [
  { href: "/convert", key: "convert", jump: "c", icon: FileSpreadsheetIcon },
  { href: "/job-orders", key: "jobOrders", jump: "j", icon: BriefcaseIcon },
  { href: "/assignments", key: "assignments", jump: "a", icon: UsersIcon },
  { href: "/approvals", key: "approvals", jump: "p", icon: ClipboardCheckIcon },
  { href: "/invoices", key: "invoices", jump: "i", icon: ReceiptTextIcon },
  { href: "/clients", key: "clients", jump: "l", icon: Building2Icon },
  { href: "/receivables", key: "receivables", jump: "r", icon: WalletIcon },
  { href: "/payments", key: "payments", jump: "y", icon: BanknoteIcon },
  { href: "/bank", key: "bank", jump: "b", icon: LandmarkIcon },
  // Slice i: the Owner and the accountant only (SPEC §2).
  { href: "/margin", key: "margin", jump: "m", icon: ChartColumnIcon },
  // Slice j: everyone reads compliance; the badge counts what is overdue or due soon.
  { href: "/compliance", key: "compliance", jump: "o", icon: ShieldCheckIcon },
  // Slice k: the roster, read by everyone; the Owner and coordinators change it.
  { href: "/workers", key: "workers", jump: "w", icon: ContactRoundIcon },
] as const;

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
      <Sidebar className="sticky top-0 h-svh">
        <SidebarHeader>
          {/* Linear: the workspace name opens the menu that holds Settings. */}
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  className="flex w-full min-w-0 items-center gap-1 rounded-md px-2 py-1 text-left text-sm font-semibold outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring"
                  aria-label={t("agencyMenu")}
                  data-testid="agency-menu"
                />
              }
            >
              <span className="truncate">{agencyName}</span>
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
          <SidebarGroup>
            <SidebarGroupContent>
              <nav aria-label={t("label")}>
                <SidebarMenu>
                  {areas.map((a) => (
                    <SidebarMenuItem key={a.key}>
                      <SidebarMenuButton isActive={pathname === a.href || pathname.startsWith(`${a.href}/`)} render={<Link href={a.href} />}>
                        <a.icon />
                        <span>{t(a.key)}</span>
                      </SidebarMenuButton>
                      {a.key === "compliance" && complianceCount > 0 && (
                        <SidebarMenuBadge data-testid="compliance-badge" aria-label={t("complianceBadge", { count: complianceCount })}>
                          {complianceCount}
                        </SidebarMenuBadge>
                      )}
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </nav>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
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
