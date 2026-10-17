// Pattern: docs/patterns/money/wage-access.md — the CFPB's "covered EWA" conditions as the screen's
// content: each worker's earned, unpaid pay and what may be requested; requests recorded, nothing paid.
import { setRequestLocale } from "next-intl/server";
import { MoneyFrame } from "@/components/shiftbook/money/frame";
import { WageAccessView } from "@/components/shiftbook/money/wage-access";
import { withAgency } from "@/server/db";
import { wageAccessView } from "@/server/money/queries";
import { currentActor } from "@/server/session";

export const dynamic = "force-dynamic";

export default async function WageAccessPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  const actor = await currentActor();
  const view = await withAgency(actor.agencyId, (tx) => wageAccessView(tx));
  return (
    <MoneyFrame tab="wageAccess">
      <WageAccessView rules={view.rules} rows={view.rows} />
    </MoneyFrame>
  );
}
