/**
 * Passwords (slice k, decision K1): scrypt with OWASP's minimum for it (N = 2^17, r = 8, p = 1), a
 * 16-byte salt and a 32-byte hash, stored as "scrypt$N$r$p$salt$hash". At least 15 characters (NIST
 * SP 800-63B-4 for a password that may be the only factor), at most 128 (long ones are slow to hash),
 * any characters, no composition rules; not the email address, not one character repeated.
 */
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const N = 2 ** 17;
const R = 8;
const P = 1;
const KEY_BYTES = 32;
/** scrypt needs 128 × N × r bytes (128 MiB here); Node's default ceiling is 32 MiB. */
const MAX_MEMORY = 256 * 1024 * 1024;
export const PASSWORD_MIN = 15;
export const PASSWORD_MAX = 128;

/** Too many passwords waiting to be checked at once: the caller says "busy" instead of queuing more. */
export class PasswordBusyError extends Error {
  constructor() {
    super("Too many sign-ins at once.");
    this.name = "PasswordBusyError";
  }
}

/** At most this many hashes run at once (each takes about half a second and 128 MiB), and at most this many wait. */
const RUNNING = 4;
const WAITING = 32;
let running = 0;
const waiting: (() => void)[] = [];

async function slot<T>(work: () => Promise<T>): Promise<T> {
  if (running >= RUNNING) {
    if (waiting.length >= WAITING) throw new PasswordBusyError();
    await new Promise<void>((resolve) => waiting.push(resolve));
  } else running += 1;
  try {
    return await work();
  } finally {
    // Hand the slot straight to the next one waiting, or give it back.
    const next = waiting.shift();
    if (next) next();
    else running -= 1;
  }
}

function derive(password: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  return slot(
    () =>
      new Promise((resolve, reject) => {
        scrypt(password.normalize("NFKC"), salt, KEY_BYTES, { N: n, r, p, maxmem: MAX_MEMORY }, (err, key) => (err ? reject(err) : resolve(key)));
      }),
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, N, R, P);
  return ["scrypt", N, R, P, salt.toString("base64"), key.toString("base64")].join("$");
}

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;
  const [scheme, n, r, p, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !n || !r || !p || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const key = await derive(password, Buffer.from(salt, "base64"), Number(n), Number(r), Number(p));
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** Why a new password is refused, or null. */
export function passwordProblem(password: string, email: string): "too_short" | "too_long" | "is_email" | "one_character" | null {
  const chars = [...password.normalize("NFKC")];
  if (chars.length < PASSWORD_MIN) return "too_short";
  if (chars.length > PASSWORD_MAX) return "too_long";
  if (password.trim().toLowerCase() === email.trim().toLowerCase()) return "is_email";
  if (new Set(chars).size === 1) return "one_character";
  return null;
}
