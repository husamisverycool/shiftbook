// Pattern: docs/patterns/settings/names.md — Linear's label settings list in its settings layout: the
// agency's nickname map, which written given names stand for which formal ones (SPEC §6).
import { setRequestLocale } from "next-intl/server";
import { NamesSettings } from "@/components/shiftbook/settings/names";
import { withAgency } from "@/server/db";
import { listNicknames } from "@/server/intake/nicknames";
import { currentActor } from "@/server/session";

export const dynamic = "force-dynamic";

export default async function NamesSettingsPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  const actor = await currentActor();
  const nicknames = await withAgency(actor.agencyId, listNicknames);
  return <NamesSettings nicknames={nicknames} />;
}
