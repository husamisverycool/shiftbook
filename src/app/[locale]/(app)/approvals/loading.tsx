// Pattern: docs/patterns/approvals.md — Loading: the page's outline in the list shape
// (docs/patterns/_components/loading.md, Polaris SkeletonPage).
import { getTranslations } from "next-intl/server";
import { PageSkeleton } from "@/components/shiftbook/page-states";

export default async function Loading() {
  const [t, ts] = await Promise.all([getTranslations("nav"), getTranslations("states")]);
  return (
    <PageSkeleton
      shape="list"
      title={t("approvals")}
      label={ts("loadingPage")}
    />
  );
}
