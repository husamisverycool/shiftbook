// Avatars and colour dots (decision 0046; docs/patterns/_components/avatar.md): Primer's circle for a
// person and square for an organisation, Geist's one or two uppercase initials, Polaris's rule that the
// same record always gets the same colour — a stable hash of its id into Tailwind tint pairs that never
// use a status hue (Atlassian: no accent where colour has meaning). Each pair ≥ 6.4:1 in both themes.
import { cn } from "@/lib/utils";
import { initialsOf } from "./person";

/** Light `{hue}-100` with `{hue}-800`, dark `{hue}-900` with `{hue}-200` (research §13). */
const TINTS = [
  "bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200",
  "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
  "bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-200",
  "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  "bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-900 dark:text-fuchsia-200",
  "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200",
  "bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200",
  "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
  "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200",
  "bg-lime-100 text-lime-800 dark:bg-lime-900 dark:text-lime-200",
  "bg-stone-200 text-stone-800 dark:bg-stone-700 dark:text-stone-100",
] as const;

/** The same hue for a dot: a middle shade, visible on white and on the dark page. */
const DOTS = ["bg-sky-500", "bg-blue-500", "bg-indigo-500", "bg-violet-500", "bg-purple-500", "bg-fuchsia-500", "bg-pink-500", "bg-rose-500", "bg-cyan-500", "bg-teal-500", "bg-lime-500", "bg-stone-500"] as const;

/** A stable index for an id (FNV-1a): the same record, the same colour, on every page. */
export function hueIndex(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i += 1) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % TINTS.length;
}

const SIZES = { 20: "size-5 text-[9px]", 24: "size-6 text-[10px]", 32: "size-8 text-xs", 40: "size-10 text-sm" } as const;

/**
 * `kind`: a person (circle) or an organisation (rounded square). `id`: what the colour is taken from
 * (the record's id, so two people of the same name differ). The name always sits beside it, so the
 * avatar is hidden from screen readers.
 */
export function Avatar({ name, id, kind = "person", size = 24, className }: { name: string; id?: string; kind?: "person" | "organization"; size?: keyof typeof SIZES; className?: string }) {
  return (
    <span
      aria-hidden
      data-slot="avatar"
      className={cn("inline-flex shrink-0 items-center justify-center font-semibold select-none", kind === "person" ? "rounded-full" : "rounded-[25%]", SIZES[size], TINTS[hueIndex(id ?? name)], className)}
    >
      {initialsOf(name)}
    </span>
  );
}

/** A client's colour before its name (Linear and Attio mark a category with a small dot). */
export function ColorDot({ id, className }: { id: string; className?: string }) {
  return <span aria-hidden data-slot="color-dot" className={cn("inline-block size-2 shrink-0 rounded-full", DOTS[hueIndex(id)], className)} />;
}
