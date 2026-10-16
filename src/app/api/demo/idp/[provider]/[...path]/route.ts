/**
 * The demo's stand-in identity providers (decision 0033), demo mode only (404 otherwise): the
 * discovery document, the authorize step (its page is `/sign-in/demo-provider/<provider>`), the token
 * endpoint and the published keys. The app's own sign-in code calls these over HTTP at the app's own
 * address, as it calls Google or Microsoft.
 */
import { NextResponse, type NextRequest } from "next/server";
import { answerAuthorize, demoDiscovery, demoJwks, demoToken, isDemoProvider, openAuthorize, readAuthorize, sealAuthorize } from "@/server/auth/demo-idp";
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
  if (!isDemoProvider(provider)) return null;
  return { provider, path: path.join("/"), base: linkBaseUrl(await requestOrigin()) };
}

export async function GET(request: NextRequest, context: Context): Promise<Response> {
  const at = await where(context);
  if (!at) return NOT_FOUND();
  const discovery = at.provider === "microsoft" ? "common/v2.0/.well-known/openid-configuration" : ".well-known/openid-configuration";
  if (at.path === discovery) return Response.json(demoDiscovery(at.base, at.provider), { headers: NO_STORE });
  if (at.path === "jwks") return Response.json(await demoJwks(), { headers: NO_STORE });
  if (at.path === "authorize") {
    const query = request.nextUrl.searchParams;
    const asked = readAuthorize(query, at.base, at.provider, new Date());
    const locale = asked?.locale ?? (query.get("ui_locales") === "es" ? "es" : "en");
    const page = `/${locale}/sign-in/demo-provider/${at.provider}${asked ? `?request=${sealAuthorize(asked)}` : ""}`;
    return NextResponse.redirect(new URL(page, at.base), { status: 303, headers: NO_STORE });
  }
  return NOT_FOUND();
}

export async function POST(request: NextRequest, context: Context): Promise<Response> {
  const at = await where(context);
  if (!at) return NOT_FOUND();
  const now = new Date();
  if (at.path === "token") {
    const answer = await demoToken(new URLSearchParams(await request.text()), at.base, at.provider, now);
    return Response.json(answer.body, { status: answer.status, headers: NO_STORE });
  }
  if (at.path === "authorize") {
    // The stand-in's page: the account chosen (or Cancel), back to Shiftbook's callback.
    const form = await request.formData();
    const asked = openAuthorize(String(form.get("request") ?? ""), now);
    if (!asked || asked.provider !== at.provider) return NextResponse.redirect(new URL(`/en/sign-in/demo-provider/${at.provider}`, at.base), { status: 303, headers: NO_STORE });
    return NextResponse.redirect(answerAuthorize(asked, String(form.get("account") ?? "cancel"), now), { status: 303, headers: NO_STORE });
  }
  return NOT_FOUND();
}
