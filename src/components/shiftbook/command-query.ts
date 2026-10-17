/**
 * What the command menu's typed text asks for (decision 0038). GitHub's command palette prefixes, by
 * GitHub's own meanings: `>` command mode; `#` issues and pull requests → Granite's work records
 * (invoices, job orders, assignments); `@` users and organizations → workers and clients; `?` help.
 */
export type CommandMode = "all" | "actions" | "work" | "people" | "help";

const PREFIXES: Record<string, CommandMode> = { ">": "actions", "#": "work", "@": "people" };

export function parseCommandQuery(text: string): { mode: CommandMode; term: string } {
  const trimmed = text.trim();
  if (trimmed === "?") return { mode: "help", term: "" };
  const mode = PREFIXES[trimmed.charAt(0)];
  if (mode) return { mode, term: trimmed.slice(1).trim() };
  return { mode: "all", term: trimmed };
}
