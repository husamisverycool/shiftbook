/**
 * The workers' comp packet (SPEC §16; slice j, decision J7): pay by state, class and worker with the
 * overtime and double-time premiums apart, because the premium may be left out of the premium base
 * only when the records show it "separately by employee and in summary by classification" (NCRB Basic
 * Manual Rule 2-C-2-a). The premium is the part of each overtime line above straight time, from its
 * rule's multiplier ((m − 1)/m of the pay): the lines with one multiplier are summed first, so each
 * multiplier gives one exact fraction; those are added exactly per worker and class (in lowest terms)
 * and rounded half up once;
 * straight time is the rest, so the figures add up to the pay. Workers with no class are listed
 * apart and left out of the totals (Patriot's Workers' Comp Wages report). Pure.
 */
import { formatCents, formatMoney, lowestTermsBig, roundHalfUpBig } from "@shiftbook/rules";

export interface PacketLine {
  workerId: string;
  workerName: string;
  /** The workers' comp state: the worker's own, else the worksite's. */
  state: string | null;
  classCode: string | null;
  type: string;
  minutes: number;
  amountCents: number;
  multiplier: { num: number; den: number } | null;
}

export interface PacketFigures {
  minutes: number;
  straightCents: number;
  otPremiumCents: number;
  dtPremiumCents: number;
  otherCents: number;
  totalCents: number;
}

export interface PacketRow extends PacketFigures {
  state: string;
  classCode: string;
  workerId: string;
  workerName: string;
  explain: string;
}

export interface PacketClass extends PacketFigures {
  state: string;
  classCode: string;
}

export type PacketOrder = "state" | "class";

const WORKED = new Set(["REG", "OT", "DT"]);
type Frac = { num: bigint; den: bigint };
/** x + n/d, in lowest terms (d > 0). */
const add = (x: Frac, n: bigint, d: bigint): Frac => lowestTermsBig(x.num * d + n * x.den, x.den * d);
const zero = (): Frac => ({ num: 0n, den: 1n });
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const money = (f: Frac) => formatMoney({ num: Number(f.num), den: Number(f.den) });

interface Acc {
  key: string;
  state: string | null;
  classCode: string | null;
  workerId: string;
  workerName: string;
  minutes: number;
  reg: number;
  ot: Map<string, { amount: number; m: { num: number; den: number } }>;
  dt: Map<string, { amount: number; m: { num: number; den: number } }>;
  unknown: number;
  bonusOt: number;
  other: Map<string, number>;
  total: number;
}

export function packet(lines: PacketLine[], order: PacketOrder) {
  const acc = new Map<string, Acc>();
  for (const l of lines) {
    const key = `${l.state ?? ""}|${l.classCode ?? ""}|${l.workerId}`;
    const a = acc.get(key) ?? { key, state: l.state, classCode: l.classCode, workerId: l.workerId, workerName: l.workerName, minutes: 0, reg: 0, ot: new Map(), dt: new Map(), unknown: 0, bonusOt: 0, other: new Map(), total: 0 };
    a.total += l.amountCents;
    if (WORKED.has(l.type)) a.minutes += l.minutes;
    if (l.type === "REG") a.reg += l.amountCents;
    else if (l.type === "OT" || l.type === "DT") {
      const m = l.multiplier;
      if (!m || m.num <= m.den) a.unknown += l.amountCents;
      else {
        const bucket = l.type === "OT" ? a.ot : a.dt;
        const k = `${m.num}/${m.den}`;
        const b = bucket.get(k) ?? { amount: 0, m };
        b.amount += l.amountCents;
        bucket.set(k, b);
      }
    } else if (l.type === "BONUS_OT") a.bonusOt += l.amountCents;
    else a.other.set(l.type, (a.other.get(l.type) ?? 0) + l.amountCents);
    acc.set(key, a);
  }
  const rows: PacketRow[] = [];
  const missing: { workerId: string; workerName: string; state: string | null; minutes: number; totalCents: number }[] = [];
  for (const a of acc.values()) {
    if (!a.classCode || !a.state) {
      missing.push({ workerId: a.workerId, workerName: a.workerName, state: a.state, minutes: a.minutes, totalCents: a.total });
      continue;
    }
    // One multiplier's lines: their pay × (m − 1)/m, exactly.
    const premiumOf = (b: { amount: number; m: { num: number; den: number } }) => add(zero(), BigInt(b.amount) * BigInt(b.m.num - b.m.den), BigInt(b.m.num));
    const sum = (m: Acc["ot"]) => [...m.values()].reduce((f, b) => {
      const p = premiumOf(b);
      return add(f, p.num, p.den);
    }, zero());
    const otExact = add(sum(a.ot), BigInt(a.bonusOt), 1n);
    const dtExact = sum(a.dt);
    const otPremiumCents = roundHalfUpBig(otExact.num, otExact.den);
    const dtPremiumCents = roundHalfUpBig(dtExact.num, dtExact.den);
    const otherCents = [...a.other.values()].reduce((s, v) => s + v, 0);
    const straightCents = a.total - otherCents - otPremiumCents - dtPremiumCents;
    const parts: string[] = [];
    if (a.reg !== 0) parts.push(`Regular ${formatCents(a.reg)}`);
    const premiumText = (label: string, b: { amount: number; m: { num: number; den: number } }) => {
      const share = `${b.m.num - b.m.den}/${b.m.num}`;
      const premium = premiumOf(b);
      const exact = money(premium);
      const rounded = formatCents(roundHalfUpBig(premium.num, premium.den));
      return `${label} ${formatCents(b.amount)} at ${b.m.num}/${b.m.den}, its premium (${share}) ${exact}${exact === rounded ? "" : ` → ${rounded}`}`;
    };
    for (const b of a.ot.values()) parts.push(premiumText("overtime", b));
    for (const b of a.dt.values()) parts.push(premiumText("double time", b));
    if (a.unknown !== 0) parts.push(`overtime ${formatCents(a.unknown)} with no overtime multiplier on file: counted as straight time`);
    if (a.bonusOt !== 0) parts.push(`overtime premium on bonuses ${formatCents(a.bonusOt)}`);
    if (otherCents !== 0) parts.push(`other pay ${formatCents(otherCents)} (${[...a.other.keys()].sort().join(", ")})`);
    const sumText = [`straight time ${formatCents(straightCents)}`, otPremiumCents !== 0 ? `overtime premium ${formatCents(otPremiumCents)}` : null, dtPremiumCents !== 0 ? `double-time premium ${formatCents(dtPremiumCents)}` : null, otherCents !== 0 ? `other pay ${formatCents(otherCents)}` : null].filter(Boolean).join(" + ");
    rows.push({
      state: a.state,
      classCode: a.classCode,
      workerId: a.workerId,
      workerName: a.workerName,
      minutes: a.minutes,
      straightCents,
      otPremiumCents,
      dtPremiumCents,
      otherCents,
      totalCents: a.total,
      explain: `${[...parts, `${sumText} = ${formatCents(a.total)}, each premium rounded half up once`].join("; ")}.`,
    });
  }
  const first = (r: { state: string; classCode: string }) => (order === "state" ? [r.state, r.classCode] : [r.classCode, r.state]);
  rows.sort((x, y) => cmp(first(x)[0]!, first(y)[0]!) || cmp(first(x)[1]!, first(y)[1]!) || cmp(x.workerName, y.workerName) || cmp(x.workerId, y.workerId));
  const figures = (rs: PacketFigures[]): PacketFigures => ({
    minutes: rs.reduce((s, r) => s + r.minutes, 0),
    straightCents: rs.reduce((s, r) => s + r.straightCents, 0),
    otPremiumCents: rs.reduce((s, r) => s + r.otPremiumCents, 0),
    dtPremiumCents: rs.reduce((s, r) => s + r.dtPremiumCents, 0),
    otherCents: rs.reduce((s, r) => s + r.otherCents, 0),
    totalCents: rs.reduce((s, r) => s + r.totalCents, 0),
  });
  const classes: PacketClass[] = [];
  for (const r of rows) if (!classes.some((c) => c.state === r.state && c.classCode === r.classCode)) classes.push({ state: r.state, classCode: r.classCode, ...figures(rows.filter((x) => x.state === r.state && x.classCode === r.classCode)) });
  const { minutes, straightCents, otPremiumCents, dtPremiumCents, otherCents, totalCents } = figures(rows);
  return {
    rows,
    missing: missing.sort((x, y) => cmp(x.workerName, y.workerName)),
    classes,
    totals: { minutes, straightCents, otPremiumCents, dtPremiumCents, otherCents, totalCents },
    allPayCents: totalCents + missing.reduce((s, m) => s + m.totalCents, 0),
  };
}
