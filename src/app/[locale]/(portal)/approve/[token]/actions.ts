"use server";

// The client's actions on the approval page. Each is a POST that checks the link again
// (decision 0013); the token travels in the request body, never in a query string.
import { removeDraftDispute, requestNewLink, saveDraftDispute, submitDecision, type ApprovalDeps, type ProposedTimes } from "@/server/approvals/service";
import { redactApprovalLinks } from "@/server/approvals/token";
import { requestOrigin, requestSender } from "@/server/request-info";
import { approvalDeps, linkBaseUrl } from "@/server/services";

export type PortalResult = { ok: true } | { ok: false; error: string };

const isText = (v: unknown, max: number): v is string => typeof v === "string" && v.length <= max;
const whole = (v: unknown) => typeof v === "number" && Number.isInteger(v);

/** Links in emails need the app's address; only actions that send email need it. */
async function deps(sendsEmail: boolean): Promise<ApprovalDeps> {
  return approvalDeps(sendsEmail ? linkBaseUrl(await requestOrigin()) : "");
}

async function guarded(fn: () => Promise<{ ok: true } | { ok: false; error: string }>): Promise<PortalResult> {
  try {
    const r = await fn();
    return r.ok ? { ok: true } : { ok: false, error: r.error };
  } catch (error) {
    console.error("approval page action failed:", redactApprovalLinks(error instanceof Error ? error.message : String(error)));
    return { ok: false, error: "generic" };
  }
}

export async function saveDisputeAction(token: unknown, entryId: unknown, reason: unknown, proposed: unknown): Promise<PortalResult> {
  if (!isText(token, 100) || !isText(entryId, 40) || !isText(reason, 2000)) return { ok: false, error: "generic" };
  let times: ProposedTimes | null = null;
  if (proposed !== null) {
    const p = proposed as Record<string, unknown>;
    if (typeof proposed !== "object" || !whole(p.inMinute) || !whole(p.outMinute) || !whole(p.breakMinutes)) return { ok: false, error: "invalid_times" };
    times = { inMinute: p.inMinute as number, outMinute: p.outMinute as number, breakMinutes: p.breakMinutes as number };
  }
  return guarded(async () => saveDraftDispute(await deps(false), token, { entryId, reason, proposed: times }));
}

export async function removeDisputeAction(token: unknown, entryId: unknown): Promise<PortalResult> {
  if (!isText(token, 100) || !isText(entryId, 40)) return { ok: false, error: "generic" };
  return guarded(async () => removeDraftDispute(await deps(false), token, entryId));
}

export async function submitDecisionAction(token: unknown, input: unknown): Promise<PortalResult> {
  const i = (input ?? {}) as Record<string, unknown>;
  if (!isText(token, 100) || !isText(i.typedName, 200) || typeof i.confirmed !== "boolean" || !isText(i.snapshot, 64) || !isText(i.locale, 5)) return { ok: false, error: "generic" };
  const sender = await requestSender();
  return guarded(async () => submitDecision(await deps(true), token, { typedName: i.typedName as string, confirmed: i.confirmed as boolean, snapshot: i.snapshot as string, locale: i.locale as string, ...sender }));
}

export async function newLinkAction(token: unknown): Promise<PortalResult> {
  if (!isText(token, 100)) return { ok: false, error: "generic" };
  return guarded(async () => requestNewLink(await deps(true), token));
}
