"use client";

// Pattern: docs/patterns/settings/connections.md — Zapier's App Connections: Connected and Available
// tabs; each connection's name, kind and last use with its status and a row menu (Test, Open,
// Download template, Forget saved mapping); Stripe's apps catalogue for Available: a section per
// category, each system's name over one sentence and Set up at the right. Linear's settings look.
import { BanknoteIcon, BriefcaseIcon, ClockIcon, EllipsisIcon, HandshakeIcon, ReceiptTextIcon, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { forgetMappingAction, testConnectionAction } from "@/app/[locale]/(app)/settings/connections/actions";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import type { Connection, ConnectionKind, ConnectionsView } from "@/server/connections/queries";
import { useCan } from "../abilities";
import { useDateTime } from "../agency-zone";
import { SettingsEmpty, SettingsPage, SettingsRow, SettingsRows, SettingsSection, SettingsTile } from "../settings-panel";
import { Status } from "../status";

const ICON: Record<ConnectionKind, LucideIcon> = { payroll: BanknoteIcon, recruiting: BriefcaseIcon, time_file: ClockIcon, invoice_upload: ReceiptTextIcon, partner: HandshakeIcon };
const ORDER: ConnectionKind[] = ["payroll", "recruiting", "time_file", "invoice_upload", "partner"];

export function ConnectionsSettings({ view, tab, canForget }: { view: ConnectionsView; tab: "connected" | "available"; canForget: boolean }) {
  const t = useTranslations("connections");
  const tSettings = useTranslations("settings");
  const router = useRouter();
  const pathname = usePathname();
  const [current, setCurrent] = useState(tab);
  const choose = (next: string) => {
    setCurrent(next as typeof tab);
    router.replace(next === "available" ? `${pathname}?tab=available` : pathname, { scroll: false });
  };
  const connected = [...view.connected].sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
  return (
    <SettingsPage context={tSettings("title")} title={t("title")}>
      <Tabs value={current} onValueChange={(v) => choose(String(v))} className="gap-6">
        <TabsList variant="line" className="h-10! w-full justify-start border-b">
          <TabsTrigger value="connected" data-testid="tab-connected">
            {t("tabs.connected")} <span className="text-muted-foreground tabular-nums">{connected.length}</span>
          </TabsTrigger>
          <TabsTrigger value="available" data-testid="tab-available">
            {t("tabs.available")}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="connected">
          <SettingsSection title={t("tabs.connected")} titleHidden>
            <SettingsRows as="ul" testId="connections">
              {connected.length === 0 ? (
                <SettingsEmpty as="li">
                  <span>
                    {t("empty")}{" "}
                    <button type="button" className="rounded-sm underline underline-offset-4 outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50" onClick={() => choose("available")}>
                      {t("tabs.available")}
                    </button>
                  </span>
                </SettingsEmpty>
              ) : (
                connected.map((c) => <ConnectionRow key={c.key} c={c} canForget={canForget} />)
              )}
            </SettingsRows>
          </SettingsSection>
        </TabsContent>
        <TabsContent value="available">
          <Available view={view} />
        </TabsContent>
      </Tabs>
    </SettingsPage>
  );
}

function useName() {
  const t = useTranslations("connections");
  return (c: Pick<Connection, "kind" | "system" | "detail">) => {
    const name = t.has(`systems.${c.system}`) ? t(`systems.${c.system}` as "systems.other") : c.system;
    return c.detail ? t("forClient", { name, client: c.detail }) : name;
  };
}

function ConnectionRow({ c, canForget }: { c: Connection; canForget: boolean }) {
  const t = useTranslations("connections");
  const name = useName();
  const when = useDateTime();
  const router = useRouter();
  const [testing, test] = useTransition();
  const [forgetting, forget] = useTransition();
  const [confirm, setConfirm] = useState(false);
  const can = useCan();
  const Icon = ICON[c.kind];
  const attention = c.attention ? t(`attention.${c.attention.key}` as "attention.noMapping", c.attention.values ?? {}) : null;
  const runTest = () =>
    test(async () => {
      const r = await testConnectionAction(c.key);
      if ("error" in r) toast.error(t("stale"));
      else if (r.status === "ready") toast.success(t("testReady", { name: name(c) }));
      else toast.warning(t(`attention.${r.attention!.key}` as "attention.noMapping", r.attention!.values ?? {}));
      router.refresh();
    });
  return (
    <SettingsRow
      as="li"
      testId={`connection-${c.key}`}
      leading={
        <SettingsTile>
          <Icon aria-hidden />
        </SettingsTile>
      }
      label={name(c)}
      description={
        <>
          {t(`kinds.${c.kind}`)} · {c.lastUsedAt ? t("lastUsed", { date: when(c.lastUsedAt, { date: "long", time: false }), count: c.uses }) : t("notUsed")}
          {attention && <span className="block text-amber-700 dark:text-amber-400">{attention}</span>}
        </>
      }
      control={
        <>
          <Status tone={c.status === "ready" ? "success" : "warning"} data-testid="connection-status">
            {t(`status.${c.status}`)}
          </Status>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={t("menu", { name: name(c) })} loading={testing || forgetting} loadingLabel={t("testing")} />}>
              <EllipsisIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {((c.kind === "payroll" && can("settings")) || (c.kind === "recruiting" && can("placements"))) && (
                <DropdownMenuItem onClick={runTest} data-testid="connection-test">
                  {t("actions.test")}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem render={<Link href={c.href} />}>{t("actions.open")}</DropdownMenuItem>
              {c.kind === "recruiting" && <DropdownMenuItem render={<a href={`/api/files/placement-template?source=${c.system}`} download />}>{t("actions.template")}</DropdownMenuItem>}
              {c.forgettable && canForget && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onClick={() => setConfirm(true)} data-testid="connection-forget">
                    {t("actions.forget")}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <AlertDialog open={confirm} onOpenChange={setConfirm}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("forgetTitle", { name: name(c) })}</AlertDialogTitle>
                <AlertDialogDescription>{t("forgetBody")}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  data-testid="connection-forget-confirm"
                  onClick={() =>
                    forget(async () => {
                      const r = await forgetMappingAction(c.system);
                      if (r.ok) toast.success(t("forgotten", { name: name(c) }));
                      else toast.error(t("stale"));
                      setConfirm(false);
                      router.refresh();
                    })
                  }
                >
                  {t("actions.forget")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      }
    />
  );
}

/** Stripe's catalogue: a section per category, each system's name over one sentence, Set up at the right. */
function Available({ view }: { view: ConnectionsView }) {
  const t = useTranslations("connections");
  const when = useDateTime();
  const setUp = (href: string, testId: string) => (
    <Link href={href} className={buttonVariants({ variant: "outline", size: "sm" })} data-testid={testId}>
      {t("setUp")}
    </Link>
  );
  const inUse = <span className="text-sm text-muted-foreground">{t("inUse")}</span>;
  const notYet = <span className="text-sm text-muted-foreground">{t("notYet")}</span>;
  return (
    <div className="flex flex-col gap-12">
      <SettingsSection title={t("groups.payroll")} description={t("groupHints.payroll")}>
        <SettingsRows as="ul" testId="available-payroll">
          {view.payrollFormats.map((f) => (
            <SettingsRow as="li" key={f} label={t(`systems.${f}` as "systems.other")} description={t(`about.${f}` as "about.other")} control={view.inUse.payroll === f ? inUse : setUp("/settings/payroll", `set-up-${f}`)} />
          ))}
        </SettingsRows>
      </SettingsSection>
      <SettingsSection title={t("groups.recruiting")} description={t("groupHints.recruiting")}>
        <SettingsRows as="ul" testId="available-recruiting">
          {view.sources.map((s) => (
            <SettingsRow as="li" key={s} label={t(`systems.${s}` as "systems.other")} description={t(`about.${s}` as "about.other")} control={setUp("/assignments/import", `set-up-${s}`)} />
          ))}
        </SettingsRows>
      </SettingsSection>
      <SettingsSection title={t("groups.time")} description={t("groupHints.time")}>
        <SettingsRows as="ul" testId="available-time">
          {view.timeProfiles.map((p) => (
            <SettingsRow as="li" key={p} label={t(`systems.${p}` as "systems.other")} description={t(`about.${p}` as "about.other")} control={view.inUse.time.includes(p) ? inUse : setUp("/convert", `set-up-${p}`)} />
          ))}
          {view.vmsNotYet.map((v) => (
            <SettingsRow as="li" key={v} label={t(`systems.${v}` as "systems.other")} description={t("about.vmsNotYet")} control={notYet} />
          ))}
        </SettingsRows>
      </SettingsSection>
      <SettingsSection title={t("groups.partners")} description={t("groupHints.partners")}>
        <SettingsRows as="ul" testId="available-partners">
          {view.partners.map((p) => (
            <SettingsRow
              as="li"
              key={p.key}
              label={t(`partners.${p.key}`)}
              description={p.lastUsedAt ? t("about.partnerLast", { date: when(p.lastUsedAt), count: p.uses }) : t("about.partner")}
              control={
                <Link href={p.href} className={buttonVariants({ variant: "outline", size: "sm" })} data-testid={`open-partner-${p.key}`}>
                  {t("openMoney")}
                </Link>
              }
            />
          ))}
        </SettingsRows>
      </SettingsSection>
    </div>
  );
}
