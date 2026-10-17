/**
 * The demo's stand-in identity providers (decision 0033), demo mode only (404 otherwise): the browser's
 * step only — the authorization request becomes the stand-in's page (`/sign-in/demo-provider/…`), and
 * the account chosen there goes back to Granite's callback with a code. Discovery, keys and the token
 * endpoint are never served over HTTP: the server reaches them in-process (review H1).
 */
import { NextResponse, type NextRequest } from "next/server";
import { answerAuthorize, isDemoProvider, openAuthorize, readAuthorize, sealAuthorize } from "@/server/auth/demo-idp";
import { requestOrigin } from "@/server/request-info";
import { linkBaseUrl } from "@/server/services";
import { isDemo } from "@/server/session";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ provider: string; path: string[] }> };
const NOT_FOUND = () => new Response("Not found", { status: 404 });
const NO_STORE = { "Cache-Control": "no-store" };

async function where(context: Context) {
  if (!isDemo()) return null;
  const { provider, path } = await context.params;
  if (!isDemoProvider(provider) || path.join("/") !== "authorize") return null;
  return { provider, base: linkBaseUrl(await requestOrigin()) };
}

export async function GET(request: NextRequest, context: Context): Promise<Response> {
  const at = await where(context);
  if (!at) return NOT_FOUND();
  const query = request.nextUrl.searchParams;
  const asked = readAuthorize(query, at.base, at.provider, new Date());
  const locale = asked?.locale ?? (query.get("ui_locales") === "es" ? "es" : "en");
  const page = `/${locale}/sign-in/demo-provider/${at.provider}${asked ? `?request=${sealAuthorize(asked)}` : ""}`;
  return NextResponse.redirect(new URL(page, at.base), { status: 303, headers: NO_STORE });
}

export async function POST(request: NextRequest, context: Context): Promise<Response> {
  const at = await where(context);
  if (!at) return NOT_FOUND();
  const now = new Date();
  // The stand-in's page: the account chosen (or Cancel), back to Granite's callback.
  const form = await request.formData();
  const asked = openAuthorize(String(form.get("request") ?? ""), now);
  if (!asked || asked.provider !== at.provider) return NextResponse.redirect(new URL(`/en/sign-in/demo-provider/${at.provider}`, at.base), { status: 303, headers: NO_STORE });
  return NextResponse.redirect(answerAuthorize(asked, String(form.get("account") ?? "cancel"), now), { status: 303, headers: NO_STORE });
}
