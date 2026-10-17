// Pattern: docs/patterns/home.md — Loading: the page's outline in the dashboard shape
// (docs/patterns/_components/loading.md, Polaris SkeletonPage).
import { getTranslations } from "next-intl/server";
import { PageSkeleton } from "@/components/shiftbook/page-states";

export default async function Loading() {
  const ts = await getTranslations("states");
  return (
    <PageSkeleton
      shape="dashboard"
      label={ts("loadingPage")}
    />
  );
}
