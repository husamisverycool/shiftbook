/**
 * Matching a name as written on a timesheet to the agency's roster (SPEC §6): accent folding,
 * compound surnames and surname particles, "Last, First", initials, and the agency's nickname map.
 * Never creates a worker: an unknown name is "unmatched", two possible workers is "ambiguous".
 */

export interface RosterWorker {
  workerId: string;
  firstName: string;
  lastName: string;
}

export type MatchMethod = "exact" | "accents" | "nickname" | "partial" | "initial";

export type NameMatch =
  | { status: "matched"; workerId: string; method: MatchMethod }
  | { status: "ambiguous"; candidates: string[] }
  | { status: "unmatched"; candidates: [] };

const PARTICLES = new Set(["de", "del", "la", "las", "los", "da", "das", "do", "dos", "van", "von", "der", "di", "du", "le", "st"]);

/** Lowercase, no accents, apostrophes removed, other punctuation as spaces, single spaces. */
export function foldName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const tokens = (value: string) => foldName(value).split(" ").filter(Boolean);
const significant = (ts: string[]) => ts.filter((t) => !PARTICLES.has(t));

interface Written {
  first: string[];
  last: string[];
}

/** "Last, First" or "First Middle Last" → given-name tokens and surname tokens. */
function splitWritten(written: string): Written[] {
  if (written.includes(",")) {
    const [last = "", first = ""] = written.split(",", 2);
    return [{ first: tokens(first), last: tokens(last) }];
  }
  const ts = tokens(written);
  if (ts.length < 2) return [{ first: [], last: ts }];
  // Try every split point: "Rosa De La Cruz" → first [rosa], last [de, la, cruz], etc.
  return Array.from({ length: ts.length - 1 }, (_, i) => ({ first: ts.slice(0, i + 1), last: ts.slice(i + 1) }));
}

function surnameFits(writtenLast: string[], rosterLast: string[]): boolean {
  const w = significant(writtenLast);
  const r = significant(rosterLast);
  if (w.length === 0) return false;
  // Every written surname token must be one of the roster's (compound surnames may be shortened).
  return w.every((t) => r.includes(t));
}

function givenNameFit(writtenFirst: string[], rosterFirst: string[], nicknames: Map<string, Set<string>>): MatchMethod | null {
  if (writtenFirst.length === 0) return null;
  const head = writtenFirst[0]!;
  if (writtenFirst.every((t) => rosterFirst.includes(t))) {
    return writtenFirst.length === rosterFirst.length ? "exact" : "partial";
  }
  if (head.length === 1 && rosterFirst[0]?.startsWith(head)) return "initial";
  const formal = nicknames.get(head);
  if (formal && rosterFirst.some((t) => formal.has(t))) return "nickname";
  return null;
}

export function matchWorker(written: string, roster: RosterWorker[], nicknameMap: [string, string][]): NameMatch {
  const nicknames = new Map<string, Set<string>>();
  for (const [nick, given] of nicknameMap) {
    const set = nicknames.get(foldName(nick)) ?? new Set<string>();
    set.add(foldName(given));
    nicknames.set(foldName(nick), set);
  }
  const accentless = foldName(written) === written.toLowerCase().replace(/[.,]/g, "").replace(/\s+/g, " ").trim();

  const hits = new Map<string, MatchMethod>();
  for (const worker of roster) {
    const rosterFirst = tokens(worker.firstName);
    const rosterLast = tokens(worker.lastName);
    for (const w of splitWritten(written)) {
      if (!surnameFits(w.last, rosterLast)) continue;
      if (w.first.length === 0) {
        hits.set(worker.workerId, "partial"); // surname only: kept only if unique, and never "exact"
        continue;
      }
      const fit = givenNameFit(w.first, rosterFirst, nicknames);
      if (!fit) continue;
      const surnameExact = significant(w.last).length === significant(rosterLast).length;
      let method: MatchMethod = fit === "exact" && !surnameExact ? "partial" : fit;
      if (method === "exact") {
        const writtenFolded = foldName(written).replace(/ /g, "");
        const rosterText = `${worker.firstName} ${worker.lastName}`.toLowerCase().replace(/\s+/g, "");
        const lastFirst = `${worker.lastName} ${worker.firstName}`.toLowerCase().replace(/\s+/g, "");
        const plain = written.toLowerCase().replace(/[\s,]+/g, "");
        if (plain !== rosterText && plain !== lastFirst) method = accentless && writtenFolded ? "accents" : "partial";
      }
      const previous = hits.get(worker.workerId);
      if (!previous || rank(method) < rank(previous)) hits.set(worker.workerId, method);
    }
  }

  // A surname-only reading must not be the basis of a match.
  const surnameOnly = splitWritten(written).every((w) => w.first.length === 0);
  if (hits.size === 1) {
    const [[workerId, method]] = [...hits.entries()] as [[string, MatchMethod]];
    if (surnameOnly) return { status: "ambiguous", candidates: [workerId] };
    return { status: "matched", workerId, method };
  }
  if (hits.size > 1) return { status: "ambiguous", candidates: [...hits.keys()].sort() };
  return { status: "unmatched", candidates: [] };
}

function rank(m: MatchMethod): number {
  return ["exact", "accents", "nickname", "partial", "initial"].indexOf(m);
}
