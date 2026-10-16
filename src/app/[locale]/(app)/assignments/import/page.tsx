// Pattern: docs/patterns/assignments/import.md — Attio CSV import steps (upload → map columns →
// review values → preview → run) with Linear's source choice first, and the import history.
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { ImportWizard } from "@/components/shiftbook/catalog/import-wizard";
import { catalogOptions } from "@/server/catalog/queries";
import { withAgency } from "@/server/db";
import { importView, listImports } from "@/server/placements/service";
import { currentActor } from "@/server/session";
import { documentStore } from "@/server/storage";

export const dynamic = "force-dynamic";

export default async function ImportPage(props: { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  const sp = await props.searchParams;
  const actor = await currentActor();
  const id = typeof sp.id === "string" && /^[0-9a-f-]{36}$/i.test(sp.id) ? sp.id : null;
  const { view, history, options } = await withAgency(actor.agencyId, async (tx) => ({
    view: id ? await importView(tx, documentStore, id) : null,
    history: await listImports(tx),
    options: await catalogOptions(tx),
  }));
  if (id && !view) notFound();
  const step = typeof sp.step === "string" ? sp.step : null;
  return <ImportWizard view={view} history={history} options={options} step={step} />;
}
