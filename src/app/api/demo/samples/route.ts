/** The demo's sample timesheets as one .zip (docs/patterns/_layouts/root.md, decision D6). */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { zipSync } from "fflate";
import { CURRENT_PERIOD } from "@/server/demo/dataset";
import { isDemo } from "@/server/session";

export const dynamic = "force-dynamic";

export function GET(): Response {
  if (!isDemo()) return new Response("Not found", { status: 404 });
  const dir = join(process.cwd(), "demo", "samples", CURRENT_PERIOD.startsOn);
  const folder = `shiftbook-sample-timesheets-${CURRENT_PERIOD.startsOn}`;
  const files = Object.fromEntries(readdirSync(dir).sort().map((name) => [`${folder}/${name}`, new Uint8Array(readFileSync(join(dir, name)))]));
  const zip = zipSync(files, { level: 0 });
  return new Response(new Blob([zip as BlobPart]), {
    headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${folder}.zip"` },
  });
}
