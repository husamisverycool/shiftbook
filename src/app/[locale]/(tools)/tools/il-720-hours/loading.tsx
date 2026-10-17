// Pattern: docs/patterns/tools/il-720-hours.md — Loading: the page's outline (docs/patterns/_components/loading.md).
import { getTranslations } from "next-intl/server";
import { PageSkeleton } from "@/components/shiftbook/page-states";

export default async function Loading() {
  const ts = await getTranslations("states");
  return <PageSkeleton shape="settings" label={ts("loadingPage")} />;
}
