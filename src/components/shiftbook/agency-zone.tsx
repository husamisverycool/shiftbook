"use client";

/**
 * The agency's time zone (its `time_zone` setting), for the screens: every moment — sent, answered,
 * last seen, changed — is shown in the agency's own time, the same on the server and in the browser,
 * and the same as the activity log.
 */
import { useLocale } from "next-intl";
import { createContext, useContext, type ReactNode } from "react";
import { dateTime } from "./format";

const Zone = createContext<string>("UTC");

export function AgencyZoneProvider({ zone, children }: { zone: string; children: ReactNode }) {
  return <Zone.Provider value={zone}>{children}</Zone.Provider>;
}

/** `when(at)` → "Oct 16, 2026, 5:41 PM" in the agency's time; `{ date: "long" }` and `{ seconds: true }` as `dateTime`. */
export function useDateTime(): (at: string | Date, opts?: Parameters<typeof dateTime>[3]) => string {
  const zone = useContext(Zone);
  const locale = useLocale();
  return (at, opts) => dateTime(at, locale, zone, opts);
}
