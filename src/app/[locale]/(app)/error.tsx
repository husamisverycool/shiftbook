"use client";

// Pattern: docs/patterns/home.md — a page that failed keeps the frame and offers "Try again"
// (docs/patterns/_components/error.md: Primer Blankslate in the content's place; Next.js `retry`).
import { PageError } from "@/components/shiftbook/page-error";

export default function AppError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <PageError retry={retry} />;
}
