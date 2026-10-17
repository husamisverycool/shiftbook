"use server";

/**
 * Passkeys (decision 0032): signing in with one, and the signed-in person adding or removing theirs.
 * The site they belong to is SHIFTBOOK_APP_URL (in demo mode without it, the page's own address);
 * without it in live mode every passkey action answers "unavailable". What the browser sends is
 * checked for its shape before anything reads it.
 */
import type { AuthenticationResponseJSON, PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON, RegistrationResponseJSON } from "@simplewebauthn/server";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import { authDeps } from "@/server/auth/deps";
import { localePath, safeNext } from "@/server/auth/next-path";
import { currentPasskeySite } from "@/server/auth/passkey-site";
import { addPasskey, passkeyRegistrationOptions, passkeySignIn, passkeySignInOptions, removePasskey, type PasskeySummary, type RegistrationOptionsError } from "@/server/auth/passkeys";
import { MAX_SESSION_MS, SESSION_COOKIE } from "@/server/auth/service";
import { env } from "@/server/env";
import { requestOrigin, requestSender } from "@/server/request-info";
import { currentActor, currentSession } from "@/server/session";

const b64url = (max: number) => z.string().min(1).max(max).regex(/^[A-Za-z0-9_-]+$/);
const credentialId = b64url(1366);
const common = { id: credentialId, rawId: credentialId, type: z.literal("public-key"), authenticatorAttachment: z.enum(["platform", "cross-platform"]).optional(), clientExtensionResults: z.record(z.string().max(64), z.unknown()).default({}) };
const registrationResponse = z.object({
  ...common,
  response: z.object({
    clientDataJSON: b64url(4096),
    attestationObject: b64url(65536),
    authenticatorData: b64url(65536).optional(),
    transports: z.array(z.string().max(32)).max(16).optional(),
    publicKeyAlgorithm: z.number().int().optional(),
    publicKey: b64url(16384).optional(),
  }),
});
const authenticationResponse = z.object({
  ...common,
  response: z.object({ clientDataJSON: b64url(4096), authenticatorData: b64url(65536), signature: b64url(16384), userHandle: b64url(128).optional() }),
});

/** The session cookie, set exactly as actions.ts sets it (httpOnly, SameSite=Lax, Secure over HTTPS). */
async function keepSession(token: string): Promise<void> {
  const secure = Boolean(env.appUrl?.startsWith("https://")) || Boolean((await requestOrigin())?.startsWith("https://"));
  (await cookies()).set(SESSION_COOKIE, token, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: Math.floor(MAX_SESSION_MS / 1000) });
}

/** What the browser needs to ask the device for one of this site's passkeys. */
export async function passkeySignInOptionsAction(): Promise<{ ok: true; options: PublicKeyCredentialRequestOptionsJSON } | { ok: false; error: "locked" | "unavailable" }> {
  const site = await currentPasskeySite();
  if (!site) return { ok: false, error: "unavailable" };
  return passkeySignInOptions(authDeps(), site, (await requestSender()).ipAddress);
}

/**
 * The device's answer: signed in (both steps, decision 0032) and on to where sign-in goes, in the
 * page's language, keeping `next`; or refused, all refusals alike.
 */
export async function passkeySignInAction(input: { response: unknown; next: string | null }): Promise<{ ok: false; error: "invalid" | "locked" | "unavailable" }> {
  const site = await currentPasskeySite();
  if (!site) return { ok: false, error: "unavailable" };
  const parsed = authenticationResponse.safeParse(input.response);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const r = await passkeySignIn(authDeps(), parsed.data as AuthenticationResponseJSON, site, (await headers()).get("user-agent"), (await requestSender()).ipAddress);
  if (!r.ok) return r;
  await keepSession(r.token);
  redirect(localePath(await getLocale(), safeNext(input.next)));
}

/**
 * What the browser needs to make a passkey for the signed-in person. Without `secret`: "confirm" when
 * the password or a code must come with it (every time, decision 0032); with it, checked as "confirm
 * it's you" checks it.
 */
export async function passkeyRegistrationOptionsAction(secret: string | null): Promise<{ ok: true; options: PublicKeyCredentialCreationOptionsJSON } | { ok: false; error: RegistrationOptionsError | "unavailable" }> {
  await currentActor();
  const site = await currentPasskeySite();
  if (!site) return { ok: false, error: "unavailable" };
  if (secret !== null && (typeof secret !== "string" || secret.length > 1024)) return { ok: false, error: "invalid" };
  return passkeyRegistrationOptions(authDeps(), (await currentSession())!, site, secret);
}

/** The new passkey from the device, kept (named from its device type). */
export async function addPasskeyAction(response: unknown): Promise<{ ok: true; passkey: Omit<PasskeySummary, "createdAt" | "lastUsedAt"> & { createdAt: string; lastUsedAt: string | null } } | { ok: false; error: "expired" | "invalid" | "exists" | "too_many" | "unavailable" }> {
  await currentActor();
  const site = await currentPasskeySite();
  if (!site) return { ok: false, error: "unavailable" };
  const parsed = registrationResponse.safeParse(response);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const r = await addPasskey(authDeps(), (await currentSession())!, parsed.data as RegistrationResponseJSON, site, { locale: await getLocale() });
  if (!r.ok) return r;
  return { ok: true, passkey: { ...r.passkey, createdAt: r.passkey.createdAt.toISOString(), lastUsedAt: r.passkey.lastUsedAt?.toISOString() ?? null } };
}

/** One of the person's passkeys, removed; or "confirm it's you" first. */
export async function removePasskeyAction(passkeyId: string): Promise<{ ok: true } | { ok: false; error: "confirm" | "expired" | "not_found" }> {
  await currentActor();
  if (typeof passkeyId !== "string") return { ok: false, error: "not_found" };
  return removePasskey(authDeps(), (await currentSession())!, passkeyId);
}
