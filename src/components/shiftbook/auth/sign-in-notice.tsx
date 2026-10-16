"use client";

// Pattern: docs/patterns/sign-in/code.md — after signing in with a recovery code, the next page says how
// many are left (with the way to make new ones), once.
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { toast } from "sonner";
import { usePathname, useRouter } from "@/i18n/navigation";

export function SignInNotice() {
  const t = useTranslations("signInNotice");
  const search = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const left = search.get("recoveryLeft");
  useEffect(() => {
    if (left === null || !/^\d+$/.test(left)) return;
    toast.warning(t("recoveryLeft", { count: Number(left) }), { duration: 15_000, action: { label: t("openAccount"), onClick: () => router.push("/settings/account") } });
    const rest = new URLSearchParams(search);
    rest.delete("recoveryLeft");
    const query = rest.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  }, [left, pathname, router, search, t]);
  return null;
}
