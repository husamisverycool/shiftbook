/**
 * Where an installed package's own files are (fonts, models). Inside the Next.js server bundle,
 * module resolution gives back a module id instead of a path, so after the caller's own resolvers
 * (written with a literal name, which the bundler can follow) the project's node_modules is tried;
 * the first folder that holds the given file wins.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";

type Resolver = () => string;

export function packageDir(name: string, holds: string, resolvers: Resolver[] = []): string {
  for (const resolve of [...resolvers, () => join(process.cwd(), "node_modules", name)]) {
    try {
      const dir = resolve();
      if (typeof dir === "string" && existsSync(join(dir, holds))) return dir;
    } catch {
      // try the next place
    }
  }
  throw new Error(`${name} is not installed, so its ${holds} cannot be found.`);
}
