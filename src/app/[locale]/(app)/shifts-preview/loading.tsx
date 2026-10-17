// Pattern: docs/patterns/shifts-preview.md — Loading: the page's outline (docs/patterns/_components/loading.md).
import { getTranslations } from "next-intl/server";
import { PageSkeleton } from "@/components/shiftbook/page-states";

export default async function Loading() {
  const [t, ts] = await Promise.all([getTranslations("shiftsWorker"), getTranslations("states")]);
  return <PageSkeleton shape="settings" title={t("title")} label={ts("loadingPage")} />;
}
