// People as initials in a circle (decision 0029; Geist avatar: 24px in rows, 32px in headers), each in
// its own colour (decision 0046).
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Avatar } from "./avatar";

/** The name without a note in brackets after it: "Lena Ortiz (demo)" → "Lena Ortiz". */
export const withoutNote = (name: string): string => name.replace(/\s*\([^()]*\)\s*$/, "").trim() || name;

/** "Marcus Bell" → "MB"; "Bell, Marcus" → "MB"; one word → its first letter; a bracketed note after the name is left out. */
export function initialsOf(full: string): string {
  const name = withoutNote(full);
  const [last, first] = name.includes(",") ? name.split(",").map((s) => s.trim()) : [null, null];
  const words = (first !== null && last !== null ? `${first} ${last}` : name).split(/\s+/).filter((w) => /\p{L}/u.test(w));
  if (words.length === 0) return "?";
  const pick = (w: string) => [...w].find((c) => /\p{L}/u.test(c))!.toLocaleUpperCase();
  return words.length === 1 ? pick(words[0]!) : `${pick(words[0]!)}${pick(words[words.length - 1]!)}`;
}

/** A person's initials in their own colour (decision 0046; `_components/avatar.md`): 24, 32 or 40px. */
export function PersonAvatar({ name, id, size = "sm", className }: { name: string; id?: string; size?: "sm" | "default" | "lg"; className?: string }) {
  return <Avatar name={name} id={id} kind="person" size={size === "sm" ? 24 : size === "default" ? 32 : 40} className={className} />;
}

/** A name with its initials before it (Geist entity). */
export function Person({ name, id, className, children }: { name: string; id?: string; className?: string; children?: ReactNode }) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-2", className)}>
      <PersonAvatar name={name} id={id} />
      <span className="min-w-0 truncate">{children ?? name}</span>
    </span>
  );
}
