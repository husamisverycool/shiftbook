// Pattern: docs/patterns/_layouts/auth.md — GitHub's sign-in pages: one narrow column, one task per page,
// before the app; the product's name and the language switch above.
import { setRequestLocale } from "next-intl/server";
import { Suspense, type ReactNode } from "react";
import { AuthHeader } from "@/components/shiftbook/auth/auth-header";

export default async function AuthLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <div className="flex min-h-svh flex-col">
      <Suspense>
        <AuthHeader />
      </Suspense>
      <main className="mx-auto flex w-full max-w-sm min-w-0 flex-1 flex-col gap-6 px-4 py-10">{children}</main>
    </div>
  );
}
