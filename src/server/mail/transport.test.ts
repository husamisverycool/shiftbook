import { describe, expect, it } from "vitest";
import { newApprovalToken } from "../approvals/token";
import { MailSendError, ResendTransport, type OutgoingMail } from "./transport";

const mail = (text = "Hello"): OutgoingMail => ({
  id: "6f1e2c1a-1111-4222-8333-944455556666",
  fromName: "Cedar Row Staffing (demo)",
  replyTo: "office@cedar-row.example",
  to: { email: "approver@client.example", name: "Dana Approver" },
  subject: "Hours to approve",
  text,
  html: `<p>${text}</p>`,
});

function fakeFetch(response: { status: number; body: unknown }) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify(response.body), { status: response.status, headers: { "content-type": "application/json" } });
  };
  return { fn: fn as typeof fetch, calls };
}

describe("Resend transport (decision 0012)", () => {
  it("posts the message to Resend's emails endpoint with the key, an idempotency key and a reply-to", async () => {
    const f = fakeFetch({ status: 200, body: { id: "re-msg-1" } });
    const transport = new ResendTransport({ apiKey: "test-key-not-real", fromAddress: "approvals@granite.example", fetch: f.fn });
    expect(await transport.send(mail())).toEqual({ providerId: "re-msg-1" });
    expect(f.calls).toHaveLength(1);
    const [call] = f.calls;
    expect(call!.url).toBe("https://api.resend.com/emails");
    expect(call!.init.method).toBe("POST");
    const headers = new Headers(call!.init.headers);
    expect(headers.get("authorization")).toBe("Bearer test-key-not-real");
    expect(headers.get("content-type")).toBe("application/json");
    expect(headers.get("idempotency-key")).toBe("6f1e2c1a-1111-4222-8333-944455556666");
    expect(JSON.parse(String(call!.init.body))).toEqual({
      from: '"Cedar Row Staffing (demo) via Granite" <approvals@granite.example>',
      to: ['"Dana Approver" <approver@client.example>'],
      reply_to: "office@cedar-row.example",
      subject: "Hours to approve",
      text: "Hello",
      html: "<p>Hello</p>",
    });
  });

  it("keeps display names from breaking the address (quotes, backslashes, angle brackets, line breaks)", async () => {
    const f = fakeFetch({ status: 200, body: { id: "x" } });
    const transport = new ResendTransport({ apiKey: "k", fromAddress: "a@granite.example", fetch: f.fn });
    await transport.send({ ...mail(), fromName: 'Evil "Agency" \\ <x@y.z>\nBcc: z', to: { email: "c@d.example", name: "A <b>" } });
    const body = JSON.parse(String(f.calls[0]!.init.body)) as { from: string; to: string[] };
    expect(body.from).toBe('"Evil Agency x@y.z Bcc: z via Granite" <a@granite.example>');
    expect(body.to).toEqual(['"A b" <c@d.example>']);
  });

  it("quotes names with commas, so an agency like \"Acme Staffing, LLC\" is one name, not two addresses", async () => {
    const f = fakeFetch({ status: 200, body: { id: "x" } });
    const transport = new ResendTransport({ apiKey: "k", fromAddress: "a@granite.example", fetch: f.fn });
    await transport.send({ ...mail(), fromName: "Acme Staffing, LLC", to: { email: "c@d.example", name: "Smith, Dana" } });
    const body = JSON.parse(String(f.calls[0]!.init.body)) as { from: string; to: string[] };
    expect(body.from).toBe('"Acme Staffing, LLC via Granite" <a@granite.example>');
    expect(body.to).toEqual(['"Smith, Dana" <c@d.example>']);
  });

  it("fails with Resend's message, never repeating a link that was in the email", async () => {
    const { token } = newApprovalToken();
    const f = fakeFetch({ status: 422, body: { name: "validation_error", message: `Invalid to field near ${token}` } });
    const transport = new ResendTransport({ apiKey: "k", fromAddress: "a@granite.example", fetch: f.fn });
    const error = await transport.send(mail(`Open /approve/${token}`)).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MailSendError);
    expect((error as Error).message).toContain("422");
    expect((error as Error).message).toContain("validation_error");
    expect((error as Error).message).not.toContain(token);
  });

  it("fails clearly when the network does", async () => {
    const transport = new ResendTransport({
      apiKey: "k",
      fromAddress: "a@granite.example",
      fetch: (async () => {
        throw new TypeError("fetch failed");
      }) as typeof fetch,
    });
    await expect(transport.send(mail())).rejects.toThrow(/could not reach the email service/i);
  });

  it("refuses to start without a key or a sending address", () => {
    expect(() => new ResendTransport({ apiKey: "", fromAddress: "a@granite.example" })).toThrow(/RESEND_API_KEY/);
    expect(() => new ResendTransport({ apiKey: "k", fromAddress: "" })).toThrow(/MAIL_FROM/);
  });
});

describe("attachments (slice r: the invoice PDF, Stripe's invoice email)", () => {
  it("sends each file to Resend as base64 with its name", async () => {
    const f = fakeFetch({ status: 200, body: { id: "re-msg-2" } });
    const transport = new ResendTransport({ apiKey: "k", fromAddress: "a@sender.example", fetch: f.fn });
    await transport.send({ ...mail(), attachments: [{ filename: "invoice-ACME-1.pdf", content: new Uint8Array([37, 80, 68, 70]) }] });
    expect(JSON.parse(String(f.calls[0]!.init.body)).attachments).toEqual([{ filename: "invoice-ACME-1.pdf", content: "JVBERg==" }]);
  });

  it("sends no attachments key when there are none", async () => {
    const f = fakeFetch({ status: 200, body: { id: "x" } });
    await new ResendTransport({ apiKey: "k", fromAddress: "a@sender.example", fetch: f.fn }).send(mail());
    expect("attachments" in JSON.parse(String(f.calls[0]!.init.body))).toBe(false);
  });
});
