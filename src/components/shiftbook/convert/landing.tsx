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

export async function Landing({ periods }: { periods: LandingPeriod[] }) {
  const t = await getTranslations("landing");
  const locale = await getLocale();
  return (
    <Page>
      <PageHeader title={t("title")} />
      {periods.length === 0 ? (
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
