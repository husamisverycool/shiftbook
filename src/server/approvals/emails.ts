/**
 * The client approval emails (docs/patterns/_emails/approval-request.md): plain text with a simple
 * HTML copy, in the recipient's language; nothing loaded from other sites, no tracking.
 */
import { createTranslator } from "next-intl";
import en from "../../../messages/en.json";
import es from "../../../messages/es.json";
import { hoursMinutes, shortDate } from "../../components/shiftbook/format";
import type { ApprovalLocale } from "../db/schema";

const MESSAGES = { en, es } as const;

export interface EmailAgency {
  name: string;
  phone: string | null;
  email: string | null;
  /** IANA zone for dates and times in the email (the agency's time zone setting). */
  timeZone: string;
}

interface Common {
  locale: ApprovalLocale;
  agency: EmailAgency;
  clientName: string;
  period: { startsOn: string; endsOn: string };
}

export interface LinkEmailInput extends Common {
  kind: "approval_request" | "approval_reminder" | "approval_renewal";
  approverName: string;
  summary: { workers: number; shifts: number; minutes: number };
  link: string;
  expiresAt: Date;
}

export interface DecisionEmailInput extends Common {
  kind: "approval_confirmation" | "approval_notice";
  typedName: string;
  approverEmail: string;
  decidedAt: Date;
  approved: { shifts: number; minutes: number };
  disputed: { workerName: string; workDate: string; reason: string }[];
  /** The request in Tabulado (agency notice only). */
  agencyLink?: string;
}

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

const escapeHtml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

function translator(locale: ApprovalLocale) {
  return createTranslator({ locale, messages: MESSAGES[locale], namespace: "approvalEmail" });
}

function periodText(locale: ApprovalLocale, period: Common["period"]) {
  return new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" }).formatRange(day(period.startsOn), day(period.endsOn));
}

const longDay = (locale: ApprovalLocale, iso: string) => new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" }).format(day(iso));

function contactOf(agency: EmailAgency) {
  return [agency.phone, agency.email].filter((v): v is string => Boolean(v)).join(", ");
}

/** Paragraphs → text and HTML; a paragraph may hold a link (the one button). */
export type Block = { text: string } | { link: string; label: string } | { list: string[] };

export function assemble(subject: string, blocks: Block[]): RenderedEmail {
  const text = blocks
    .map((b) => ("text" in b ? b.text : "link" in b ? `${b.label}: ${b.link}` : b.list.map((line) => `- ${line}`).join("\n")))
    .join("\n\n");
  const html = [
    `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(subject)}</title></head><body>`,
    ...blocks.map((b) =>
      "text" in b
        ? `<p>${escapeHtml(b.text)}</p>`
        : "link" in b
          ? `<p><a href="${escapeHtml(b.link)}">${escapeHtml(b.label)}</a></p>`
          : `<ul>${b.list.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>`,
    ),
    "</body></html>",
  ].join("");
  return { subject, text: `${text}\n`, html };
}

export function renderLinkEmail(input: LinkEmailInput): RenderedEmail {
  const t = translator(input.locale);
  const start = longDay(input.locale, input.period.startsOn);
  const end = longDay(input.locale, input.period.endsOn);
  const subject = t(`subject.${input.kind}`, { client: input.clientName, period: periodText(input.locale, input.period), disputed: 0 });
  const expires = new Intl.DateTimeFormat(input.locale, { dateStyle: "long", timeZone: input.agency.timeZone }).format(input.expiresAt);
  const contact = contactOf(input.agency);
  return assemble(subject, [
    { text: t("greeting", { name: input.approverName }) },
    { text: t(`intro.${input.kind}`, { agency: input.agency.name, client: input.clientName, start, end }) },
    { text: t("summary", { workers: input.summary.workers, shifts: input.summary.shifts, hours: hoursMinutes(input.summary.minutes) }) },
    { link: input.link, label: t("open") },
    { text: t("expires", { date: expires }) },
    ...(contact ? [{ text: t("contact", { agency: input.agency.name, contact }) }] : []),
    { text: t("footer", { agency: input.agency.name }) },
  ]);
}

export function renderDecisionEmail(input: DecisionEmailInput): RenderedEmail {
  const t = translator(input.locale);
  const start = longDay(input.locale, input.period.startsOn);
  const end = longDay(input.locale, input.period.endsOn);
  const subject = t(`subject.${input.kind}`, { client: input.clientName, period: periodText(input.locale, input.period), disputed: input.disputed.length });
  const when = new Intl.DateTimeFormat(input.locale, { dateStyle: "long", timeStyle: "short", timeZone: input.agency.timeZone }).format(input.decidedAt);
  const who = { when, name: input.typedName, email: input.approverEmail, client: input.clientName, start, end };
  const contact = contactOf(input.agency);
  const blocks: Block[] = [
    { text: input.approved.shifts > 0 ? t("decided", { ...who, shifts: input.approved.shifts, hours: hoursMinutes(input.approved.minutes) }) : t("nothingApproved", who) },
  ];
  if (input.disputed.length > 0) {
    blocks.push({ text: t("disputedTitle", { agency: input.agency.name }) });
    blocks.push({ list: input.disputed.map((d) => t("disputedLine", { worker: d.workerName, date: shortDate(d.workDate, input.locale), reason: d.reason })) });
  }
  if (input.kind === "approval_confirmation") {
    blocks.push({ text: t("changeHint", { agency: input.agency.name }) });
    if (contact) blocks.push({ text: t("contact", { agency: input.agency.name, contact }) });
  } else if (input.agencyLink) {
    blocks.push({ text: t("noticeOpen", { link: input.agencyLink }) });
  }
  blocks.push({ text: t("footer", { agency: input.agency.name }) });
  return assemble(subject, blocks);
}
