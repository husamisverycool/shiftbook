import { describe, expect, it } from "vitest";
import { appHref, isSiteHost, otherLanguagePath, sitePageHref, siteHosts, siteRoute } from "./site-routing";

describe("the website's host (slice aa)", () => {
  const hosts = siteHosts(" Tabulado.com , www.tabulado.com,");

  it("reads the setting as lower-case host names", () => {
    expect(hosts).toEqual(["tabulado.com", "www.tabulado.com"]);
    expect(siteHosts(undefined)).toEqual([]);
  });

  it("knows its hosts, with or without a port, and nothing else", () => {
    expect(isSiteHost("tabulado.com", hosts)).toBe(true);
    expect(isSiteHost("WWW.tabulado.com:443", hosts)).toBe(true);
    expect(isSiteHost("app.tabulado.com", hosts)).toBe(false);
    expect(isSiteHost(null, hosts)).toBe(false);
  });

  it("serves its pages at short addresses, in English and Spanish", () => {
    expect(siteRoute("/")).toEqual({ kind: "rewrite", to: "/en/site" });
    expect(siteRoute("/pricing")).toEqual({ kind: "rewrite", to: "/en/site/pricing" });
    expect(siteRoute("/security/")).toEqual({ kind: "rewrite", to: "/en/site/security" });
    expect(siteRoute("/en")).toEqual({ kind: "rewrite", to: "/en/site" });
    expect(siteRoute("/es")).toEqual({ kind: "rewrite", to: "/es/site" });
    expect(siteRoute("/es/pricing")).toEqual({ kind: "rewrite", to: "/es/site/pricing" });
  });

  it("keeps the free tools, and sends everything else to the product", () => {
    expect(siteRoute("/tools/il-720-hours")).toEqual({ kind: "pass" });
    expect(siteRoute("/es/tools/il-720-hours")).toEqual({ kind: "pass" });
    expect(siteRoute("/en/sign-in")).toEqual({ kind: "app" });
    expect(siteRoute("/invoices")).toEqual({ kind: "app" });
    expect(siteRoute("/pricingx")).toEqual({ kind: "app" });
    expect(siteRoute("/english")).toEqual({ kind: "app" });
  });

  it("links the way the reader's host serves the pages", () => {
    const site = { onSiteHost: true, locale: "en" as const, appUrl: "https://app.tabulado.com" };
    expect(sitePageHref(site, "")).toBe("/");
    expect(sitePageHref(site, "/pricing")).toBe("/pricing");
    expect(sitePageHref(site, "/pricing", "es")).toBe("/es/pricing");
    expect(appHref(site, "/sign-up")).toBe("https://app.tabulado.com/en/sign-up");
    const app = { onSiteHost: false, locale: "es" as const, appUrl: "https://app.tabulado.com" };
    expect(sitePageHref(app, "")).toBe("/es/site");
    expect(sitePageHref(app, "/security", "en")).toBe("/en/site/security");
    expect(appHref(app, "/sign-up")).toBe("/es/sign-up");
  });

  it("finds the same page in the other language on either host", () => {
    expect(otherLanguagePath("/")).toBe("/es");
    expect(otherLanguagePath("/pricing")).toBe("/es/pricing");
    expect(otherLanguagePath("/es")).toBe("/");
    expect(otherLanguagePath("/es/security")).toBe("/security");
    expect(otherLanguagePath("/en/site/pricing")).toBe("/es/site/pricing");
    expect(otherLanguagePath("/es/site")).toBe("/en/site");
  });
});
