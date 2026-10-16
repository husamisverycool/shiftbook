/** The demo people the sign-in page offers to "Continue as" (decision K3): one of each role. */
import type { Role } from "../permissions";
import { DEMO_AGENCY, DEMO_OWNER, demoUuid, RECRUITERS, STAFF } from "./dataset";

export const DEMO_PEOPLE: { id: string; agencyId: string; name: string; role: Role }[] = [
  { id: DEMO_OWNER.id, agencyId: DEMO_AGENCY.id, name: DEMO_OWNER.name, role: "owner" },
  { id: demoUuid(`user:${RECRUITERS[0].key}`), agencyId: DEMO_AGENCY.id, name: RECRUITERS[0].name, role: "coordinator" },
  ...STAFF.map((p) => ({ id: demoUuid(`user:${p.key}`), agencyId: DEMO_AGENCY.id, name: p.name, role: p.role })),
];
