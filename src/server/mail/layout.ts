/**
 * Every email Tabulado sends, in one layout (docs/patterns/_emails/layout.md): Linear's and Stripe's
 * account emails, under Postmark's transactional rules — a small wordmark, short paragraphs, one button
 * with its link written out under it, a code set large on its own, a quiet footer under a hairline, a
 * preheader for the inbox preview, and a plain-text part that says the same. Nothing is loaded from
 * other sites (no images, no tracking); colours follow the reader's dark setting where the mail
 * program allows it.
 */

/** A heading (Linear's, matching the subject); a paragraph; the one button (later links are plain); a list; a code set large; the footer. */
export type Block = { heading: string } | { text: string } | { link: string; label: string } | { list: string[] } | { code: string } | { footer: string };

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

export interface LayoutOptions {
  /** The inbox preview line; without it mail programs show the first words of the body. */
  preheader?: string;
  /** The reader's language, for the words under the button. */
  locale?: string;
}

export const escapeHtml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const LINK_HINT = { en: "Or copy this link into your browser:", es: "O copie este enlace en su navegador:" } as const;

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const INK = "#18181b";
const BODY = "#3f3f46";
const MUTED = "#71717a";
const LINE = "#e4e4e7";

const STYLE = `
:root{color-scheme:light dark;supported-color-schemes:light dark}
@media (prefers-color-scheme:dark){
.tb-bg{background:#0b0b0c!important}
.tb-ink{color:#f4f4f5!important}
.tb-body{color:#d4d4d8!important}
.tb-muted{color:#a1a1aa!important}
.tb-line{border-color:#27272a!important}
.tb-code{background:#18181b!important;color:#f4f4f5!important;border-color:#27272a!important}
.tb-button{background:#f4f4f5!important;color:#0b0b0c!important}
}`;

/** The plain-text part: the same blocks, each link on its own line (Postmark). */
function textOf(blocks: Block[]): string {
  return blocks
    .map((b) => {
      if ("heading" in b) return b.heading;
      if ("text" in b) return b.text;
      if ("code" in b) return b.code;
      if ("footer" in b) return `--\n${b.footer}`;
      if ("list" in b) return b.list.map((line) => `- ${line}`).join("\n");
      return `${b.label}:\n${b.link}`;
    })
    .join("\n\n");
}

export function layout(subject: string, blocks: Block[], options: LayoutOptions = {}): RenderedEmail {
  // Links are built from the app's own address; anything else is a mistake, never sent (security review).
  for (const b of blocks) if ("link" in b && !/^https?:\/\//.test(b.link)) throw new Error("An email link must be a web address.");
  const hint = LINK_HINT[options.locale === "es" ? "es" : "en"];
  let buttons = 0;
  const parts = blocks.map((b) => {
    if ("heading" in b) return `<h1 class="tb-ink" style="margin:0 0 16px;font-size:22px;line-height:30px;font-weight:600;letter-spacing:-0.3px;color:${INK}">${escapeHtml(b.heading)}</h1>`;
    if ("text" in b) return `<p class="tb-body" style="margin:0 0 16px;font-size:15px;line-height:24px;color:${BODY}">${escapeHtml(b.text)}</p>`;
    if ("list" in b) return `<ul class="tb-body" style="margin:0 0 16px;padding-left:20px;font-size:15px;line-height:24px;color:${BODY}">${b.list.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>`;
    if ("code" in b)
      return `<p class="tb-code" style="margin:8px 0 24px;padding:16px 0;border:1px solid ${LINE};border-radius:8px;background:#f4f4f5;text-align:center;font-size:32px;line-height:40px;font-weight:600;letter-spacing:8px;color:${INK};font-family:${FONT}">${escapeHtml(b.code)}</p>`;
    if ("footer" in b) return `<p class="tb-muted tb-line" style="margin:32px 0 0;padding-top:20px;border-top:1px solid ${LINE};font-size:13px;line-height:20px;color:${MUTED}">${escapeHtml(b.footer)}</p>`;
    buttons += 1;
    if (buttons > 1) return `<p class="tb-body" style="margin:0 0 16px;font-size:15px;line-height:24px;color:${BODY}"><a href="${escapeHtml(b.link)}" style="color:${INK};text-decoration:underline">${escapeHtml(b.label)}</a></p>`;
    return [
      `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 12px"><tr><td>`,
      `<a class="tb-button" href="${escapeHtml(b.link)}" style="display:inline-block;padding:12px 20px;border-radius:8px;background:${INK};color:#ffffff;font-size:15px;line-height:20px;font-weight:600;text-decoration:none">${escapeHtml(b.label)}</a>`,
      `</td></tr></table>`,
      `<p class="tb-muted" style="margin:0 0 24px;font-size:13px;line-height:20px;color:${MUTED}">${escapeHtml(hint)}<br><a href="${escapeHtml(b.link)}" style="color:${MUTED};word-break:break-all">${escapeHtml(b.link)}</a></p>`,
    ].join("");
  });
  const preheader = options.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(options.preheader)}${"&#8199;&#847;".repeat(40)}</div>`
    : "";
  const html = [
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><title>${escapeHtml(subject)}</title><style>${STYLE}</style></head>`,
    `<body class="tb-bg" style="margin:0;padding:0;background:#ffffff;font-family:${FONT}">`,
    preheader,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="tb-bg" style="background:#ffffff"><tr><td align="center" style="padding:40px 20px">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px"><tr><td style="font-family:${FONT}">`,
    `<p class="tb-ink" style="margin:0 0 32px;font-size:17px;line-height:24px;font-weight:700;letter-spacing:-0.2px;color:${INK}">Tabulado</p>`,
    ...parts,
    `</td></tr></table></td></tr></table></body></html>`,
  ].join("");
  return { subject, text: `${textOf(blocks)}\n`, html };
}
