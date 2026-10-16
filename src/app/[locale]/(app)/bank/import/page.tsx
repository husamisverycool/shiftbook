// Pattern: docs/patterns/bank/import.md — QuickBooks Online Upload from file; Zoho Books Import
// Statement.
import { setRequestLocale } from "next-intl/server";
import { BankImport } from "@/components/shiftbook/receivables/bank-import";
import { redirect } from "@/i18n/navigation";
import { mayCollect } from "@/server/receivables/service";
import { currentActor, isDemo } from "@/server/session";

export const dynamic = "force-dynamic";

export default async function BankImportPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  const actor = currentActor();
  // Only those who may record payments bring the bank's lines in; the others see the Bank page.
  if (!mayCollect(actor)) redirect({ href: "/bank", locale });
  return <BankImport demo={isDemo()} />;
}
