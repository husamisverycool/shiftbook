"use client";

// Pattern: docs/patterns/_layouts/auth.md — the product's name, and the language switch (the same page in
// the other language; a sign-in link and its query keep working).
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Link, usePathname } from "@/i18n/navigation";

export function AuthHeader() {
  const t = useTranslations("authFrame");
  const locale = useLocale();
  const pathname = usePathname();
  const search = useSearchParams();
  const query = Object.fromEntries(search.entries());
  return (
    <header className="border-b">
      <div className="mx-auto flex w-full max-w-5xl min-w-0 items-center gap-4 px-4 py-3">
        <p className="mr-auto font-semibold">{t("product")}</p>
        <nav aria-label={t("language")} className="flex items-center gap-3 text-sm">
          {(["en", "es"] as const).map((l) => (
            <Link
              key={l}
              href={{ pathname, query }}
              locale={l}
              lang={l}
              aria-current={l === locale ? "true" : undefined}
              className={l === locale ? "font-medium" : "text-muted-foreground underline-offset-4 hover:underline"}
            >
              {t(l === "en" ? "english" : "spanish")}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
