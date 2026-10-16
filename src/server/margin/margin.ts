/**
 * Margin rows and groups (SPEC §15; slice i, decisions I4 and I5). A row is one assignment's week:
 * hours paid, billed, pay, estimated burden and gross margin = billed − pay − burden. Margin % is of
 * what was billed, in tenths of a percent, rounded half up once; none when nothing was billed.
 */
import { addDays, exactDecimal, roundHalfUp } from "@shiftbook/rules";

export type GroupBy = "client" | "worker" | "recruiter" | "branch" | "week";
export type SortBy = "margin" | "percent";
export const GROUP_BYS: readonly GroupBy[] = ["client", "worker", "recruiter", "branch", "week"];

export interface MarginDetail {
  kind: "pay" | "bill";
  type: string;
  minutes: number;
  amountCents: number;
  burdenCents: number;
  explain: string;
  burdenExplain: string | null;
}

export interface MarginLine {
  key: string;
  assignmentId: string | null;
  workerId: string;
  workerName: string;
  clientId: string | null;
  clientName: string | null;
  week: string;
  recruiterId: string | null;
  recruiterName: string | null;
  branchId: string | null;
  branchName: string | null;
  minutesPaid: number;
  billedCents: number;
  payCents: number;
  burdenCents: number;
  incomplete: boolean;
  details: MarginDetail[];
}

export interface MarginTotals {
  minutesPaid: number;
  billedCents: number;
  payCents: number;
  burdenCents: number;
  marginCents: number;
  /** Margin % in tenths (173 = 17.3%); null when nothing was billed. */
  marginPermille: number | null;
  /** Rows whose burden lacks a rate. */
  incomplete: number;
}

export const marginPermille = (marginCents: number, billedCents: number): number | null => (billedCents > 0 ? roundHalfUp(marginCents * 1000, billedCents) : null);

export const formatPermille = (p: number) => {
  const [whole, frac = "0"] = exactDecimal(p, 10).split(".");
  return `${whole}.${frac}%`;
};

export function totalsOf(lines: MarginLine[]): MarginTotals {
  const sum = (f: (l: MarginLine) => number) => lines.reduce((s, l) => s + f(l), 0);
  const billedCents = sum((l) => l.billedCents);
  const payCents = sum((l) => l.payCents);
  const burdenCents = sum((l) => l.burdenCents);
  const marginCents = billedCents - payCents - burdenCents;
  return { minutesPaid: sum((l) => l.minutesPaid), billedCents, payCents, burdenCents, marginCents, marginPermille: marginPermille(marginCents, billedCents), incomplete: lines.filter((l) => l.incomplete).length };
}

const KEY: Record<GroupBy, (l: MarginLine) => [string | null, string | null]> = {
  client: (l) => [l.clientId, l.clientName],
  worker: (l) => [l.workerId, l.workerName],
  recruiter: (l) => [l.recruiterId, l.recruiterName],
  branch: (l) => [l.branchId, l.branchName],
  week: (l) => [l.week, l.week],
};

export interface MarginGroup {
  key: string;
  /** null: no recruiter, branch or client ("None"). */
  name: string | null;
  totals: MarginTotals;
  lines: MarginLine[];
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export function groupLines(lines: MarginLine[], by: GroupBy, sort: SortBy): MarginGroup[] {
  const groups = new Map<string, { name: string | null; lines: MarginLine[] }>();
  for (const l of lines) {
    const [id, name] = KEY[by](l);
    const key = id ?? "none";
    const g = groups.get(key) ?? { name: id === null ? null : name, lines: [] };
    g.lines.push(l);
    groups.set(key, g);
  }
  const out = [...groups.entries()].map(([key, g]) => ({ key, name: g.name, totals: totalsOf(g.lines), lines: g.lines.sort((a, b) => cmp(b.week, a.week) || cmp(a.workerName, b.workerName)) }));
  const value = (g: MarginGroup) => (sort === "margin" ? g.totals.marginCents : (g.totals.marginPermille ?? Number.MIN_SAFE_INTEGER));
  return out.sort((a, b) => value(b) - value(a) || cmp(a.name ?? "", b.name ?? ""));
}

/** Week starts from `from` to `to` (both week starts), oldest first. */
export function weeksBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 7)) out.push(d);
  return out;
}
