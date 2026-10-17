// Pattern: docs/patterns/money/payroll/[id].md — Check's payroll preview and approval, Zeal's employee
// check; one run's payroll payload, approved by the Owner and recorded. Nothing is sent.
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { PayrollRunView } from "@/components/shiftbook/money/payroll-run";
import { withAgency } from "@/server/db";
import { handoffs, payrollHandoffView } from "@/server/money/queries";
import { currentActor } from "@/server/session";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function PayrollHandoffPage(props: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await props.params;
  setRequestLocale(locale);
  if (!UUID.test(id)) notFound();
  const actor = await currentActor();
  const found = await withAgency(actor.agencyId, async (tx) => {
    const view = await payrollHandoffView(tx, id);
    return view ? { view, handoff: (await handoffs(tx, { kind: "payroll", subjectId: id }))[0] ?? null } : null;
  });
  if (!found) notFound();
  return <PayrollRunView view={found.view} handoff={found.handoff} />;
}
