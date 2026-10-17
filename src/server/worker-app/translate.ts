/**
 * Translating a message between English and Spanish (slice t; SPEC §27 item 6). The demo makes no
 * outside calls (SPEC §18): it translates only the demo's own fixed messages. The live app asks the
 * model, after taking out anything shaped like an SSN or a date of birth (CLAUDE.md: never in
 * prompts). A translation that fails is simply not shown; the message itself always goes.
 */
import Anthropic from "@anthropic-ai/sdk";
import { env } from "../env";

export type Lang = "en" | "es";

export interface Translator {
  translate(text: string, from: Lang, to: Lang): Promise<string | null>;
}

/** Nine digits shaped like an SSN, and dates (a date of birth among them), replaced before any model call. */
export function redactForModel(text: string): string {
  return text
    .replace(/(?<!\d)\d{3}[-\s_.]?\d{2}[-\s_.]?\d{4}(?!\d)/g, "[number removed]")
    .replace(/(?<!\d)\d{1,2}[/-]\d{1,2}[/-]\d{2,4}(?!\d)/g, "[date removed]")
    .replace(/(?<!\d)\d{4}-\d{2}-\d{2}(?!\d)/g, "[date removed]");
}

/** The demo's messages and their translations, [English, Spanish], both ways. */
const DEMO_PAIRS: [string, string][] = [
  ["Hi Ana, can you work Saturday 7 AM to 3:30 PM at Prairie Line?", "Hola Ana, ¿puede trabajar el sábado de 7 a. m. a 3:30 p. m. en Prairie Line?"],
  ["Yes, I can work Saturday. Do I need to bring safety boots?", "Sí, puedo trabajar el sábado. ¿Necesito llevar botas de seguridad?"],
  ["Yes, steel-toe boots please. Thank you!", "Sí, botas con punta de acero, por favor. ¡Gracias!"],
  ["Thank you. When do I get paid for this week?", "Gracias. ¿Cuándo recibo mi pago de esta semana?"],
  ["Payday is Friday. Your pay stub will be in the app.", "El día de pago es el viernes. Su talón de pago estará en la aplicación."],
];

export class DemoTranslator implements Translator {
  async translate(text: string, from: Lang, to: Lang): Promise<string | null> {
    if (from === to) return null;
    const t = text.trim();
    for (const [en, es] of DEMO_PAIRS) {
      if (from === "en" && t === en) return es;
      if (from === "es" && t === es) return en;
    }
    return null;
  }
}

export const TRANSLATION_MODEL = "claude-haiku-5-5";

export class ModelTranslator implements Translator {
  constructor(private readonly client: Anthropic = new Anthropic()) {}

  async translate(text: string, from: Lang, to: Lang): Promise<string | null> {
    if (from === to) return null;
    const names = { en: "English", es: "Spanish" };
    try {
      const response = await this.client.messages.create({
        model: TRANSLATION_MODEL,
        max_tokens: 1200,
        system: `Translate the user's message from ${names[from]} to ${names[to]}. It is a short message between a temporary worker and their staffing agency. Reply with the translation only. Keep [number removed] and [date removed] as they are.`,
        messages: [{ role: "user", content: redactForModel(text) }],
      });
      const out = response.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
      return out || null;
    } catch {
      return null;
    }
  }
}

export const translator = (): Translator => (env.mode === "demo" ? new DemoTranslator() : new ModelTranslator());
