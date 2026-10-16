// People as initials in a circle (decision 0029; Geist avatar: 24px in rows, 32px in headers).
import type { ReactNode } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

/** "Marcus Bell" → "MB"; "Bell, Marcus" → "MB"; one word → its first letter. */
export function initialsOf(name: string): string {
  const [last, first] = name.includes(",") ? name.split(",").map((s) => s.trim()) : [null, null];
  const words = (first !== null && last !== null ? `${first} ${last}` : name).split(/\s+/).filter((w) => /\p{L}/u.test(w));
  if (words.length === 0) return "?";
  const pick = (w: string) => [...w].find((c) => /\p{L}/u.test(c))!.toLocaleUpperCase();
  return words.length === 1 ? pick(words[0]!) : `${pick(words[0]!)}${pick(words[words.length - 1]!)}`;
}

export function PersonAvatar({ name, size = "sm", className }: { name: string; size?: "sm" | "default" | "lg"; className?: string }) {
  return (
    <Avatar size={size} className={className} aria-hidden>
      <AvatarFallback className="bg-muted font-medium text-foreground/70">{initialsOf(name)}</AvatarFallback>
    </Avatar>
  );
}

/** A name with its initials before it (Geist entity). */
export function Person({ name, className, children }: { name: string; className?: string; children?: ReactNode }) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-2", className)}>
      <PersonAvatar name={name} />
      <span className="min-w-0 truncate">{children ?? name}</span>
    </span>
  );
}
