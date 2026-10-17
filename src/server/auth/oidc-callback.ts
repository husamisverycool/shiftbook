/**
 * What the provider's answer leads to (decision 0033): the route `/api/auth/oidc/[provider]/callback`
 * hands it the request's parts and sets the cookies this returns. Kept apart from the route so every
 * branch is tested through the database.
 *
 * The request's cookie must hold the state returned (a code sent to another browser is never used);
 * the code is exchanged and the ID token verified; then, by the request's purpose: sign in (the
 * linking rules; a first link may first need a code from the mailbox), an agency's SSO, connect to
 * the very session that asked, or accept an invite. Every refusal goes back where the person started.
 */
import { appKey, seal, unseal, type Sealed } from "./crypto";
import { acceptInviteWithIdentity, connectIdentity, signInWithIdentity, ssoConfigOf, type IdentityMail, type PendingLink } from "./identities";
import { PROVIDERS, type ProviderId } from "./oidc";
import { completeRequest, onwardPath } from "./oidc-flow";
import type { AuthDeps, SessionInfo } from "./service";

/** The first link waiting for its emailed code: sealed, httpOnly, 10 minutes (the code's own life). */
export const LINK_COOKIE = "sb_link";
export const LINK_MS = 10 * 60 * 1000;
export interface LinkCookie {
  link: PendingLink;
  locale: string;
  next: string | null;
  expiresAt: number;
}
const LINK_AAD = "pending-link";
export const sealLink = (value: LinkCookie, key: Buffer = appKey()) => Buffer.from(JSON.stringify(seal(Buffer.from(JSON.stringify(value), "utf8"), key, LINK_AAD)), "utf8").toString("base64url");
export function openLink(value: string | undefined, now: Date, key: Buffer = appKey()): LinkCookie | null {
  if (!value || value.length > 8000) return null;
  try {
    const out = JSON.parse(unseal(JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Sealed, key, LINK_AAD).toString("utf8")) as LinkCookie;
    return typeof out.expiresAt === "number" && out.expiresAt > now.getTime() ? out : null;
  } catch {
    return null;
  }
}

export interface CallbackInput {
  provider: string;
  params: URLSearchParams;
  cookie: string | undefined;
  base: string;
  /** The session this browser holds now (for "connect"). */
  session: SessionInfo | null;
  userAgent: string | null;
  address: string | null;
  demoMode: boolean;
  deps: AuthDeps;
  mail: IdentityMail;
}
/** Where the browser goes, and the cookies to set (the request's own cookie is always cleared). */
export interface CallbackAnswer {
  location: string;
  session?: string;
  link?: string;
}

export async function handleOidcCallback(input: CallbackInput): Promise<CallbackAnswer | null> {
  if (!(PROVIDERS as readonly string[]).includes(input.provider)) return null;
  const provider = input.provider as ProviderId;
  const { deps } = input;
  const done = await completeRequest(provider, input.params, input.cookie, input.base, async (r) => (r.agencyId ? ssoConfigOf(deps, r.agencyId, { demoMode: input.demoMode }) : null));
  const asked = done.request;
  const locale = asked?.locale ?? "en";
  const toSignIn = (notice: string): CallbackAnswer => ({ location: `/${locale}/sign-in?notice=${notice}${asked?.next ? `&next=${encodeURIComponent(asked.next)}` : ""}` });

  if (!done.ok) {
    if (asked?.purpose === "connect") return { location: `/${locale}/settings/account?identity=failed&provider=${provider}` };
    if (asked?.purpose === "invite" && asked.invite) return { location: `/${locale}/invite/${asked.invite}?notice=provider_failed` };
    return toSignIn("provider_failed");
  }
  const request = done.request;

  if (request.purpose === "connect") {
    // Only to the person, and the very session, that asked (it confirmed it was them when it began).
    const session = input.session;
    if (!session || session.sessionId !== request.sessionId || session.userId !== request.userId) return { location: `/${locale}/settings/account?identity=failed&provider=${provider}` };
    const r = await connectIdentity(deps, session, provider, done.identity, { flowConfirmed: true, mail: input.mail });
    return { location: `/${locale}/settings/account?identity=${r.ok ? "connected" : r.error}&provider=${provider}` };
  }

  if (request.purpose === "invite") {
    if (!request.invite) return toSignIn("provider_failed");
    const r = await acceptInviteWithIdentity(deps, request.invite, provider, done.identity, input.userAgent, input.mail);
    if (!r.ok) return { location: r.error === "expired" ? `/${locale}/invite/${request.invite}` : `/${locale}/invite/${request.invite}?notice=${r.error}` };
    return { location: onwardPath(r.next, r.locale, null), session: r.token };
  }

  const sso = request.purpose === "sso" ? (request.agencyId && request.userId ? { agencyId: request.agencyId, userId: request.userId } : null) : null;
  if (request.purpose === "sso" && !sso) return toSignIn("provider_failed");
  const r = await signInWithIdentity(deps, { provider, identity: done.identity, sso, demoMode: input.demoMode, userAgent: input.userAgent, address: input.address }, input.mail);
  if (!r.ok) {
    if (r.error === "proof") return { location: `/${locale}/sign-in/link`, link: sealLink({ link: r.pending, locale, next: request.next, expiresAt: Date.now() + LINK_MS }) };
    return toSignIn(r.error === "locked" ? "too_many" : r.error);
  }
  // The demo people are shared: the language the visitor chose wins (as with Continue as).
  return { location: onwardPath(r.next, r.demo ? locale : r.locale, request.next), session: r.token };
}
