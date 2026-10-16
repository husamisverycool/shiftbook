/** Reading the margin pages' address (docs/patterns/margin.md: period, grouping and sort live in the address). */
import { GROUP_BYS, type GroupBy, type SortBy } from "./margin";

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v.slice(0, 20) : undefined);

export function marginAsk(sp: Params) {
  const groupBy: GroupBy = GROUP_BYS.find((g) => g === sp.group) ?? "client";
  const sort: SortBy = sp.sort === "percent" ? "percent" : "margin";
  return { period: { weeks: one(sp.weeks), from: one(sp.from), to: one(sp.to) }, groupBy, sort };
}
