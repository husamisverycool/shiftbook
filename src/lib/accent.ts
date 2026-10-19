/**
 * The accent colours a person may choose (decision 0046; docs/patterns/settings/account.md): Linear and
 * GitHub let each person pick their own interface colours. Graphite is the neutral look Tabulado had
 * before slice z. The CSS for each is a `[data-accent=…]` block in src/app/globals.css.
 */
export const ACCENTS = ["indigo", "blue", "teal", "graphite"] as const;
export type Accent = (typeof ACCENTS)[number];

export const DEFAULT_ACCENT: Accent = "indigo";

/** The cookie that lets a page open in the person's accent before any script runs. */
export const ACCENT_COOKIE = "granite-accent";

/** A stored or sent value as an accent, or null when it is not one. */
export function parseAccent(value: unknown): Accent | null {
  return typeof value === "string" && (ACCENTS as readonly string[]).includes(value) ? (value as Accent) : null;
}

/** The accent a page opens in: the person's cookie, else the hosting's TABULADO_ACCENT, else indigo. */
export function accentFor(cookie: string | undefined, hosting: string | undefined): Accent {
  return parseAccent(cookie) ?? parseAccent(hosting) ?? DEFAULT_ACCENT;
}
