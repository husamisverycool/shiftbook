// Pattern: docs/patterns/settings/payroll.md — 7shifts payroll integration settings (the system
// chosen once, tabs for export codes and employee ids, a Matched/Unmatched mapping page); Deputy
// export destination fields and custom template; QuickBooks Time item mapping.
import { setRequestLocale } from "next-intl/server";
import { PayrollSettings, type PayrollTab, type WorkerFilter } from "@/components/shiftbook/settings/payroll-settings";
import { withAgency } from "@/server/db";
import { payrollSettingsView } from "@/server/payroll/queries";
import { PayWeekSection } from "@/components/shiftbook/settings/pay-week";
import { can } from "@/server/permissions";
import { agencyView } from "@/server/setup/agency";
import { currentActor } from "@/server/session";

export const dynamic = "force-dynamic";

const TABS: PayrollTab[] = ["codes", "workers", "columns"];
const FILTERS: WorkerFilter[] = ["all", "missing", "set"];

export default async function PayrollSettingsPage(props: { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  const sp = await props.searchParams;
  const actor = await currentActor();
  const view = await withAgency(actor.agencyId, (tx) => payrollSettingsView(tx, actor));
  // The pay week (completeness audit G1): its day, and whether it can still change.
  const agency = await withAgency(actor.agencyId, (tx) => agencyView(tx, actor.agencyId));
  const asked = TABS.find((t) => t === sp.tab);
  // Spreadsheet columns exist only for the spreadsheet.
  const tab = asked === "columns" && view.target?.format !== "spreadsheet_csv" ? "codes" : (asked ?? "codes");
  const filter = FILTERS.find((f) => f === sp.filter) ?? "all";
  return <PayrollSettings view={view} tab={tab} filter={filter} payWeek={<PayWeekSection day={agency.workweekStartsOn} changeable={agency.workweekChangeable} canChange={can(actor, "settings")} />} />;
}
