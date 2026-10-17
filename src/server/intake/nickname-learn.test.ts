import { describe, expect, it } from "vitest";
import { nicknameToLearn } from "./names";

const michael = { workerId: "w1", firstName: "Michael", lastName: "Brown" };
const known: [string, string][] = [["Bob", "Robert"]];

describe("a nickname to remember when a person matches a written name to a worker (SPEC §6)", () => {
  it("offers the written given name as a nickname for the worker's given name", () => {
    expect(nicknameToLearn("Mike Brown", michael, known)).toEqual({ nickname: "Mike", givenName: "Michael" });
    expect(nicknameToLearn("Brown, Mike", michael, known)).toEqual({ nickname: "Mike", givenName: "Michael" });
  });

  it("offers nothing when the names already match, the nickname is known, it is an initial, or the surname differs", () => {
    expect(nicknameToLearn("Michael Brown", michael, known)).toBeNull();
    expect(nicknameToLearn("M. Brown", michael, known)).toBeNull();
    expect(nicknameToLearn("Mike Green", michael, known)).toBeNull();
    expect(nicknameToLearn("Bob Smith", { workerId: "w2", firstName: "Robert", lastName: "Smith" }, known)).toBeNull();
    expect(nicknameToLearn("Brown", michael, known)).toBeNull();
  });

  it("folds accents and case when comparing, and keeps the name as written", () => {
    expect(nicknameToLearn("josé brown", { workerId: "w3", firstName: "Jose", lastName: "Brown" }, known)).toBeNull();
    expect(nicknameToLearn("Lupe Hernández", { workerId: "w4", firstName: "Guadalupe", lastName: "Hernandez" }, known)).toEqual({ nickname: "Lupe", givenName: "Guadalupe" });
  });
});
