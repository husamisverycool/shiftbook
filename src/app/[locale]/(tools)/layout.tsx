// Pattern: docs/patterns/_layouts/tools.md — Gusto's and Rippling's free calculator pages: the mark at
// the top left, one way into the product at the right, one reading column, the language at the foot.
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense, type ReactNode } from "react";
import { AuthLanguage } from "@/components/shiftbook/auth/auth-header";
import { BrandMark } from "@/components/shiftbook/brand-mark";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

export default async function ToolsLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("hoursChecker.header");
  return (
    <div className="flex min-h-[calc(100svh-var(--banner-height,0px))] flex-col bg-background">
      <header className="border-b">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-4 px-4 md:px-8">
          <Link href="/tools/il-720-hours" className="rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50" aria-label={t("home")}>
            <BrandMark />
          </Link>
          <nav className="ml-auto flex items-center gap-4 text-sm">
            <Link href="/sign-in" className="rounded-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50">
              {t("signIn")}
            </Link>
            <Link href="/sign-in" className={buttonVariants({ size: "sm" })} data-testid="tools-demo">
              {t("demo")}
            </Link>
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="px-4 pb-8">
        <Suspense>
          <AuthLanguage />
        </Suspense>
      </footer>
    </div>
  );
}
