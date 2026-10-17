"use client";

// Light, dark or the device's own (decision 0046; docs/patterns/_components/color.md): Geist, GitHub and
// Linear offer exactly System, Light and Dark. next-themes keeps the choice in the browser so a page
// opens in it before any script runs; a signed-in person's saved choice (users.appearance) is applied
// once the app frame loads.
import { ThemeProvider, useTheme } from "next-themes";
import { useEffect, type ReactNode } from "react";

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
  useEffect(() => {
    setTheme(appearance);
  }, [appearance, setTheme]);
  return null;
}
