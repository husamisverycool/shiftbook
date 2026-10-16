"use client";

/** How the roster's screens say what went wrong: a field's rule under it, anything else in a toast. */
import { useTranslations } from "next-intl";
import { toast } from "sonner";

const TOASTED = ["not_allowed", "not_found", "generic", "busy", "ended", "active", "none", "reason_required", "confirm", "too_many"] as const;

/** A refusal that belongs to no field, said in the person's language. */
export function useWorkerFailure() {
  const t = useTranslations("workers.errors");
  return (r: { ok: boolean; error?: string }) => {
    if (r.ok) return;
    toast.error((TOASTED as readonly string[]).includes(r.error ?? "") ? t(r.error as (typeof TOASTED)[number]) : t("generic"));
  };
}

export function FieldError({ id, text }: { id: string; text: string }) {
  return (
    <p id={id} className="text-sm text-destructive" data-testid="field-error">
      {text}
    </p>
  );
}
