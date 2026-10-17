// Pattern: docs/patterns/money/payroll.md — Check's payrolls by pay period and pay date, as a Stripe
// list: the runs whose files were made, each a payroll a partner could pay.
import { setRequestLocale } from "next-intl/server";
import { MoneyFrame, MoneyNotForRole } from "@/components/shiftbook/money/frame";
import { PayrollRunsTable } from "@/components/shiftbook/money/lists";
import { withAgency } from "@/server/db";
import { payrollRuns } from "@/server/money/queries";
import { can } from "@/server/permissions";
import { currentActor } from "@/server/session";
import { agencyToday } from "@/server/settings";

export const dynamic = "force-dynamic";

export default async function MoneyPayrollPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  const actor = await currentActor();
  if (!can(actor, "money")) return <MoneyNotForRole />;
  const { rows, today } = await withAgency(actor.agencyId, async (tx) => ({ rows: await payrollRuns(tx), today: await agencyToday(tx) }));
  return (
    <MoneyFrame tab="payroll">
      <PayrollRunsTable rows={rows} today={today} />
    </MoneyFrame>
  );
}
