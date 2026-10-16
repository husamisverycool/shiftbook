import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ABILITIES, can, readsOnly, ROLES, type Ability } from "./permissions";

describe("what each role may change (SPEC §2)", () => {
  it("the Owner does everything", () => {
    for (const a of Object.keys(ABILITIES) as Ability[]) expect(can({ role: "owner" }, a)).toBe(true);
  });

  it("the accountant reads everything (the margin too) and changes nothing", () => {
    expect(readsOnly({ role: "accountant" })).toBe(true);
    expect(can({ role: "accountant" }, "viewMargin")).toBe(true);
    for (const role of ROLES.filter((r) => r !== "accountant")) expect(readsOnly({ role })).toBe(false);
  });

  it("a coordinator: intake and hours, placements, their compliance duties; no run approval, money, settings or margin", () => {
    const yes = (Object.keys(ABILITIES) as Ability[]).filter((a) => can({ role: "coordinator" }, a));
    expect(yes.sort()).toEqual(["compliance", "hours", "placements"]);
  });

  it("billing: client billing, cash, their compliance duties; no hours, run, settings or margin", () => {
    const yes = (Object.keys(ABILITIES) as Ability[]).filter((a) => can({ role: "billing" }, a));
    expect(yes.sort()).toEqual(["cash", "clientBilling", "compliance"]);
  });
});

/** Every server action file, read as text: each exported action names who may run it. */
function actionFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return actionFiles(path);
    return /\.(ts|tsx)$/.test(name) && readFileSync(path, "utf8").startsWith('"use server"') ? [path] : [];
  });
}

describe("every server action checks the table first", () => {
  const files = actionFiles(join(__dirname, "../app"));

  it("finds the action files", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  // An action either asks for an ability (actorAllowedTo("…")), is one of the person's own settings
  // (currentActor("setup") / their own session), is a client's link (the portal), or only reads.
  const READS = new Set(["entryHistory"]);
  const OWN = new Set(["resetDemoAction"]);
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    if (file.includes("(portal)") || file.includes("(auth)")) continue;
    const actions = [...text.matchAll(/export async function (\w+)\(/g)].map((m) => [m[1]!, m.index!] as const);
    for (const [name, at] of actions) {
      it(`${file.split("/app/")[1]} ${name}`, () => {
        const next = actions.find(([, i]) => i > at)?.[1] ?? text.length;
        const body = text.slice(at, next);
        if (READS.has(name) || OWN.has(name) || file.includes("settings/account")) return;
        expect(body).toMatch(/(?:actorAllowedTo|run|withFile)\("(\w+)"/);
        const ability = /(?:actorAllowedTo|run|withFile)\("(\w+)"/.exec(body)![1]!;
        expect(Object.keys(ABILITIES)).toContain(ability);
      });
    }
  }
});
