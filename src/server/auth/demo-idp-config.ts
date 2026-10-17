/**
 * The demo's stand-in identity providers (decision 0033): their fixed address, client IDs, and client
 * secrets — derived at run time from the app key (in demo mode a fixed demo derivation), never
 * written anywhere.
 *
 * The stand-in lives at an address under the reserved `.invalid` name (RFC 6761: it never resolves),
 * and the server reaches it only IN-PROCESS (demo-idp.ts, demoFetch): no server-side call is ever
 * built from a request's Host or X-Forwarded-Proto (review H1). Only the browser's step — choosing an
 * account — is a page on the app itself (DEMO_IDP_PATH).
 */
import { hkdfSync } from "node:crypto";
import { demoUuid } from "../demo/dataset";
import { appKey } from "./crypto";
import type { ProviderId } from "./oidc";

export const DEMO_IDP_ORIGIN = "https://identity.demo.shiftbook.invalid";
export const DEMO_IDP_HOST = new URL(DEMO_IDP_ORIGIN).hostname;
/** The browser's step, on the app. */
export const DEMO_IDP_PATH = "/api/demo/idp";
/** The demo agency's SSO issuer: the stand-in's "sso" provider. */
export const DEMO_SSO_ISSUER = `${DEMO_IDP_ORIGIN}/sso`;
/** The stand-in Microsoft's tenant: a GUID, as Entra ID's are. */
export const DEMO_TENANT_ID = demoUuid("identity-provider-tenant");

export const demoClientId = (provider: ProviderId) => `shiftbook-demo-${provider}`;
export const demoClientSecret = (provider: ProviderId) => Buffer.from(hkdfSync("sha256", appKey(), "shiftbook", `demo identity provider client ${provider}`, 24)).toString("base64url");

/** The stand-in's issuer for a provider. */
export const demoIssuer = (provider: ProviderId): string => (provider === "microsoft" ? `${DEMO_IDP_ORIGIN}/microsoft/${DEMO_TENANT_ID}/v2.0` : `${DEMO_IDP_ORIGIN}/${provider}`);
