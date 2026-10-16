"use client";

// Pattern: docs/patterns/sign-in.md — "Continue with a passkey" (decision 0032 fills it in).
import type { ReactNode } from "react";

/** The passkey tile on the sign-in page: asks the browser for a passkey and signs in with it. */
export function PasskeySignIn({ next, className, children }: { next: string | null; className?: string; children: ReactNode }) {
  void next;
  return (
    <button type="button" className={className} disabled data-testid="sign-in-passkey">
      {children}
    </button>
  );
}
