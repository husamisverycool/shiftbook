/**
 * Every string in both languages (SPEC §20): the same keys, the same placeholders, valid messages,
 * and Spanish in one voice — formal "usted", one word per idea, US digit grouping (slice l).
 */
import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import es from "../../messages/es.json";

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  for (const [k, v] of Object.entries(tree)) {
    if (typeof v === "string") out.set(prefix + k, v);
    else for (const [kk, vv] of flatten(v, `${prefix}${k}.`)) out.set(kk, vv);
  }
  return out;
}

/**
 * The argument names a message uses, with each plural/select argument's branch selectors, read the
 * way ICU reads it (a quote before a brace starts literal text; branches are messages of their own).
 */
function argumentsOf(message: string): string[] {
  const names = new Set<string>();
  let i = 0;
  const space = () => {
    while (/\s/.test(message[i] ?? "")) i++;
  };
  const word = () => {
    space();
    const m = /^[^\s{},]+/.exec(message.slice(i));
    i += m ? m[0].length : 0;
    return m ? m[0] : "";
  };
  // Reads text up to the closing brace of the current level (or the end).
  const text = (): void => {
    while (i < message.length && message[i] !== "}") {
      const c = message[i]!;
      if (c === "'" && message[i + 1] === "'") i += 2;
      else if (c === "'" && /[{}#|]/.test(message[i + 1] ?? "")) {
        const end = message.indexOf("'", i + 1);
        i = end === -1 ? message.length : end + 1;
      } else if (c === "{") argument();
      else i++;
    }
  };
  const argument = (): void => {
    i++; // {
    const name = word();
    space();
    if (message[i] === ",") {
      i++;
      const type = word();
      space();
      if (["plural", "select", "selectordinal"].includes(type) && message[i] === ",") {
        i++;
        const selectors: string[] = [];
        for (;;) {
          space();
          if (message[i] === "}" || i >= message.length) break;
          const selector = word();
          if (selector.startsWith("offset:")) continue;
          selectors.push(selector);
          space();
          i++; // {
          text();
          i++; // }
        }
        names.add(`${name}:${type}[${selectors.sort().join("|")}]`);
      } else {
        names.add(`${name}:${type}`);
        let depth = 1;
        while (i < message.length && depth > 0) {
          if (message[i] === "{") depth++;
          if (message[i] === "}") depth--;
          if (depth > 0) i++;
        }
      }
    } else names.add(name);
    space();
    i++; // }
  };
  while (i < message.length) {
    text();
    if (message[i] === "}") i++;
  }
  return [...names].sort();
}

const EN = flatten(en as unknown as Tree);
const ES = flatten(es as unknown as Tree);

describe("messages", () => {
  it("Spanish has exactly the English keys", () => {
    expect([...ES.keys()].filter((k) => !EN.has(k))).toEqual([]);
    expect([...EN.keys()].filter((k) => !ES.has(k))).toEqual([]);
  });

  it("each Spanish message uses the English one's placeholders", () => {
    const different = [...EN].filter(([k, v]) => ES.has(k) && argumentsOf(v).join() !== argumentsOf(ES.get(k)!).join()).map(([k]) => k);
    expect(different).toEqual([]);
  });

  it("every message in both languages is a valid message", () => {
    for (const [locale, messages, flat] of [["en", en, EN], ["es", es, ES]] as const) {
      const problems: string[] = [];
      const t = createTranslator({ locale, messages: messages as unknown as Tree, onError: (e) => problems.push(e.message), getMessageFallback: ({ key }) => key });
      for (const [key, text] of flat) {
        // Every argument as a number works for plurals, selects take "other", tags are functions.
        const values = Object.fromEntries(argumentsOf(text).map((a) => [a.split(":")[0]!, 1]));
        const tags = Object.fromEntries([...text.matchAll(/<(\w+)>/g)].map((m) => [m[1]!, (chunks: unknown) => chunks]));
        try {
          if (Object.keys(tags).length > 0) (t.rich as (k: string, v: object) => unknown)(key, { ...values, ...tags });
          else (t as unknown as (k: string, v: object) => string)(key, values);
        } catch (e) {
          problems.push(`${key}: ${(e as Error).message}`);
        }
      }
      expect(problems.filter((p) => !/MISSING_MESSAGE/.test(p)), locale).toEqual([]);
    }
  });

  describe("Spanish in one voice", () => {
    /** Informal "tú" words, and imperatives in the "tú" form where a sentence starts. */
    // "ven" and "sal" are left out: "se ven" (are seen) and "sal" are not always the informal voice.
    const TU = /(?<![\p{L}])(tú|tu|tus|te|ti|contigo|puedes|tienes|quieres|debes|eres|estás|necesitas|sabes|vas|hazlo|haz)(?![\p{L}])/iu;
    // Informal commands where a sentence starts ("Corrige" and "Termina" also name what a record does).
    const TU_COMMAND =
      /(^|[.!?¿¡:]\s+)(Revisa|Agrega|Añade|Sube|Suelta|Escribe|Abre|Vuelve|Comunícate|Intenta|Selecciona|Usa|Guarda|Crea|Edita|Elimina|Cambia|Descarga|Importa|Aprueba|Confirma|Pide|Busca|Marca|Elige|Ingresa|Explica|Págales|Archívalo|Ábrelo|Inténtalo|Espera|Lee|Mira|Recuerda|Asegúrate)(?![\p{L}])/u;
    const OLD_TERMS: [RegExp, string][] = [
      [/colocaci[oó]n(?!.*\bagencia de colocaci)/i, "asignación (placement)"],
      [/\bcorridas?\b/i, "nómina semanal (weekly run)"],
      [/\bperíodos?\b/i, "periodo"],
      [/tareas de cumplimiento/i, "obligaciones de cumplimiento"],
      [/hojas? de tiempo/i, "hoja de horas"],
      [/pago igual|igualdad de pago/i, "igualdad salarial"],
      [/tiempo extra/i, "horas extra (overtime)"],
      [/\bajustes\b/i, "configuración (settings)"],
      [/tarifa de facturaci[oó]n/i, "tarifa de cobro (bill rate)"],
      [/\bmargen de \{percent\}|^Margen \(%\)$|un margen como/i, "recargo (markup; margen is margin)"],
    ];

    it("speaks to the reader as usted", () => {
      const informal = [...ES].filter(([, v]) => TU.test(v) || TU_COMMAND.test(v)).map(([k, v]) => `${k}: ${v}`);
      expect(informal).toEqual([]);
    });

    it("uses one word per idea", () => {
      const old = [...ES].flatMap(([k, v]) => OLD_TERMS.filter(([re]) => re.test(v) && !(k === "compliance.asks.ma_registration_renewal" && /agencia de colocaci/.test(v))).map(([, want]) => `${k}: say ${want}`));
      expect(old).toEqual([]);
    });

    it("groups thousands the US way", () => {
      expect([...ES].filter(([, v]) => /\d\.\d{3}(?!\d)/.test(v.replace(/\d+\.\d+\([a-z0-9]+\)/gi, "").replace(/§+ ?[\d.]+/g, "").replace(/\b\d{2,3}\.\d{3}\b(?=\(|\s*\()/g, ""))).map(([k, v]) => `${k}: ${v}`)).toEqual([]);
    });
  });
});
