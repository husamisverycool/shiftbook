/**
 * The site passkeys belong to (decision 0032): in live mode only SHIFTBOOK_APP_URL — never the
 * request's Host header, which a caller can forge — and none without it (passkeys are then refused in
 * plain words); in demo mode the app's URL when set, otherwise the page's own address.
 */
import { env, type AppMode } from "../env";
import { requestOrigin } from "../request-info";
import { relyingParty, type RelyingParty } from "./passkeys";

export function passkeySite(pageOrigin: string | null, settings: { mode: AppMode; appUrl: string | null } = env): RelyingParty | null {
  if (settings.appUrl) return relyingParty(settings.appUrl);
  if (settings.mode === "demo" && pageOrigin) return relyingParty(pageOrigin);
  return null;
}

/** The site for this request (what the passkey actions use). */
export async function currentPasskeySite(): Promise<RelyingParty | null> {
  return passkeySite(await requestOrigin());
}
