"use client";

// Pattern: docs/patterns/workers/[id].md — Toast Payroll employee profile: tabs at the top of the
// record (Profile, Employment; Shiftbook adds Documents), each subject a section with its own Edit,
// Retrieve SSN; Square's order of sections (personal information first).
import { ArrowLeftIcon, PencilIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import type { WorkerProfile } from "@/server/workers/queries";
import { useCan } from "../abilities";
import { DocumentsTab } from "./documents";
import { EmploymentTab } from "./employment";
import { PayrollSection, PersonalSection, SsnSection } from "./profile-sections";

const TABS = ["profile", "employment", "documents"] as const;
type Tab = (typeof TABS)[number];

export function WorkerProfileView({ profile, today }: { profile: WorkerProfile; today: string }) {
  const t = useTranslations("workers");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const mayChange = useCan()("workers");
  const tab: Tab = (TABS as readonly string[]).includes(params.get("tab") ?? "") ? (params.get("tab") as Tab) : "profile";
  const setTab = (next: string) => router.replace(next === "profile" ? pathname : `${pathname}?tab=${next}`, { scroll: false });
  const name = `${profile.firstName} ${profile.lastName}`;

  return (
    <div className="mx-auto flex w-full max-w-5xl min-w-0 flex-col gap-6 px-4 py-6">
      <header className="flex flex-col gap-3">
        <Link href="/workers" className={buttonVariants({ variant: "link", size: "sm", className: "w-fit px-0" })}>
          <ArrowLeftIcon />
          {t("profile.back")}
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-[28px] leading-9 font-bold tracking-tight">{name}</h1>
          <Badge variant={profile.status === "active" ? "secondary" : "outline"} data-testid="worker-status">
            {t(`status.${profile.status}`)}
          </Badge>
        </div>
        {!mayChange && <p className="text-sm text-muted-foreground">{t("profile.readOnly")}</p>}
      </header>

      <Tabs value={tab} onValueChange={(v) => setTab(String(v))} className="min-w-0">
        <TabsList variant="line" className="h-10! w-full justify-start border-b">
          {TABS.map((k) => (
            <TabsTrigger key={k} value={k} data-testid={`tab-${k}`}>
              {t(`profile.tabs.${k}`)}
              {k === "documents" && profile.documents.length > 0 && <span className="ml-1 text-muted-foreground tabular-nums">{profile.documents.length}</span>}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="profile" className="flex flex-col gap-4 pt-4">
          <PersonalSection profile={profile} mayChange={mayChange} />
          <SsnSection profile={profile} mayChange={mayChange} />
          <PayrollSection profile={profile} mayChange={mayChange} />
        </TabsContent>
        <TabsContent value="employment" className="flex flex-col gap-4 pt-4">
          <EmploymentTab profile={profile} today={today} mayChange={mayChange} />
        </TabsContent>
        <TabsContent value="documents" className="flex flex-col gap-4 pt-4">
          <DocumentsTab profile={profile} today={today} mayChange={mayChange} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/** A section of the profile: its heading, its own Edit on the right (Toast), and its body. */
export function Section({ title, testId, onEdit, editing, actions, children }: { title: string; testId: string; onEdit?: () => void; editing?: boolean; actions?: ReactNode; children: ReactNode }) {
  const t = useTranslations("workers.profile");
  const headingId = `${testId}-title`;
  return (
    <section className="flex flex-col gap-4 rounded-xl border bg-card p-5" aria-labelledby={headingId} data-testid={testId}>
      <div className="flex flex-wrap items-center gap-2">
        <h2 id={headingId} className="mr-auto text-base font-semibold">
          {title}
        </h2>
        {actions}
        {onEdit && !editing && (
          <Button size="sm" variant="outline" onClick={onEdit} data-testid={`${testId}-edit`}>
            <PencilIcon />
            {t("edit")}
          </Button>
        )}
      </div>
      {children}
    </section>
  );
}

/** Label and value rows, the way every section reads when not editing. */
export function Facts({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-8 gap-y-3 text-sm sm:grid-cols-[minmax(11rem,auto)_1fr]">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="min-w-0">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Escape cancels an open Edit (the pattern's interaction), unless a dialog is up. */
export function useEscapeCancels(editing: boolean, cancel: () => void) {
  useEffect(() => {
    if (!editing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector("[role=dialog]")) cancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing, cancel]);
}

/** Save and Cancel under a section's fields. */
export function EditButtons({ pending, onCancel, testId }: { pending: boolean; onCancel: () => void; testId: string }) {
  const t = useTranslations("workers.profile");
  return (
    <div className="flex gap-2">
      <Button type="submit" size="sm" disabled={pending} data-testid={`${testId}-save`}>
        {t("save")}
      </Button>
      <Button type="button" size="sm" variant="outline" onClick={onCancel}>
        {t("cancel")}
      </Button>
    </div>
  );
}
