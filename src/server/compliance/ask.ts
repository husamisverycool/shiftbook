/** The compliance filters from the address (docs/patterns/compliance.md: kept in the address). */
import { AREAS, type Area, type ComplianceFilters } from "./queries";
import { STATUS_ORDER, type DisplayStatus } from "./status";

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export function complianceAsk(params: Record<string, string | string[] | undefined>): ComplianceFilters {
  const area = one(params.area);
  const status = one(params.status);
  const state = one(params.state);
  const owner = one(params.owner);
  return {
    area: (AREAS as readonly string[]).includes(area) ? (area as Area) : null,
    statuses: status === "all" ? [...STATUS_ORDER] : (STATUS_ORDER as readonly string[]).includes(status) ? [status as DisplayStatus] : [],
    jurisdiction: ["IL", "MA", "NJ", "US"].includes(state) ? state : null,
    owner: owner === "me" || owner === "none" ? owner : null,
    q: one(params.q).slice(0, 100),
  };
}
