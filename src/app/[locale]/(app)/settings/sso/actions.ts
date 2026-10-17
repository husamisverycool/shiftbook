"use server";

/** The agency's single sign-on (decision 0033): the Owner only, after confirming it's them. */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authDeps } from "@/server/auth/deps";
import { saveSsoSettings, setSsoEnabled, type SsoError } from "@/server/auth/identities";
import { checkIssuer } from "@/server/auth/oidc-flow";
import { actorAllowedTo, isDemo, mustConfirmNow } from "@/server/session";

export type SsoResult = { ok: true } | { ok: false; error: SsoError | "confirm" | "generic" };

const SaveSchema = z.object({ issuer: z.string().max(400), clientId: z.string().max(300), clientSecret: z.string().max(2000).nullable() }).strict();
const refresh = () => revalidatePath("/[locale]/(app)/settings/sso", "page");

export async function saveSsoAction(input: unknown): Promise<SsoResult> {
  const actor = await actorAllowedTo("members");
  if (await mustConfirmNow()) return { ok: false, error: "confirm" };
  const parsed = SaveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "generic" };
  const demoMode = isDemo();
  const r = await saveSsoSettings(authDeps(), actor, parsed.data, { demoMode, check: (issuer) => checkIssuer(issuer, { demoMode }) });
  refresh();
  return r;
}

export async function setSsoEnabledAction(enabled: boolean): Promise<SsoResult> {
  const actor = await actorAllowedTo("members");
  if (await mustConfirmNow()) return { ok: false, error: "confirm" };
  if (typeof enabled !== "boolean") return { ok: false, error: "generic" };
  const r = await setSsoEnabled(authDeps(), actor, enabled);
  refresh();
  return r;
}
