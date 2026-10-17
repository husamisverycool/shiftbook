"use client";

/**
 * The step frame from docs/patterns/convert.md (Gusto payroll-run flow): step trail and Save and exit
 * in the header row, heading with the period, the step's forward action in the heading row, alerts,
 * then the body. While the forward action works, the body becomes a loading panel.
 */
import { Loader2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { createContext, useContext, useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { approveRunAction, computeTotalsAction, createFilesAction } from "@/app/[locale]/(app)/convert/actions";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Button, buttonVariants } from "@/components/ui/button";
import { Link, useRouter } from "@/i18n/navigation";
import { useCan } from "../abilities";
import { REFUSAL_MESSAGE, STEPS, type Step } from "./types";


export type Forward =
  | { kind: "link"; step: Step; disabled: boolean }
  | { kind: "computeTotals"; disabled: boolean }
  | { kind: "approve"; disabled: boolean; fingerprint: string | null }
  | { kind: "createFiles"; disabled: boolean; fingerprint: string | null }
  | null;

const Working = createContext<{ working: boolean }>({ working: false });
export const useWorking = () => useContext(Working);

const hrefFor = (periodId: string, step: Step) => ({ pathname: "/convert", query: { period: periodId, step } });

export function ConvertFrame(props: {
  periodId: string;
  step: Step;
  locked: boolean;
  title: string;
  periodLine: ReactNode;
  forward: Forward;
  editHref?: boolean;
  alerts?: ReactNode;
  children: ReactNode;
}) {
  const t = useTranslations("convert");
  const router = useRouter();
  const can = useCan();
  const [pending, start] = useTransition();
  const [working, setWorking] = useState<null | "totals" | "approve" | "files">(null);
  const index = STEPS.indexOf(props.step);
  const reached = STEPS.slice(0, index + 1);
  const previous = index > 0 ? STEPS[index - 1]! : null;
  // Decision 0026: a person who does not change hours still looks at the next step; approving and the files are the Owner's.
  const mayHours = can("hours");
  const ownerRuns = (props.forward?.kind === "approve" || props.forward?.kind === "createFiles") && !can("run");
  const forward: Forward = props.forward?.kind === "computeTotals" && !mayHours ? { kind: "link", step: "exceptions", disabled: props.forward.disabled } : ownerRuns ? null : props.forward;

  const runForward = () => {
    const f = forward;
    if (!f) return;
    if (f.kind === "link") {
      router.push(hrefFor(props.periodId, f.step));
      return;
    }
    setWorking(f.kind === "computeTotals" ? "totals" : f.kind === "approve" ? "approve" : "files");
    start(async () => {
      if (f.kind === "computeTotals") {
        const r = await computeTotalsAction(props.periodId);
        if ("error" in r) {
          toast.error(t(`errors.${REFUSAL_MESSAGE[r.error]}`));
          setWorking(null);
          router.refresh();
        } else router.push(hrefFor(props.periodId, "exceptions"));
      } else if (f.kind === "approve") {
        const r = await approveRunAction(props.periodId, f.fingerprint ?? "");
        if (!r.ok) {
          const key = { not_allowed: "errors.notAllowed", changed: "errors.totalsChanged", blocked: "errors.approvalBlocked", period_locked: "errors.periodLocked", busy: "errors.busy", generic: "errors.generic" } as const;
          toast.error(t(key[r.error]));
        }
        setWorking(null);
        router.refresh();
      } else {
        const r = await createFilesAction(props.periodId, f.fingerprint ?? "");
        if (r.ok) router.push(hrefFor(props.periodId, "files"));
        else {
          const key = { not_ready: "errors.notReady", not_approved: "errors.notApproved", totals_changed: "errors.totalsChanged", period_locked: "errors.periodLocked", busy: "errors.busy", generic: "errors.generic" } as const;
          toast.error(t(key[r.error]));
          setWorking(null);
          router.refresh();
        }
      }
    });
  };

  const forwardLabel = (() => {
    const f = forward;
    if (!f) return null;
    if (f.kind === "link") return t(`forward.${props.step === "upload" ? "upload" : props.step === "exceptions" ? "exceptions" : "hours"}`);
    if (f.kind === "computeTotals") return working === "totals" ? t("forward.hoursWorking") : t("forward.hours");
    if (f.kind === "approve") return working === "approve" ? t("forward.approveWorking") : t("forward.approve");
    return working === "files" ? t("forward.totalsWorking") : t("forward.totals");
  })();
  const forwardButton = forward ? (
    <Button onClick={runForward} disabled={forward.disabled || pending} className="max-md:w-full" data-testid="forward">
      {pending && <Loader2Icon className="animate-spin" />}
      {forwardLabel}
    </Button>
  ) : (
    // Before approval, Review totals says it already (convert.approval.ownerOnly).
    ownerRuns && props.forward?.kind === "createFiles" && <p className="text-sm text-muted-foreground">{t("forward.ownerOnly")}</p>
  );
  const editButton = props.editHref && !props.locked && mayHours && (
    <Link href={hrefFor(props.periodId, "hours")} aria-disabled={pending} className={buttonVariants({ variant: "outline", className: `max-md:w-full ${pending ? "pointer-events-none opacity-50" : ""}` })}>
      {t("totals.edit")}
    </Link>
  );

  return (
    <Working.Provider value={{ working: working !== null && pending }}>
      {/* The same column and padding as every other page (Page in ../page.tsx). */}
      <div className="mx-auto flex w-full min-w-0 max-w-7xl flex-col gap-8 px-4 py-6 md:px-8 md:py-8">
        <div className="flex items-center justify-between gap-4">
          <nav aria-label={t("steps.upload")} className="min-w-0">
            {/* Narrow containers: the trail collapses to one back link naming the previous step. */}
            {previous && !props.locked && (
              <Link href={hrefFor(props.periodId, previous)} className="text-sm text-muted-foreground hover:text-foreground md:hidden">
                {t("back", { step: t(`steps.${previous}`) })}
              </Link>
            )}
            <Breadcrumb className={previous && !props.locked ? "max-md:hidden" : undefined}>
              <BreadcrumbList>
                {reached.map((s, i) => [
                  i > 0 ? <BreadcrumbSeparator key={`${s}-sep`} /> : null,
                  <BreadcrumbItem key={s}>
                    {s === props.step ? (
                      <BreadcrumbPage aria-current="step">{t(`steps.${s}`)}</BreadcrumbPage>
                    ) : props.locked ? (
                      <span>{t(`steps.${s}`)}</span>
                    ) : (
                      <BreadcrumbLink render={<Link href={hrefFor(props.periodId, s)} />}>{t(`steps.${s}`)}</BreadcrumbLink>
                    )}
                  </BreadcrumbItem>,
                ])}
              </BreadcrumbList>
            </Breadcrumb>
          </nav>
          <Link href="/convert" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            {t("saveAndExit")}
          </Link>
        </div>

        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex flex-col gap-1">
            <h1 className="text-[28px] leading-9 font-bold tracking-tight">{props.title}</h1>
            <p className="text-sm text-muted-foreground">{props.periodLine}</p>
            {!mayHours && <p className="text-sm text-muted-foreground">{t("readOnly")}</p>}
          </div>
          {(forwardButton || editButton) && (
            <div className="flex gap-2 max-md:grid max-md:grid-cols-[repeat(auto-fit,minmax(0,1fr))]">
              {editButton}
              {forwardButton}
            </div>
          )}
        </div>

        {working !== null && pending ? (
          <LoadingPanel title={working === "totals" ? t("loadingTitle") : t("filesLoadingTitle")} body={t("loadingBody")} />
        ) : (
          <>
            {props.alerts && <div className="flex flex-col gap-4">{props.alerts}</div>}
            {props.children}
          </>
        )}
      </div>
    </Working.Provider>
  );
}

export function LoadingPanel({ title, body }: { title: string; body: string }) {
  return (
    <div role="status" className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-16 text-center">
      <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
      <p className="font-medium">{title}</p>
      {body && <p className="text-sm text-muted-foreground">{body}</p>}
    </div>
  );
}
