// Pattern: docs/patterns/compliance/[id].md — Loading: the page's outline in the record shape
// (docs/patterns/_components/loading.md, Polaris SkeletonPage).
import { getTranslations } from "next-intl/server";
import { PageSkeleton } from "@/components/shiftbook/page-states";

export default async function Loading() {
  const ts = await getTranslations("states");
  return (
    <PageSkeleton
      shape="record"
      label={ts("loadingPage")}
    />
  );
}
