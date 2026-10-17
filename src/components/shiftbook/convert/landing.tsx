// Landing from docs/patterns/convert.md (Gusto payroll list): heading, then pay periods with status
// and the row's action at the row's end.
import { getLocale, getTranslations } from "next-intl/server";
import { CalendarRangeIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
import { EmptyState } from "../empty-state";
import { StartPeriodButton } from "./start-period";
import { longDate } from "../format";
import { Page, PageHeader, TableFrame } from "../page";
import { Status } from "../status";
import { PERIOD_TONE } from "./period-tone";

export interface LandingPeriod {
  id: string;
  startsOn: string;
  endsOn: string;
  runStatus: string | null;
  /** A correction of a paid period is open (slice e). */
  correcting: boolean;
  started: boolean;
}

/**
 * `setup`: whether the pay week's day is set (periods are made from it; completeness audit G1), whether
 * this person may start an earlier week, and today for the date picker.
 */
export async function Landing({ periods, setup }: { periods: LandingPeriod[]; setup: { weekSet: boolean; canStart: boolean; today: string } }) {
  const t = await getTranslations("landing");
  const tp = await getTranslations("periodSetup");
  const locale = await getLocale();
  return (
    <Page>
      <PageHeader title={t("title")} actions={setup.weekSet && setup.canStart ? <StartPeriodButton today={setup.today} /> : undefined} />
      {!setup.weekSet ? (
        <EmptyState
          icon={CalendarRangeIcon}
          title={tp("noWeekTitle")}
          description={tp("noWeekBody")}
          action={
            <Link href="/settings/payroll" className={buttonVariants({ size: "sm" })} data-testid="set-pay-week">
              {tp("noWeekAction")}
            </Link>
          }
          testId="no-pay-week"
        />
      ) : periods.length === 0 ? (
        <EmptyState
          icon={CalendarRangeIcon}
          title={t("emptyTitle")}
          description={t("emptyBody")}
        />
      ) : (
        <TableFrame>
          <Table aria-label={t("title")}>
            <TableHeader>
              <TableRow>
                <TableHead>{t("period")}</TableHead>
                <TableHead className="max-md:hidden">{t("status")}</TableHead>
                <TableHead className="text-right">
                  <span className="sr-only">{t("action")}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {periods.map((p) => {
                const status = p.correcting
                  ? "correcting"
                  : (p.runStatus ?? (p.started ? "draft" : "none"));
                const exported =
                  p.runStatus === "exported" || p.runStatus === "closed";
                const step = exported ? "files" : "upload";
                return (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium whitespace-normal">
                      {longDate(p.startsOn, locale)} –{" "}
                      {longDate(p.endsOn, locale)}
                      <div className="mt-1 md:hidden">
                        <Status tone={PERIOD_TONE[status] ?? "neutral"}>
                          {t(`runStatus.${status}`)}
                        </Status>
                      </div>
                    </TableCell>
                    <TableCell className="max-md:hidden">
                      <Status tone={PERIOD_TONE[status] ?? "neutral"}>
                        {t(`runStatus.${status}`)}
                      </Status>
                    </TableCell>
                    <TableCell className="text-right">
                      <Link
                        href={{
                          pathname: "/convert",
                          query: { period: p.id, step },
                        }}
                        className={buttonVariants({
                          size: "sm",
                          variant: exported ? "outline" : "default",
                        })}
                      >
                        {exported
                          ? t("viewFiles")
                          : p.started
                            ? t("continue")
                            : t("start")}
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableFrame>
      )}
    </Page>
  );
}
