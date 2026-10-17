// Pattern: docs/patterns/receivables.md — Loading: the page's outline in the dashboard shape
// (docs/patterns/_components/loading.md, Polaris SkeletonPage).
import { getTranslations } from "next-intl/server";
import { PageSkeleton } from "@/components/shiftbook/page-states";

export default async function Loading() {
  const [t, ts] = await Promise.all([getTranslations("nav"), getTranslations("states")]);
  return (
    <PageSkeleton
      shape="dashboard"
      title={t("receivables")}
      tabs={2}
      label={ts("loadingPage")}
    />
  );
}
