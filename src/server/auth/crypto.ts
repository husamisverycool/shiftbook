/**
 * The app's secrets at rest (slice k, decisions K1, K5): one key-encryption key from the environment
 * (`SHIFTBOOK_ENCRYPTION_KEY`, 32 bytes in base64, set in the cloud environment settings — never in
 * the database), AES-256-GCM to seal small secrets with it, random tokens and their SHA-256 digests.
 * Demo mode derives a demo-only key from a fixed label (HKDF-SHA256): demo data is fictional, and
 * the demo makes no outside calls, so its key is not a secret.
 */
import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "../env";

export class MissingKeyError extends Error {
  constructor() {
    super("SHIFTBOOK_ENCRYPTION_KEY is not set (32 bytes in base64): set it in the cloud environment settings.");
    this.name = "MissingKeyError";
  }
}

/** What is stored: the key's version, a 12-byte nonce, the 16-byte tag and the ciphertext, each base64. */
export interface Sealed {
  v: number;
  iv: string;
  tag: string;
  data: string;
}

const DEMO_LABEL = "shiftbook demo mode: fictional data only";

let cached: Buffer | null = null;
/** The key-encryption key: the environment's in live mode, a fixed derivation in demo mode. */
export function appKey(): Buffer {
  if (cached) return cached;
  const raw = process.env.SHIFTBOOK_ENCRYPTION_KEY;
  if (raw) {
    const key = Buffer.from(raw, "base64");
    if (key.length !== 32) throw new MissingKeyError();
    cached = key;
  } else if (env.mode === "demo") {
    cached = Buffer.from(hkdfSync("sha256", DEMO_LABEL, "shiftbook", "key-encryption", 32));
  } else throw new MissingKeyError();
  return cached;
}

/** AES-256-GCM with a fresh nonce; `aad` binds the value to where it belongs (a user, a worker). */
export function seal(plain: Buffer, key: Buffer, aad: string): Sealed {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: 16 });
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const data = Buffer.concat([cipher.update(plain), cipher.final()]);
  return { v: 1, iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), data: data.toString("base64") };
}

export function unseal(s: Sealed, key: Buffer, aad: string): Buffer {
  // The 12-byte nonce `seal` makes, and a 16-byte tag only: GCM would otherwise accept other lengths.
  const iv = Buffer.from(s.iv, "base64");
  if (iv.length !== 12) throw new Error("A sealed value has a malformed nonce.");
  const decipher = createDecipheriv("aes-256-gcm", key, iv, { authTagLength: 16 });
  decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(Buffer.from(s.tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(s.data, "base64")), decipher.final()]);
}

/** A random token for a cookie or a link: 32 bytes, base64url. */
export const randomToken = () => randomBytes(32).toString("base64url");

/** Only the digest of a token is stored, so the table never holds a working token. */
export const digest = (token: string) => createHash("sha256").update(token, "utf8").digest("hex");

/** Equal strings in constant time. */
export function sameText(a: string, b: string): boolean {
  const x = Buffer.from(a, "utf8");
  const y = Buffer.from(b, "utf8");
  return x.length === y.length && timingSafeEqual(x, y);
}
