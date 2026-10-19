/**
 * The site passkeys belong to (decision 0032): in live mode always SHIFTBOOK_APP_URL, whatever Host
 * header a request claims (and none without it: the actions refuse in plain words); in demo mode the
 * page's own address when no app URL is set. The request's headers are the ones the actions read.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const request = vi.hoisted(() => ({ headers: new Headers() }));
vi.mock("next/headers", () => ({ headers: async () => request.headers }));

import { env } from "../env";
import { currentPasskeySite, passkeySite } from "./passkey-site";

const saved = { mode: env.mode, appUrl: env.appUrl };
afterEach(() => {
  Object.assign(env, saved);
  request.headers = new Headers();
});

describe("the site passkeys belong to", () => {
  it("live mode: the app's own URL, even when the request's Host and protocol say another site", async () => {
    Object.assign(env, { mode: "live", appUrl: "https://app.example" });
    request.headers = new Headers({ host: "evil.example", "x-forwarded-proto": "https" });
    expect(await currentPasskeySite()).toEqual({ id: "app.example", origin: "https://app.example", name: "Tabulado" });
  });

  it("live mode without SHIFTBOOK_APP_URL: none, never the request's Host", async () => {
    Object.assign(env, { mode: "live", appUrl: null });
    request.headers = new Headers({ host: "evil.example" });
    expect(await currentPasskeySite()).toBeNull();
    expect(passkeySite("https://evil.example", { mode: "live", appUrl: null })).toBeNull();
  });

  it("demo mode: the app's URL when set, otherwise the page's own address", async () => {
    Object.assign(env, { mode: "demo", appUrl: null });
    request.headers = new Headers({ host: "localhost:3600" });
    expect(await currentPasskeySite()).toEqual({ id: "localhost", origin: "http://localhost:3600", name: "Tabulado" });
    expect(passkeySite("http://localhost:3600", { mode: "demo", appUrl: "https://demo.example" })).toEqual({ id: "demo.example", origin: "https://demo.example", name: "Tabulado" });
    expect(passkeySite(null, { mode: "demo", appUrl: null })).toBeNull();
  });
});
