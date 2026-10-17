"use client";

// Pattern: docs/patterns/workers/[id].md — Toast Payroll employee profile: tabs at the top of the
// record (Profile, Employment; Granite adds Documents), each subject a section with its own Edit,
// Retrieve SSN; Square's order of sections (personal information first).
import { PencilIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import type { WorkerProfile } from "@/server/workers/queries";
import { useCan } from "../abilities";
import { longDate } from "../format";
import { Crumbs, Facts as DetailFacts, Page, PageHeader, RECORD_LINK, RecordLayout, Section as RecordSection } from "../page";
import { Status } from "../status";
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
  const tc = useTranslations("common");
  const locale = useLocale();

  const current = profile.placements.filter((p) => p.current);
  const details = [
    { label: t("profile.employment.status"), value: profile.status === "active" ? t("status.active") : profile.endedOn ? t("profile.employment.endedOn", { date: longDate(profile.endedOn, locale) }) : t("status.ended") },
    {
      label: t("col.placement"),
      value:
        current.length === 0 ? (
          t("notPlaced")
        ) : (
          <span className="flex flex-col gap-1">
            {current.map((p) => (
              <Link key={p.id} href={`/job-orders/${p.jobOrderId}`} className={RECORD_LINK} data-testid="details-assignment">
                {t("placementAt", { position: p.position, client: p.clientName })}
              </Link>
            ))}
          </span>
        ),
    },
    { label: t("col.hired"), value: profile.hireDate ? longDate(profile.hireDate, locale) : "—" },
    { label: t("profile.personal.language"), value: t(`language.${profile.preferredLanguage === "es" ? "es" : "en"}`) },
  ];
  // The record's identifying facts under its title (_components/record-page.md item 3): the worker's
  // number in the payroll system in use, and when they were hired.
  const inUse = profile.system ? profile.payrollIds[profile.system] : undefined;
  const facts = [
    ...(profile.system && inUse ? [t("profile.facts.payroll", { system: t(`systems.${profile.system}`), number: inUse.id })] : []),
    ...(profile.hireDate ? [t("profile.facts.hired", { date: longDate(profile.hireDate, locale) })] : []),
  ];

  return (
    <Page>
      <PageHeader
        context={<Crumbs label={tc("breadcrumb")} items={[{ label: t("profile.back"), href: "/workers" }]} />}
        title={name}
        status={
          <Status tone={profile.status === "active" ? "success" : "neutral"} size="lg" data-testid="worker-status">
            {t(`status.${profile.status}`)}
          </Status>
        }
        description={
          facts.length > 0 || !mayChange ? (
            <span className="flex flex-col gap-1">
              {facts.length > 0 && <span data-testid="worker-facts">{facts.join(" · ")}</span>}
              {!mayChange && <span>{t("profile.readOnly")}</span>}
            </span>
          ) : undefined
        }
      />

      <RecordLayout
        aside={
          <RecordSection id="worker-details" title={t("profile.details")}>
            <DetailFacts items={details} />
          </RecordSection>
        }
      >
      <Tabs value={tab} onValueChange={(v) => setTab(String(v))} className="min-w-0">
        <TabsList variant="line" className="h-10! w-full justify-start border-b">
          {TABS.map((k) => (
            <TabsTrigger key={k} value={k} data-testid={`tab-${k}`}>
              {t(`profile.tabs.${k}`)}
              {k === "documents" && profile.documents.length > 0 && <span className="ml-1 text-muted-foreground tabular-nums">{profile.documents.length}</span>}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="profile" className="flex flex-col gap-10 pt-6">
          <PersonalSection profile={profile} mayChange={mayChange} />
          <SsnSection profile={profile} mayChange={mayChange} />
          <PayrollSection profile={profile} mayChange={mayChange} />
        </TabsContent>
        <TabsContent value="employment" className="flex flex-col gap-10 pt-6">
          <EmploymentTab profile={profile} today={today} mayChange={mayChange} />
        </TabsContent>
        <TabsContent value="documents" className="flex flex-col gap-10 pt-6">
          <DocumentsTab profile={profile} today={today} mayChange={mayChange} />
        </TabsContent>
      </Tabs>
      </RecordLayout>
    </Page>
  );
}

/** A section of the profile: its heading, its own Edit on the right (Toast), and its body. */
export function Section({ title, testId, onEdit, editing, actions, children }: { title: string; testId: string; onEdit?: () => void; editing?: boolean; actions?: ReactNode; children: ReactNode }) {
  const t = useTranslations("workers.profile");
  const headingId = `${testId}-title`;
  return (
    <section className="flex flex-col gap-4" aria-labelledby={headingId} data-testid={testId}>
      <div className="flex min-h-8 flex-wrap items-center gap-2 border-b pb-2">
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
