"use server";

// The agency's actions in Client approvals (docs/patterns/approvals.md, approvals/[id].md).
import { getLocale } from "next-intl/server";
import { sendApprovalRequest, sendReminder, settleDispute, withdrawApproval, type ApprovalFailure } from "@/server/approvals/service";
import { requestOrigin } from "@/server/request-info";
import { editEntry } from "@/server/review/service";
import { PeriodBusyError } from "@/server/run/period-lock";
import { approvalDeps, linkBaseUrl } from "@/server/services";
import { currentActor } from "@/server/session";

export type ApprovalActionResult = { ok: true } | { ok: false; error: string; count?: number; detail?: string };

const isText = (v: unknown, max: number): v is string => typeof v === "string" && v.length <= max;

async function deps() {
  return approvalDeps(linkBaseUrl(await requestOrigin()));
}

async function guarded(fn: () => Promise<{ ok: true } | ApprovalFailure>): Promise<ApprovalActionResult> {
  try {
    const r = await fn();
    return r.ok ? { ok: true } : { ok: false, error: r.error, count: r.count, detail: r.detail };
  } catch (error) {
    if (error instanceof PeriodBusyError) return { ok: false, error: "generic" };
    console.error("approval action failed:", error instanceof Error ? error.message : String(error));
    return { ok: false, error: "generic" };
  }
}

export async function sendApprovalAction(input: unknown): Promise<ApprovalActionResult> {
  const i = (input ?? {}) as Record<string, unknown>;
  if (!isText(i.clientId, 40) || !isText(i.payPeriodId, 40) || !isText(i.approverName, 200) || !isText(i.approverEmail, 320) || !isText(i.locale, 5)) return { ok: false, error: "generic" };
  const actor = currentActor();
  const agencyLocale = await getLocale();
  return guarded(async () =>
    sendApprovalRequest(await deps(), actor, { clientId: i.clientId as string, payPeriodId: i.payPeriodId as string, approverName: i.approverName as string, approverEmail: i.approverEmail as string, locale: i.locale as string, agencyLocale }),
  );
}

export async function sendReminderAction(requestId: unknown): Promise<ApprovalActionResult> {
  if (!isText(requestId, 40)) return { ok: false, error: "generic" };
  const actor = currentActor();
  return guarded(async () => sendReminder(await deps(), actor, requestId));
}

export async function withdrawApprovalAction(requestId: unknown, reason: unknown): Promise<ApprovalActionResult> {
  if (!isText(requestId, 40) || !isText(reason, 2000)) return { ok: false, error: "generic" };
  const actor = currentActor();
  return guarded(async () => withdrawApproval(approvalDeps(""), actor, requestId, reason));
}

export async function settleDisputeAction(disputeId: unknown, action: unknown, reply: unknown): Promise<ApprovalActionResult> {
  if (!isText(disputeId, 40) || (action !== "accept" && action !== "keep") || !isText(reply, 2000)) return { ok: false, error: "generic" };
  const actor = currentActor();
  return guarded(async () =>
    settleDispute(approvalDeps(""), actor, disputeId, action, reply, (tx, entryId, change, note) => editEntry(tx, actor, entryId, change, ["confirmed_client"], note, { clientTimesAccepted: true })),
  );
}

