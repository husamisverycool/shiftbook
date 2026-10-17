// Pattern: docs/patterns/portal/[token]/documents.md — Loading: the section's outline in the list shape
// (docs/patterns/_components/loading.md, Polaris SkeletonPage).
import { getTranslations } from "next-intl/server";
import { PageSkeleton } from "@/components/shiftbook/page-states";

export default async function Loading() {
  const ts = await getTranslations("states");
  return <PageSkeleton shape="list" label={ts("loadingPage")} />;
}
