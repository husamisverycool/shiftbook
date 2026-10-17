"use client";

/**
 * What the signed-in person's role may change (decision 0026), for the screens: they hide the buttons,
 * menus and fields of what it may not. The server checks again on every action.
 */
import { useTranslations } from "next-intl";
import { createContext, useContext, type ReactNode } from "react";
import type { Ability } from "@/server/permissions";

const Abilities = createContext<Record<Ability, boolean> | null>(null);
/** Whether the agency's changes are paused because its subscription is not active (decision 0036). */
const Paused = createContext(false);

export function AbilitiesProvider({ abilities, paused = false, children }: { abilities: Record<Ability, boolean>; paused?: boolean; children: ReactNode }) {
  return (
    <Abilities.Provider value={abilities}>
      <Paused.Provider value={paused}>{children}</Paused.Provider>
    </Abilities.Provider>
  );
}

/**
 * A page's "only these roles change this" line, or — while the agency's changes are paused (decision
 * 0036) — why nothing can be changed, pointing to Billing (the role line would be wrong for the Owner).
 */
export function ReadOnlyNote({ text }: { text: string }) {
  const paused = useContext(Paused);
  const t = useTranslations("billingBanner");
  return <>{paused ? t("pausedNote") : text}</>;
}

/** `can("hours")`: whether this person may change that. Outside the app frame, nothing. */
export function useCan(): (ability: Ability) => boolean {
  const abilities = useContext(Abilities);
  return (ability) => abilities?.[ability] ?? false;
}
