"use server";

/**
 * Creating an agency (decision 0036): the request (email, name, agency) and the link's password. Live
 * mode only — the demo makes no agencies. Every input is checked for its shape first.
 */
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import { renderSignupEmail, renderSignupExistingEmail } from "@/server/auth/emails";
import { LINK_TOKEN_SHAPE, MAX_SESSION_MS, SESSION_COOKIE, type PasswordError } from "@/server/auth/service";
import { completeSignup, requestSignup, type SignupRequestResult } from "@/server/auth/signup";
import { signupDeps } from "@/server/auth/signup-deps";
import { billingConfig } from "@/server/billing/config";
import { env } from "@/server/env";
import { requestOrigin, requestSender } from "@/server/request-info";
import { linkBaseUrl } from "@/server/services";
import { isDemo } from "@/server/session";

const Request = z.object({ email: z.string().max(320), name: z.string().max(400), agencyName: z.string().max(800) }).strict();

/** The session cookie, set exactly as actions.ts sets it (httpOnly, SameSite=Lax, Secure over HTTPS). */
async function keepSession(token: string): Promise<void> {
  const secure = Boolean(env.appUrl?.startsWith("https://")) || Boolean((await requestOrigin())?.startsWith("https://"));
  (await cookies()).set(SESSION_COOKIE, token, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: Math.floor(MAX_SESSION_MS / 1000) });
}

/** The sign-up request: the same answer whatever the email (the email goes out after the response). */
export async function requestSignupAction(input: { email: string; name: string; agencyName: string }): Promise<SignupRequestResult | { ok: false; error: "demo" }> {
  if (isDemo()) return { ok: false, error: "demo" };
  const parsed = Request.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_email" };
  const locale = await getLocale();
  return requestSignup(
    signupDeps(),
    { ...parsed.data, locale },
    (await requestSender()).ipAddress,
    { link: (link, who) => renderSignupEmail(link, who), existing: (links, who) => renderSignupExistingEmail(links, who) },
    linkBaseUrl(await requestOrigin()),
    (job) => after(job),
  );
}

/** The link's password: the agency is made, and the Owner goes on to set up an authenticator. */
export async function completeSignupAction(token: string, password: string): Promise<{ ok: false; error: "expired" | "email_taken" | PasswordError }> {
  if (isDemo() || !LINK_TOKEN_SHAPE.test(token)) return { ok: false, error: "expired" };
  if (typeof password !== "string" || password.length > 1024) return { ok: false, error: "too_long" };
  const r = await completeSignup(signupDeps(), token, password, (await headers()).get("user-agent"), { trialDays: billingConfig().trialDays });
  if (!r.ok) return r;
  await keepSession(r.token);
  redirect(`/${r.locale}/sign-in/setup`);
}
