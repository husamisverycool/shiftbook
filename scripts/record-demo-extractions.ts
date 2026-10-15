/**
 * Records real readings of the demo's sample photos and PDF, once, so demo mode can replay them with
 * no outside calls. Needs ANTHROPIC_API_KEY in the environment (set in the cloud environment's
 * settings, never in a file). Writes demo/recordings/<request-hash>.json; commit them.
 *   pnpm tsx scripts/record-demo-extractions.ts
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CLIENTS, CURRENT_PERIOD } from "../src/server/demo/dataset";
import { createImageReader } from "../src/server/extraction/pipeline";
import { closeOcr } from "../src/server/extraction/redact";
import { AnthropicTransport, RecordingTransport } from "../src/server/extraction/transport";
import { classifyUpload } from "../src/server/intake/service";
import { LocalDocumentStore } from "../src/server/storage";

const SAMPLES = `demo/samples/${CURRENT_PERIOD.startsOn}`;
const OUT = "demo/recordings";

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("No API key in this environment; add ANTHROPIC_API_KEY in the cloud environment settings and start a new session.");
    process.exit(1);
  }
  const reader = createImageReader({
    transport: new RecordingTransport(new AnthropicTransport(), OUT),
    store: new LocalDocumentStore(".storage-recording"),
  });
  // Same order as the app (sorted), so the recorded request hashes match what the app sends.
  const clients = Object.values(CLIENTS).map((c) => c.name).sort();
  for (const file of readdirSync(SAMPLES).sort()) {
    const type = classifyUpload(file);
    if (!type || (type.kind !== "image" && type.kind !== "pdf")) continue;
    const result = await reader.read({
      agencyId: "00000000-0000-4000-a000-000000000000",
      documentId: file.replace(/[^A-Za-z0-9]+/g, "-"),
      filename: file,
      mediaType: type.mediaType,
      bytes: readFileSync(join(SAMPLES, file)),
      period: { startsOn: CURRENT_PERIOD.startsOn, endsOn: CURRENT_PERIOD.endsOn },
      clients,
    });
    const review = result.parsed.entries.filter((e) => e.checks.length > 0).length;
    console.log(`${file}: ${result.parsed.entries.length} rows read, ${review} flagged by the comparison`);
  }
  await closeOcr();
}

void main();
