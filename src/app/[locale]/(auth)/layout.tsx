// Pattern: docs/patterns/_layouts/auth.md (decision 0031) — Linear's and Vercel's sign-in: one narrow
// column on the light page tone, the product's mark at its top; the language choice at the foot
// (Notion). One task per page, before the app (GitHub).
import { setRequestLocale } from "next-intl/server";
import { Suspense, type ReactNode } from "react";
import { AuthLanguage } from "@/components/shiftbook/auth/auth-header";
import { BrandMark } from "@/components/shiftbook/brand-mark";

export default async function AuthLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <div className="flex min-h-[calc(100svh-var(--banner-height,0px))] flex-col bg-sidebar">
      <main className="mx-auto flex w-full max-w-[22rem] min-w-0 flex-1 flex-col gap-6 px-4 pt-[min(14vh,7rem)] pb-12">
        <div className="flex justify-center">
          <BrandMark size="lg" />
        </div>
        {children}
      </main>
      <footer className="px-4 pb-8">
        <Suspense>
          <AuthLanguage />
        </Suspense>
      </footer>
    </div>
  );
}
