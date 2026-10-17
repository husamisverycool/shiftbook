/**
 * Stripe's webhook (decision 0036). No session: the signature over the raw body is the only way in
 * (STRIPE_WEBHOOK_SECRET); each event is handled once; a failure answers 5xx so Stripe retries. The
 * demo makes no Stripe calls and has no webhook. Nothing about the request is logged.
 */
import { billingConfig } from "@/server/billing/config";
import { billingDeps } from "@/server/billing/deps";
import { handleStripeEvent, MAX_WEBHOOK_BYTES } from "@/server/billing/service";
import { env } from "@/server/env";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  if (env.mode !== "live") return new Response(null, { status: 404 });
  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > MAX_WEBHOOK_BYTES) return Response.json({ received: false }, { status: 413 });
  // The raw bytes, exactly as sent: the signature is over them (never re-serialized JSON).
  const raw = new Uint8Array(await request.arrayBuffer());
  const result = await handleStripeEvent(billingDeps(), raw, request.headers.get("stripe-signature"), billingConfig().webhookSecret);
  return Response.json({ received: result.status === 200 }, { status: result.status });
}
