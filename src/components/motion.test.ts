import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Motion comes from one table (decision 0037, `docs/patterns/_components/motion.md`): Primer's hover,
 * state-change, enter and exit tokens in globals.css. A component never states its own duration or
 * curve, never animates every property, and never nudges on press.
 */
const RAW = [
  /\bduration-(\d+|\[[^\]]+\])/, // a stated duration
  /\bease-(in|out|in-out|linear|\[[^\]]+\])(?![\w-])/, // a stated curve
  /\btransition-all\b/, // animates layout too
  /\bactive:[\w:-]*translate-y-px\b/, // the press nudge
  /\bzoom-(in|out)-\d+\b/, // pop-in scaling: no reference scales menus or dialogs
];

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return files(path);
    return /\.tsx?$/.test(e.name) && !e.name.endsWith(".test.ts") ? [path] : [];
  });
}

describe("motion tokens", () => {
  it("no component states its own duration, curve or press movement", () => {
    const found: string[] = [];
    for (const file of files("src")) {
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, i) => {
          for (const re of RAW) {
            const m = line.match(re);
            if (m) found.push(`${file}:${i + 1} ${m[0]}`);
          }
        });
    }
    expect(found).toEqual([]);
  });

  it("the stylesheet holds Primer's four kinds of movement", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    for (const token of [
      "--motion-micro: 100ms",
      "--motion-short: 200ms",
      "--motion-medium: 300ms",
      "--ease-hover: cubic-bezier(0.25, 0.1, 0.25, 1)",
      "--ease-move: cubic-bezier(0.6, 0, 0.2, 1)",
      "--ease-enter: cubic-bezier(0.3, 0.8, 0.6, 1)",
      "--ease-exit: cubic-bezier(0.7, 0.1, 0.75, 0.9)",
      "prefers-reduced-motion: reduce",
    ]) {
      expect(css).toContain(token);
    }
  });
});
