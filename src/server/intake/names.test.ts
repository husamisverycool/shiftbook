import { describe, expect, it } from "vitest";
import { foldName, matchWorker, type RosterWorker } from "./names";

const roster: RosterWorker[] = [
  { workerId: "rj", firstName: "Robert", lastName: "Jones" },
  { workerId: "mf", firstName: "María José", lastName: "Fernández Ruiz" },
  { workerId: "jd", firstName: "Jesús", lastName: "Delgado" },
  { workerId: "kb", firstName: "Kateryna", lastName: "Bondarenko" },
  { workerId: "rc", firstName: "Rosa", lastName: "de la Cruz" },
  { workerId: "po", firstName: "Patrick", lastName: "O'Neil" },
  { workerId: "ma", firstName: "Mohammed", lastName: "Al-Amin" },
  { workerId: "al", firstName: "Andre", lastName: "Lewis" },
  { workerId: "bl", firstName: "Brianna", lastName: "Lewis" },
];
const nicknames: [string, string][] = [
  ["Bob", "Robert"],
  ["Chuy", "Jesús"],
  ["Liz", "Elizabeth"],
];

describe("foldName", () => {
  it("folds accents, case, punctuation and spacing", () => {
    expect(foldName("  María José  FERNÁNDEZ-Ruiz ")).toBe("maria jose fernandez ruiz");
    expect(foldName("O'Neil")).toBe("oneil");
    expect(foldName("Al-Amin")).toBe("al amin");
  });
});

describe("matchWorker", () => {
  const m = (written: string) => matchWorker(written, roster, nicknames);

  it("matches an exact name", () => expect(m("Robert Jones")).toMatchObject({ status: "matched", workerId: "rj", method: "exact" }));
  it("matches without accents", () => expect(m("Jesus Delgado")).toMatchObject({ status: "matched", workerId: "jd", method: "accents" }));
  it("matches 'Last, First'", () => expect(m("Jones, Robert")).toMatchObject({ status: "matched", workerId: "rj" }));
  it("matches a nickname through the agency's map", () => {
    expect(m("Bob Jones")).toMatchObject({ status: "matched", workerId: "rj", method: "nickname" });
    expect(m("Chuy Delgado")).toMatchObject({ status: "matched", workerId: "jd", method: "nickname" });
  });
  it("matches one given name and the first of two surnames", () => {
    expect(m("Maria Fernandez")).toMatchObject({ status: "matched", workerId: "mf", method: "partial" });
  });
  it("matches surname particles and punctuation", () => {
    expect(m("Rosa De La Cruz")).toMatchObject({ status: "matched", workerId: "rc" });
    expect(m("Rosa Cruz")).toMatchObject({ status: "matched", workerId: "rc" });
    expect(m("Patrick ONeil")).toMatchObject({ status: "matched", workerId: "po" });
    expect(m("Mohammed Al Amin")).toMatchObject({ status: "matched", workerId: "ma" });
  });
  it("matches an initial and surname when only one worker fits", () => {
    expect(m("K. Bondarenko")).toMatchObject({ status: "matched", workerId: "kb", method: "initial" });
  });
  it("reports ambiguity instead of guessing", () => {
    expect(m("Lewis")).toMatchObject({ status: "ambiguous", candidates: ["al", "bl"] });
  });
  it("never invents a worker for an unknown name", () => {
    expect(m("Danny Ortiz")).toEqual({ status: "unmatched", candidates: [] });
  });
  it("does not match on first name alone", () => {
    expect(m("Robert")).toEqual({ status: "unmatched", candidates: [] });
  });
});
