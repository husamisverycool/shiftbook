// Pattern: docs/patterns/convert.md — States: loading panel while a step loads (Gusto loading panel).
import { getTranslations } from "next-intl/server";
import { LoadingPanel } from "@/components/shiftbook/convert/frame";

export default async function Loading() {
  const t = await getTranslations("common");
  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <LoadingPanel title={t("loading")} body="" />
    </div>
  );
}
