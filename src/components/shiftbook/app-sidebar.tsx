"use client";

// Pattern: docs/patterns/_layouts/app.md — Linear sidebar and keyboard navigation.
import { BriefcaseIcon, ClipboardCheckIcon, FileSpreadsheetIcon, UsersIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { Link, usePathname, useRouter } from "@/i18n/navigation";

const AREAS = [
  { href: "/convert", key: "convert", jump: "c", icon: FileSpreadsheetIcon },
  { href: "/job-orders", key: "jobOrders", jump: "j", icon: BriefcaseIcon },
  { href: "/assignments", key: "assignments", jump: "a", icon: UsersIcon },
  { href: "/approvals", key: "approvals", jump: "p", icon: ClipboardCheckIcon },
] as const;

/** True while the person is typing, so single-letter shortcuts stay out of the way. */
export function typing(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || el.getAttribute("role") === "combobox");
}

export function AppSidebar({ agencyName }: { agencyName: string }) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const router = useRouter();
  const [help, setHelp] = useState(false);
  const pendingG = useRef<number | null>(null);

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
        const area = AREAS.find((a) => a.jump === e.key.toLowerCase());
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
  }, [router]);

  return (
    <>
      <Sidebar className="sticky top-0 h-svh">
        <SidebarHeader>
          <p className="truncate px-2 py-1 text-sm font-semibold">{agencyName}</p>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <nav aria-label={t("label")}>
                <SidebarMenu>
                  {AREAS.map((a) => (
                    <SidebarMenuItem key={a.key}>
                      <SidebarMenuButton isActive={pathname === a.href || pathname.startsWith(`${a.href}/`)} render={<Link href={a.href} />}>
                        <a.icon />
                        <span>{t(a.key)}</span>
                      </SidebarMenuButton>
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
            {AREAS.map((a) => (
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
