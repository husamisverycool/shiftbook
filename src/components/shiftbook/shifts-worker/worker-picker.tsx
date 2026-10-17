"use client";

// Pattern: docs/patterns/shifts-preview.md §1 — demo only: which demo worker is looking.
import { useTranslations } from "next-intl";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { usePathname, useRouter } from "@/i18n/navigation";

export function WorkerPicker({ workers, chosen }: { workers: { id: string; name: string }[]; chosen: string | null }) {
  const t = useTranslations("shiftsWorker");
  const router = useRouter();
  const pathname = usePathname();
  return (
    <NativeSelect aria-label={t("viewingAs")} className="w-56" value={chosen ?? ""} onChange={(e) => router.push(`${pathname}?worker=${e.target.value}`)} data-testid="worker-picker">
      {workers.map((w) => (
        <NativeSelectOption key={w.id} value={w.id}>
          {w.name}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  );
}
