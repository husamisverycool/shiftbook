/**
 * Document storage behind one interface (SPEC §3 "object storage for documents"). Development and
 * demo use a local folder; a cloud bucket adapter replaces it at deploy time (decision record 0002).
 * Keys always start with the agency id, so one agency's files are never addressable from another's.
 */
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { env } from "./env";

export interface DocumentStore {
  put(key: string, bytes: Uint8Array): Promise<void>;
  get(key: string): Promise<Uint8Array>;
  removePrefix(prefix: string): Promise<void>;
}

const SAFE_KEY = /^[A-Za-z0-9][A-Za-z0-9._\-/]*$/;

export function assertSafeKey(key: string): void {
  if (!SAFE_KEY.test(key) || key.split("/").some((part) => part === ".." || part === "." || part === "")) {
    throw new Error(`unsafe storage key: ${key}`);
  }
}

export class LocalDocumentStore implements DocumentStore {
  private readonly root: string;
  constructor(root: string) {
    this.root = resolve(root);
  }
  private path(key: string): string {
    assertSafeKey(key);
    const full = resolve(join(this.root, key));
    if (!full.startsWith(this.root + sep)) throw new Error(`storage key escapes the store: ${key}`);
    return full;
  }
  async put(key: string, bytes: Uint8Array): Promise<void> {
    const p = this.path(key);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, bytes);
  }
  async get(key: string): Promise<Uint8Array> {
    return new Uint8Array(await readFile(this.path(key)));
  }
  async removePrefix(prefix: string): Promise<void> {
    await rm(this.path(prefix.replace(/\/$/, "")), { recursive: true, force: true });
  }
}

const globalForStore = globalThis as unknown as { shiftbookStore?: DocumentStore };
export const documentStore: DocumentStore = globalForStore.shiftbookStore ?? new LocalDocumentStore(env.storageDir);
globalForStore.shiftbookStore = documentStore;
