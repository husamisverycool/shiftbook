"use client";

/**
 * What the signed-in person's role may change (decision 0026), for the screens: they hide the buttons,
 * menus and fields of what it may not. The server checks again on every action.
 */
import { createContext, useContext, type ReactNode } from "react";
import type { Ability } from "@/server/permissions";

const Abilities = createContext<Record<Ability, boolean> | null>(null);

export function AbilitiesProvider({ abilities, children }: { abilities: Record<Ability, boolean>; children: ReactNode }) {
  return <Abilities.Provider value={abilities}>{children}</Abilities.Provider>;
}

/** `can("hours")`: whether this person may change that. Outside the app frame, nothing. */
export function useCan(): (ability: Ability) => boolean {
  const abilities = useContext(Abilities);
  return (ability) => abilities?.[ability] ?? false;
}
