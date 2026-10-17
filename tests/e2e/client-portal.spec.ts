/**
 * Slice (v): the client portal, in English and Spanish. The Owner gives a person at Prairie Line the
 * portal; the demo mailbox's copy of the email opens it; the contact moves through every section,
 * asks for workers; the agency turns the request into a job order; removing access stops the link.
 * Accessibility checks on each portal section.
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const en = JSON.parse(readFileSync("messages/en.json", "utf8")) as typeof import("../../messages/en.json");
const es = JSON.parse(readFileSync("messages/es.json", "utf8")) as typeof import("../../messages/en.json");
const MESSAGES = { en, es } as const;
const PRAIRIE = "Prairie Line Manufacturing (demo)";
const AGENCY = "Cedar Row Staffing (demo)";

async function check(page: Page, where: string) {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running" || a.effect?.getTiming().iterations === Infinity));
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const serious = result.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${where}: ${v.id} — ${v.help} (${v.nodes.map((n) => n.target.join(" ")).join(", ")})`)).toEqual([]);
}

for (const locale of ["en", "es"] as const) {
  test(`a client contact uses the portal and asks for workers; the agency makes the job order (${locale})`, async ({ page, browser }) => {
    test.setTimeout(240_000);
    const m = MESSAGES[locale];
    const p = m.clientPortal;
    execSync("pnpm exec tsx scripts/demo-reset.ts", { stdio: "ignore" });

    // The Owner gives access from the client's page.
    await page.goto(`/${locale}/clients`);
    await page.getByRole("link", { name: PRAIRIE }).first().click();
    const access = page.getByTestId("portal-access");
    await expect(access.getByText(m.portalAccess.empty)).toBeVisible();
    await access.getByTestId("portal-give").click();
    await page.getByTestId("portal-name").fill("Pat Lee");
    await page.getByTestId("portal-email").fill("pat.lee@prairie.example.com");
    await page.getByTestId("portal-language").selectOption(locale);
    await page.getByTestId("portal-submit").click();
    const contact = access.getByTestId("portal-contact");
    await expect(contact).toContainText("Pat Lee");
    await expect(contact).toContainText(m.portalAccess.neverVisited);

    // The demo mailbox's copy carries the working link.
    await contact.getByTestId("portal-demo-copy").locator("summary").click();
    const href = await contact.getByTestId("portal-demo-copy").locator("a").first().getAttribute("href");
    expect(href).toMatch(new RegExp(`/${locale}/portal/sbcp_[A-Za-z0-9_-]{43}$`));
    const path = new URL(href!, "http://localhost").pathname;

    // The contact opens it with no Granite session.
    const visitor = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const client = await visitor.newPage();
    await client.goto(path);
    await expect(client.getByTestId("portal-agency")).toHaveText(AGENCY);
    await expect(client.getByTestId("portal-client")).toContainText(PRAIRIE);
    await expect(client.getByRole("heading", { level: 1, name: p.overview.title })).toBeVisible();
    await expect(client.getByTestId("portal-owed")).toBeVisible();
    await check(client, "overview");

    await client.getByTestId("portal-nav-invoices").click();
    await expect(client.getByRole("heading", { level: 1, name: p.invoices.title })).toBeVisible();
    await expect(client.getByTestId("portal-filter-unpaid")).toHaveAttribute("aria-pressed", "true");
    await check(client, "invoices");

    await client.getByTestId("portal-nav-payments").click();
    await expect(client.getByRole("heading", { level: 1, name: p.payments.title })).toBeVisible();
    await client.getByTestId("portal-nav-hours").click();
    await expect(client.getByRole("heading", { level: 1, name: p.hours.title })).toBeVisible();
    await client.getByTestId("portal-nav-documents").click();
    await expect(client.getByRole("heading", { level: 1, name: p.documents.title })).toBeVisible();
    await check(client, "documents");

    // Request workers: one step at a time, Continue checks each step.
    await client.getByTestId("portal-nav-request").click();
    await expect(client.getByRole("heading", { level: 1, name: p.request.title })).toBeVisible();
    await client.getByTestId("req-next").click();
    await expect(client.getByText(p.request.fields.position)).toBeVisible();
    await client.getByTestId("req-position").fill("Forklift operator");
    await client.getByTestId("req-headcount").fill("2");
    await client.getByTestId("req-next").click();
    await client.getByTestId("req-site-known").first().check();
    await client.getByTestId("req-next").click();
    await client.getByTestId("req-starts").fill("2027-01-04");
    await client.getByTestId("req-shift-start").fill("07:00");
    await client.getByTestId("req-shift-end").fill("15:30");
    await client.getByTestId("req-notes").fill("Steel-toe boots.");
    await client.getByTestId("req-next").click();
    await expect(client.getByTestId("req-review")).toContainText("Forklift operator");
    await check(client, "request review");
    await client.getByTestId("req-submit").click();
    const mine = client.getByTestId("portal-request-row");
    await expect(mine).toHaveCount(1);
    await expect(mine).toContainText(p.request.status.pending.replace("{agency}", AGENCY));

    // The agency sees it above its job orders and makes the job order.
    await page.goto(`/${locale}/job-orders`);
    const band = page.getByTestId("staff-requests");
    // The demo also has its own waiting request (Harborview's event servers): take this contact's.
    const request = band.getByTestId("staff-request").filter({ hasText: "Forklift operator" });
    await expect(request).toBeVisible();
    await request.getByTestId("staff-request-accept").click();
    await page.getByTestId("staff-request-accept-confirm").click();
    await expect(page.getByText(m.staffRequests.created)).toBeVisible();
    await expect(page.getByTestId("staff-request").filter({ hasText: "Forklift operator" })).toHaveCount(0);
    await expect(page.getByTestId("requested-by-client").first()).toBeVisible();

    // The contact sees it accepted.
    await client.reload();
    await expect(client.getByTestId("portal-request-row")).toContainText(p.request.status.accepted);

    // The agency removes access: the link stops at once.
    await page.goto(`/${locale}/clients`);
    await page.getByRole("link", { name: PRAIRIE }).first().click();
    await page.getByTestId("portal-contact-menu").click();
    await page.getByTestId("portal-revoke").click();
    await page.getByTestId("portal-revoke-confirm").click();
    await expect(page.getByTestId("portal-access").getByText(m.portalAccess.empty)).toBeVisible();
    await client.reload();
    await expect(client.getByTestId("portal-notice")).toHaveAttribute("data-state", "revoked");
    await check(client, "revoked link");
    await visitor.close();
  });
}
