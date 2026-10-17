"use client";

// Pattern: docs/patterns/_layouts/auth.md (decision 0031) — the language choice at the foot of the page,
// as Notion sets it under its sign-in; the same page in the other language (a sign-in link and its
// query keep working).
import { GlobeIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { Link, usePathname } from "@/i18n/navigation";

export function AuthLanguage() {
  const t = useTranslations("authFrame");
  const locale = useLocale();
  const pathname = usePathname();
  const search = useSearchParams();
  const query = Object.fromEntries(search.entries());
  return (
    <nav aria-label={t("language")} className="flex items-center justify-center gap-3 text-sm text-muted-foreground">
      <GlobeIcon className="size-4" aria-hidden />
      {(["en", "es"] as const).map((l) => (
        <Link
          key={l}
          href={{ pathname, query }}
          locale={l}
          lang={l}
          aria-current={l === locale ? "true" : undefined}
          className={cn("rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50", l === locale ? "font-medium text-foreground" : "underline-offset-4 transition-colors hover:text-foreground hover:underline")}
        >
          {t(l === "en" ? "english" : "spanish")}
        </Link>
      ))}
    </nav>
  );
}
