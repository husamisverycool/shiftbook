/**
 * The demo's stand-in identity providers (decision 0033): where they live on the app, their client
 * IDs, and their client secrets — derived at run time from the app key (in demo mode a fixed demo
 * derivation), never written anywhere.
 */
import { hkdfSync } from "node:crypto";
import { demoUuid } from "../demo/dataset";
import { appKey } from "./crypto";
import type { ProviderId } from "./oidc";

export const DEMO_IDP_PATH = "/api/demo/idp";
/** The demo agency's SSO issuer, kept relative to the app's own address (the demo knows it only per request). */
export const DEMO_SSO_ISSUER = `${DEMO_IDP_PATH}/sso`;
/** The stand-in Microsoft's tenant: a GUID, as Entra ID's are. */
export const DEMO_TENANT_ID = demoUuid("identity-provider-tenant");

export const demoClientId = (provider: ProviderId) => `shiftbook-demo-${provider}`;
export const demoClientSecret = (provider: ProviderId) => Buffer.from(hkdfSync("sha256", appKey(), "shiftbook", `demo identity provider client ${provider}`, 24)).toString("base64url");

/** The stand-in's issuer for a provider, on the app's own address. */
export function demoIssuer(base: string, provider: ProviderId): string {
  return provider === "microsoft" ? `${base}${DEMO_IDP_PATH}/microsoft/${DEMO_TENANT_ID}/v2.0` : `${base}${DEMO_IDP_PATH}/${provider}`;
}
