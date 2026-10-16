/**
 * How an extraction pass reaches a model. One interface, three implementations:
 * - AnthropicTransport: the real API (structured output, server-side fallback on a policy decline).
 * - RecordedTransport: replays answers recorded earlier, keyed by a hash of the exact request.
 *   Demo mode and tests use it, so the demo makes no outside calls yet runs the same code path.
 * - RecordingTransport: wraps a live transport and saves each answer for later replay.
 */
import { NO_RECORDING_PREFIX } from "@/lib/no-recording";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { ExtractionOutputSchema, type ExtractionOutput } from "./output-schema";

export interface PassRequest {
  pass: "A" | "B";
  model: string;
  promptVersion: string;
  system: string;
  instructions: string;
  image: { mediaType: "image/jpeg"; base64: string };
}

export interface ExtractionTransport {
  run(request: PassRequest): Promise<ExtractionOutput>;
}

export function requestHash(r: PassRequest): string {
  const imageSha = createHash("sha256").update(r.image.base64).digest("hex");
  return createHash("sha256")
    .update(JSON.stringify({ pass: r.pass, model: r.model, promptVersion: r.promptVersion, system: r.system, instructions: r.instructions, imageSha }))
    .digest("hex");
}

export class ExtractionRefusedError extends Error {
  /** Retrying gives the same answer: the job fails at once. */
  readonly permanent = true;
  constructor(detail: string) {
    super(`The model declined to read this document (${detail}). It needs to be entered by hand.`);
    this.name = "ExtractionRefusedError";
  }
}

export class AnthropicTransport implements ExtractionTransport {
  constructor(private readonly client: Anthropic = new Anthropic()) {}

  async run(r: PassRequest): Promise<ExtractionOutput> {
    const response = await this.client.beta.messages.parse({
      model: r.model,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { format: betaZodOutputFormat(ExtractionOutputSchema), effort: "high" },
      system: r.system,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: r.image.mediaType, data: r.image.base64 } },
            { type: "text", text: r.instructions },
          ],
        },
      ],
    });
    if (response.stop_reason === "refusal") {
      throw new ExtractionRefusedError(response.stop_details?.category ?? "no category given");
    }
    if (!response.parsed_output) throw new Error(`The reading came back incomplete (stop reason: ${response.stop_reason}).`);
    return ExtractionOutputSchema.parse(response.parsed_output);
  }
}

export class RecordingMissingError extends Error {
  readonly permanent = true;
  constructor(hash: string) {
    super(
      `${NO_RECORDING_PREFIX}, and there is no recorded reading for this page (${hash.slice(0, 12)}…).`,
    );
    this.name = "RecordingMissingError";
  }
}

interface Recording {
  hash: string;
  pass: "A" | "B";
  model: string;
  promptVersion: string;
  output: ExtractionOutput;
}

export class RecordedTransport implements ExtractionTransport {
  constructor(private readonly dir: string) {}

  async run(r: PassRequest): Promise<ExtractionOutput> {
    const hash = requestHash(r);
    const file = join(this.dir, `${hash}.json`);
    if (!existsSync(file)) throw new RecordingMissingError(hash);
    const recording = JSON.parse(await readFile(file, "utf8")) as Recording;
    return ExtractionOutputSchema.parse(recording.output);
  }
}

export class RecordingTransport implements ExtractionTransport {
  constructor(
    private readonly inner: ExtractionTransport,
    private readonly dir: string,
  ) {}

  async run(r: PassRequest): Promise<ExtractionOutput> {
    const output = await this.inner.run(r);
    const hash = requestHash(r);
    await mkdir(this.dir, { recursive: true });
    const recording: Recording = { hash, pass: r.pass, model: r.model, promptVersion: r.promptVersion, output };
    await writeFile(join(this.dir, `${hash}.json`), JSON.stringify(recording, null, 2) + "\n");
    return output;
  }
}
