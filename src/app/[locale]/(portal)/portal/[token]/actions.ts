"use server";

// The client's actions in the portal (slice v). Each is a POST that checks the link again
// (decision 0013); the token travels in the request body, never in a query string.
import { revalidatePath } from "next/cache";
import { redactApprovalLinks } from "@/server/approvals/token";
import { requestNewPortalLink, reviewHoursLink, submitStaffRequest, type PortalError, type StaffRequestInput } from "@/server/portal/service";
import { requestOrigin } from "@/server/request-info";
import { approvalDeps, linkBaseUrl } from "@/server/services";

export type PortalActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: PortalError | "generic"; fields?: string[] };

const isText = (v: unknown, max: number): v is string => typeof v === "string" && v.length <= max;
const whole = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function guarded<T extends object>(fn: () => Promise<PortalActionResult<T>>): Promise<PortalActionResult<T>> {
  try {
    return await fn();
  } catch (error) {
    console.error("portal action failed:", redactApprovalLinks(error instanceof Error ? error.message : String(error)));
    return { ok: false, error: "generic" };
  }
}

/** "Email me a new link" from an expired link. */
export async function renewPortalLinkAction(token: unknown): Promise<PortalActionResult> {
  if (!isText(token, 100)) return { ok: false, error: "generic" };
  return guarded(async () => requestNewPortalLink(approvalDeps(linkBaseUrl(await requestOrigin())), token));
}

/** Sends a request for workers. */
export async function staffRequestAction(token: unknown, input: unknown): Promise<PortalActionResult<{ requestId: string }>> {
  const i = (input ?? {}) as Record<string, unknown>;
  if (
    !isText(token, 100) ||
    !isText(i.position, 400) ||
    !(i.worksiteId === null || (typeof i.worksiteId === "string" && UUID.test(i.worksiteId))) ||
    !isText(i.worksiteNote, 600) ||
    !isText(i.startsOn, 10) ||
    !(i.endsOn === null || isText(i.endsOn, 10)) ||
    !whole(i.shiftStartMinute) ||
    !whole(i.shiftEndMinute) ||
    !whole(i.headcount) ||
    !isText(i.notes, 4000)
  )
    return { ok: false, error: "generic" };
  const result = await guarded(async () => submitStaffRequest(approvalDeps(""), token, i as unknown as StaffRequestInput));
  if (result.ok) revalidatePath("/[locale]/(portal)/portal/[token]", "layout");
  return result;
}

/** Opens a period's approval page from the portal: a fresh approval link, for its own approver only. */
export async function reviewHoursAction(token: unknown, requestId: unknown): Promise<PortalActionResult<{ href: string }>> {
  if (!isText(token, 100) || typeof requestId !== "string" || !UUID.test(requestId)) return { ok: false, error: "generic" };
  return guarded<{ href: string }>(async () => {
    const r = await reviewHoursLink(approvalDeps(""), token, requestId);
    return r.ok ? { ok: true, href: `/${r.locale}/approve/${r.approvalToken}` } : r;
  });
}
