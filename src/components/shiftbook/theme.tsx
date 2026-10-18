"use client";

// Light, dark or the device's own (decision 0046; docs/patterns/_components/color.md): Geist, GitHub and
// Linear offer exactly System, Light and Dark. next-themes keeps the choice in the browser so a page
// opens in it before any script runs; a signed-in person's saved choice (users.appearance) is applied
// once the app frame loads.
import { ThemeProvider, useTheme } from "next-themes";
import { useEffect, useRef, type ReactNode } from "react";
import { ACCENT_COOKIE, type Accent } from "@/lib/accent";

export type Appearance = "system" | "light" | "dark";

export function Themes({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange storageKey="granite-appearance">
      {children}
    </ThemeProvider>
  );
}

/** The person's saved appearance, applied when this browser holds another one. */
export function ApplyAppearance({ appearance }: { appearance: Appearance }) {
  const { setTheme } = useTheme();
  // Applied when the saved choice arrives or changes — not again when the theme itself changes (that
  // re-applied the old choice the moment the person picked a new one in Settings).
  const applied = useRef<Appearance | null>(null);
  useEffect(() => {
    if (applied.current === appearance) return;
    applied.current = appearance;
    setTheme(appearance);
  }, [appearance, setTheme]);
  return null;
}

/** Decision 0046: the person's accent, written to <html> and the cookie when this browser holds another. */
export function ApplyAccent({ accent }: { accent: Accent }) {
  useEffect(() => {
    applyAccent(accent);
  }, [accent]);
  return null;
}

/** Shows an accent at once (the Account page's live preview) and keeps it for the next page load. */
export function applyAccent(accent: Accent) {
  if (document.documentElement.dataset.accent !== accent) document.documentElement.dataset.accent = accent;
  document.cookie = `${ACCENT_COOKIE}=${accent}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
}
