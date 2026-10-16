/**
 * A worker's file opens through a grant the reveal hands out (decision 0027): the file's link, the
 * person, and a time two minutes ahead, signed with a key derived from the key-encryption key. The
 * route checks all three, so the address works only for the Owner who gave the reason, and briefly.
 */
import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";

/** How long the address works after the reason is given. */
export const GRANT_SECONDS = 120;

const grantKey = (kek: Buffer) => Buffer.from(hkdfSync("sha256", kek, "shiftbook worker file grant", "", 32));
const sign = (kek: Buffer, linkId: string, userId: string, expires: number) => createHmac("sha256", grantKey(kek)).update(`${linkId}|${userId}|${expires}`, "utf8").digest("base64url");

export function fileGrant(kek: Buffer, linkId: string, userId: string, nowSeconds: number): { expires: number; signature: string } {
  const expires = nowSeconds + GRANT_SECONDS;
  return { expires, signature: sign(kek, linkId, userId, expires) };
}

export function grantHolds(kek: Buffer, linkId: string, userId: string, expires: number, signature: string, nowSeconds: number): boolean {
  if (!Number.isInteger(expires) || expires < nowSeconds || expires > nowSeconds + GRANT_SECONDS) return false;
  const want = Buffer.from(sign(kek, linkId, userId, expires), "utf8");
  const got = Buffer.from(signature, "utf8");
  return want.length === got.length && timingSafeEqual(want, got);
}
