/**
 * The agency's nickname map (SPEC §6: "a per-agency nickname map"): which written given names stand
 * for which formal ones ("Mike" → Michael), used when timesheet names are matched to the roster. A
 * person edits it on Settings › Names, or a match in review teaches it one. Never creates a worker.
 */
import { asc, eq } from "drizzle-orm";
import { audit } from "../audit";
import type { Tx } from "../db";
import * as s from "../db/schema";
import { StaleRequestError } from "../errors";
import type { Actor } from "../session";
import { foldName, nicknameToLearn } from "./names";

export const NICKNAME_MAX = 40;

export interface Nickname {
  id: string;
  nickname: string;
  givenName: string;
}

export async function listNicknames(tx: Tx): Promise<Nickname[]> {
  const rows = await tx.select({ id: s.nicknames.id, nickname: s.nicknames.nickname, givenName: s.nicknames.givenName }).from(s.nicknames).orderBy(asc(s.nicknames.nickname), asc(s.nicknames.givenName));
  return rows;
}

export class NicknameProblemError extends Error {
  constructor(readonly problem: "blank" | "same" | "too_long" | "exists") {
    super(`Nickname refused: ${problem}.`);
    this.name = "NicknameProblemError";
  }
}

/** One written name for one given name; the same pair twice is refused, case and accents ignored. */
export async function addNickname(tx: Tx, actor: Actor, nickname: string, givenName: string, reason = "added on Settings › Names"): Promise<Nickname> {
  const nick = nickname.trim();
  const given = givenName.trim();
  if (nick === "" || given === "") throw new NicknameProblemError("blank");
  if (nick.length > NICKNAME_MAX || given.length > NICKNAME_MAX) throw new NicknameProblemError("too_long");
  if (foldName(nick) === foldName(given)) throw new NicknameProblemError("same");
  const existing = await listNicknames(tx);
  if (existing.some((n) => foldName(n.nickname) === foldName(nick) && foldName(n.givenName) === foldName(given))) throw new NicknameProblemError("exists");
  const [row] = await tx.insert(s.nicknames).values({ agencyId: actor.agencyId, nickname: nick, givenName: given }).returning({ id: s.nicknames.id });
  await audit(tx, actor, [{ action: "create", entityType: "nickname", entityId: row!.id, after: { nickname: nick, givenName: given }, reason }]);
  return { id: row!.id, nickname: nick, givenName: given };
}

export async function removeNickname(tx: Tx, actor: Actor, id: string): Promise<void> {
  const [row] = await tx.delete(s.nicknames).where(eq(s.nicknames.id, id)).returning();
  if (!row) throw new StaleRequestError();
  await audit(tx, actor, [{ action: "delete", entityType: "nickname", entityId: id, before: { nickname: row.nickname, givenName: row.givenName }, reason: "removed on Settings › Names" }]);
}

/** The nickname a match would teach: the entry's name as written against the worker it is now matched to. */
export async function nicknameFromEntry(tx: Tx, entryId: string): Promise<{ nickname: string; givenName: string; written: string; workerName: string } | null> {
  const [e] = await tx.select({ written: s.timeEntries.workerNameRaw, workerId: s.timeEntries.workerId }).from(s.timeEntries).where(eq(s.timeEntries.id, entryId));
  if (!e?.workerId) return null;
  const [w] = await tx.select({ firstName: s.workers.firstName, lastName: s.workers.lastName }).from(s.workers).where(eq(s.workers.id, e.workerId));
  if (!w) return null;
  const map = (await listNicknames(tx)).map((n) => [n.nickname, n.givenName] as [string, string]);
  const learn = nicknameToLearn(e.written, { workerId: e.workerId, firstName: w.firstName, lastName: w.lastName }, map);
  return learn ? { ...learn, written: e.written, workerName: `${w.firstName} ${w.lastName}` } : null;
}

/** Remembers the nickname a match taught (the person said yes to "Remember 'Mike' as Michael?"). */
export async function learnNickname(tx: Tx, actor: Actor, entryId: string): Promise<Nickname | null> {
  const learn = await nicknameFromEntry(tx, entryId);
  if (!learn) return null;
  return addNickname(tx, actor, learn.nickname, learn.givenName, `learned from "${learn.written}" matched to ${learn.workerName}`);
}
