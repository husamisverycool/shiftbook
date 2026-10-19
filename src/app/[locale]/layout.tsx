// Pattern: docs/patterns/_layouts/root.md — demo banner (Stripe sandbox banner) above every page.
import { GeistSans } from "geist/font/sans";
import type { Metadata } from "next";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";
import { DemoBanner } from "@/components/shiftbook/demo-banner";
import { Themes } from "@/components/shiftbook/theme";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { routing } from "@/i18n/routing";
import { ACCENT_COOKIE, accentFor } from "@/lib/accent";
import { isDemo } from "@/server/session";
import "../globals.css";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  return { title: t("title") };
}

export default async function LocaleLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  // The person's accent (decision 0046), from their cookie so the page opens in it; else the hosting's
  // TABULADO_ACCENT; else indigo. The theme class is set by next-themes before paint, hence the
  // hydration warning suppressed on <html> only.
  const accent = accentFor((await cookies()).get(ACCENT_COOKIE)?.value, process.env.TABULADO_ACCENT);
  return (
    <html lang={locale} className={GeistSans.className} data-accent={accent} suppressHydrationWarning>
      {/* The banner's height, so the sidebar fits the screen under it (decision 0029). */}
      <body className="min-h-svh bg-background text-foreground antialiased" style={isDemo() ? ({ "--banner-height": "2.5rem" } as CSSProperties) : undefined}>
        <Themes>
          <NextIntlClientProvider>
            <TooltipProvider>
              {isDemo() && <DemoBanner />}
              {children}
              <Toaster />
            </TooltipProvider>
          </NextIntlClientProvider>
        </Themes>
      </body>
    </html>
  );
}
