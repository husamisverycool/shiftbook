// Landing from docs/patterns/convert.md (Gusto payroll list): heading, then pay periods with status
// and the row's action at the row's end.
import { getLocale, getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
import { longDate } from "../format";

export interface LandingPeriod {
  id: string;
  startsOn: string;
  endsOn: string;
  runStatus: string | null;
  started: boolean;
}

export async function Landing({ periods }: { periods: LandingPeriod[] }) {
  const t = await getTranslations("landing");
  const locale = await getLocale();
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </div>
      <div className="rounded-lg border">
        <Table aria-label={t("title")}>
          <TableHeader>
            <TableRow>
              <TableHead>{t("period")}</TableHead>
              <TableHead>{t("status")}</TableHead>
              <TableHead className="text-right">
                <span className="sr-only">{t("action")}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {periods.map((p) => {
              const status = p.runStatus ?? (p.started ? "draft" : "none");
              const exported = p.runStatus === "exported" || p.runStatus === "closed";
              const step = exported ? "files" : "upload";
              return (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">
                    {longDate(p.startsOn, locale)} – {longDate(p.endsOn, locale)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={status === "blocked" ? "destructive" : status === "none" ? "outline" : "secondary"}>{t(`runStatus.${status}`)}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Link href={{ pathname: "/convert", query: { period: p.id, step } }} className={buttonVariants({ size: "sm", variant: exported ? "outline" : "default" })}>
                      {exported ? t("viewFiles") : p.started ? t("continue") : t("start")}
                    </Link>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
