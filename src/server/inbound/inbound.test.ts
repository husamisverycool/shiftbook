import { createHmac, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { addressOf, emailOf, newInboundToken, tokenFromRecipients } from "./address";
import { normalizeSender, senderAllowed } from "./senders";
import { verifyWebhook } from "./signature";
import { forwardedWeek } from "./week";

describe("the forwarding address", () => {
  it("is timesheets+<20 base32 letters>@<domain>, unguessable and different each time", () => {
    const a = newInboundToken();
    const b = newInboundToken();
    expect(a).toMatch(/^[a-z2-7]{20}$/);
    expect(a).not.toBe(b);
    expect(addressOf(a, "in.example.com")).toBe(`timesheets+${a}@in.example.com`);
  });

  it("finds the token among the recipients, whatever the case or display name, only at the inbound domain", () => {
    const token = "abcdefghijklmnopqrst";
    expect(tokenFromRecipients([`"Timesheets" <Timesheets+ABCDEFGHIJKLMNOPQRST@In.Example.com>`], "in.example.com")).toBe(token);
    expect(tokenFromRecipients(["someone@else.com", `timesheets+${token}@in.example.com`], "in.example.com")).toBe(token);
    expect(tokenFromRecipients([`timesheets+${token}@evil.example.com`], "in.example.com")).toBeNull();
    expect(tokenFromRecipients([`timesheets+short@in.example.com`], "in.example.com")).toBeNull();
    expect(tokenFromRecipients([`timesheets+${token}x@in.example.com`], "in.example.com")).toBeNull();
    expect(tokenFromRecipients([], "in.example.com")).toBeNull();
  });

  it("reads the address out of a display form", () => {
    expect(emailOf(`"Pat Lee" <Pat.Lee@Prairie.example.com>`)).toBe("pat.lee@prairie.example.com");
    expect(emailOf("pat@x.com")).toBe("pat@x.com");
    expect(emailOf("not an address")).toBeNull();
  });
});

describe("the webhook signature (Svix, as Resend signs)", () => {
  // A fresh secret each run, shaped as Resend's: "whsec_" and base64 key bytes.
  const keyBytes = randomBytes(24);
  const secret = ["whsec", keyBytes.toString("base64")].join("_");
  const sign = (id: string, ts: string, body: string) => `v1,${createHmac("sha256", keyBytes).update(`${id}.${ts}.${body}`).digest("base64")}`;
  const now = new Date("2026-10-17T15:00:00Z");
  const ts = String(Math.floor(now.getTime() / 1000));
  const body = '{"type":"email.received"}';

  it("accepts a good signature, also as one of several", () => {
    expect(verifyWebhook(secret, { id: "msg_1", timestamp: ts, signature: sign("msg_1", ts, body) }, body, now)).toBe(true);
    expect(verifyWebhook(secret, { id: "msg_1", timestamp: ts, signature: `v1,AAAA ${sign("msg_1", ts, body)}` }, body, now)).toBe(true);
  });

  it("refuses a changed body, id or time, an old or future time, a missing header and a missing secret", () => {
    const sig = sign("msg_1", ts, body);
    expect(verifyWebhook(secret, { id: "msg_1", timestamp: ts, signature: sig }, body + " ", now)).toBe(false);
    expect(verifyWebhook(secret, { id: "msg_2", timestamp: ts, signature: sig }, body, now)).toBe(false);
    const old = String(Math.floor(now.getTime() / 1000) - 301);
    expect(verifyWebhook(secret, { id: "msg_1", timestamp: old, signature: sign("msg_1", old, body) }, body, now)).toBe(false);
    const ahead = String(Math.floor(now.getTime() / 1000) + 301);
    expect(verifyWebhook(secret, { id: "msg_1", timestamp: ahead, signature: sign("msg_1", ahead, body) }, body, now)).toBe(false);
    expect(verifyWebhook(secret, { id: "msg_1", timestamp: ts, signature: null }, body, now)).toBe(false);
    expect(verifyWebhook(secret, { id: null, timestamp: ts, signature: sig }, body, now)).toBe(false);
    expect(verifyWebhook(secret, { id: "msg_1", timestamp: "soon", signature: sig }, body, now)).toBe(false);
    expect(verifyWebhook(null, { id: "msg_1", timestamp: ts, signature: sig }, body, now)).toBe(false);
    expect(verifyWebhook("", { id: "msg_1", timestamp: ts, signature: sig }, body, now)).toBe(false);
    expect(verifyWebhook(secret, { id: "msg_1", timestamp: ts, signature: "v2,abc" }, body, now)).toBe(false);
  });
});

describe("senders (Ramp's receipt forwarding)", () => {
  it("takes an address or a domain, written any way, and refuses anything else", () => {
    expect(normalizeSender(" Pat.Lee@Prairie.example.com ")).toBe("pat.lee@prairie.example.com");
    expect(normalizeSender("@prairie.example.com")).toBe("@prairie.example.com");
    expect(normalizeSender("prairie.example.com")).toBe("@prairie.example.com");
    expect(normalizeSender("not a sender")).toBeNull();
    expect(normalizeSender("")).toBeNull();
    expect(normalizeSender("a@b")).toBeNull();
  });

  it("with no list anyone who has the address may send; with a list only those, and only when the sender is proven (DMARC pass)", () => {
    expect(senderAllowed([], "anyone@x.com", null)).toBe(true);
    const list = ["pat.lee@prairie.example.com", "@harborview.example.com"];
    expect(senderAllowed(list, "Pat.Lee@prairie.example.com", { dmarc: "pass" })).toBe(true);
    expect(senderAllowed(list, "ops@harborview.example.com", { dmarc: "pass" })).toBe(true);
    expect(senderAllowed(list, "ops@sub.harborview.example.com", { dmarc: "pass" })).toBe(false);
    expect(senderAllowed(list, "pat.lee@prairie.example.com", { dmarc: "fail" })).toBe(false);
    expect(senderAllowed(list, "pat.lee@prairie.example.com", { dmarc: "gray" })).toBe(false);
    expect(senderAllowed(list, "pat.lee@prairie.example.com", null)).toBe(false);
    expect(senderAllowed(list, "someone@else.com", { dmarc: "pass" })).toBe(false);
  });
});

describe("which week an email goes to", () => {
  it("the week that ended most recently before the day it arrived", () => {
    expect(forwardedWeek("2026-10-17", 1)).toBe("2026-10-05"); // a Saturday: the week before this one
    expect(forwardedWeek("2026-10-12", 1)).toBe("2026-10-05"); // the Monday after
    expect(forwardedWeek("2026-10-11", 1)).toBe("2026-09-28"); // the Sunday that ends a week: still that week, so the one before
    expect(forwardedWeek("2026-10-17", 0)).toBe("2026-10-04"); // Sunday-start weeks
  });
});
