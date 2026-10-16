import type { SettingProblem } from "@/exports/targets";

/** The problem for a field, if any (exact field, or its children when `prefix` is set). */
export function problemFor(problems: SettingProblem[], field: string): SettingProblem | undefined {
  return problems.find((p) => p.field === field);
}

/** "1.5" → {num: 15, den: 10}; anything else → null. */
export function parseFactor(text: string): { num: number; den: number } | null {
  const m = /^(\d{1,3})(?:\.(\d{1,4}))?$/.exec(text.trim());
  if (!m) return null;
  const decimals = m[2] ?? "";
  const den = 10 ** decimals.length;
  const num = Number(m[1]) * den + Number(decimals || "0");
  return num > 0 ? { num, den } : null;
}
