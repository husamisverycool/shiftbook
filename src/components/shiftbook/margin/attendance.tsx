"use client";

// Pattern: docs/patterns/margin/attendance.md — Deputy Attendance & absence report (figures with count
// and %, per-site table, problem shifts only), Instawork fill rate (filled of requested).
import { useLocale, useTranslations } from "next-intl";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { AttendanceView } from "@/server/schedule/queries";
import { shortDate } from "../format";
import { KeyFigure, KeyFigures } from "../key-figures";

/** Whole basis points as a percent with one decimal, in the reader's locale. */
const percent = (bp: number, locale: string) => new Intl.NumberFormat(locale.startsWith("es") ? "es-US" : locale, { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(bp / 10_000);

export function MarginAttendance({ view }: { view: AttendanceView }) {
  const t = useTranslations("attendance");
  const locale = useLocale();
  const v = view.totals;
  return (
    <div className="flex flex-col gap-10" data-testid="attendance">
      <p className="text-sm text-muted-foreground">{t("range", { from: shortDate(view.from, locale), to: shortDate(view.to, locale) })}</p>
      <KeyFigures>
        <KeyFigure label={t("figures.scheduled")} value={<span className="tabular-nums">{v.scheduled}</span>} testId="attendance-scheduled" />
        <KeyFigure label={t("figures.fill")} value={percent(v.fillBp, locale)} note={t("figures.fillNote", { filled: v.filled, requested: v.requested })} testId="attendance-fill" />
        <KeyFigure label={t("figures.noShows")} value={<span className="tabular-nums">{v.noShows}</span>} note={t("figures.rateNote", { count: v.noShows, rate: percent(v.noShowBp, locale) })} testId="attendance-no-shows" />
        <KeyFigure label={t("figures.late")} value={<span className="tabular-nums">{v.late}</span>} note={t("figures.lateNote", { minutes: view.toleranceMinutes })} testId="attendance-late" />
      </KeyFigures>
      {view.byClient.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="attendance-nothing">
          {t("nothing")}
        </p>
      ) : (
        <>
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">{t("byClient")}</h2>
            <Table data-testid="attendance-clients">
              <TableHeader>
                <TableRow>
                  <TableHead>{t("columns.client")}</TableHead>
                  <TableHead className="text-right">{t("columns.requested")}</TableHead>
                  <TableHead className="text-right">{t("columns.filled")}</TableHead>
                  <TableHead className="text-right">{t("columns.fillRate")}</TableHead>
                  <TableHead className="text-right">{t("columns.scheduled")}</TableHead>
                  <TableHead className="text-right">{t("columns.noShows")}</TableHead>
                  <TableHead className="text-right">{t("columns.noShowRate")}</TableHead>
                  <TableHead className="text-right">{t("columns.late")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {view.byClient.map((r) => (
                  <TableRow key={r.clientId}>
                    <TableCell className="font-medium">{r.clientName}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.requested}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.filled}</TableCell>
                    <TableCell className="text-right tabular-nums">{percent(r.fillBp, locale)}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.scheduled}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.noShows}</TableCell>
                    <TableCell className="text-right tabular-nums">{percent(r.noShowBp, locale)}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.late}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </section>
          {view.problems.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="text-lg font-semibold">{t("problems")}</h2>
              <Table data-testid="attendance-problems">
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("problemColumns.date")}</TableHead>
                    <TableHead>{t("problemColumns.client")}</TableHead>
                    <TableHead>{t("problemColumns.worker")}</TableHead>
                    <TableHead>{t("problemColumns.jobOrder")}</TableHead>
                    <TableHead>{t("problemColumns.issue")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {view.problems.map((p) => (
                    <TableRow key={p.shiftId}>
                      <TableCell className="tabular-nums">{shortDate(p.workDate, locale)}</TableCell>
                      <TableCell>{p.clientName}</TableCell>
                      <TableCell>{p.workerName ?? "—"}</TableCell>
                      <TableCell>{p.position}</TableCell>
                      <TableCell>{p.issue === "late" ? t("issues.late", { minutes: p.lateBy ?? 0 }) : t(`issues.${p.issue}`)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </section>
          )}
        </>
      )}
    </div>
  );
}
