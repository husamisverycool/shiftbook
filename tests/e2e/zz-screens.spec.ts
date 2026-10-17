// Temporary: screenshots for the owner (not committed).
import { readFileSync, mkdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { test, type Page } from "@playwright/test";
import { approveAndCreateFiles, toExceptions, toTotals, uploadPrairieWeek } from "./flow";

const OUT = process.env.SHOTS_DIR!;
const en = JSON.parse(readFileSync("messages/en.json", "utf8"));
let n = 0;
async function shot(page: Page, name: string, url?: string) {
  try {
    if (url) await page.goto(url);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(600);
    n += 1;
    await page.screenshot({ path: `${OUT}/${String(n).padStart(2, "0")}-${name}.png`, fullPage: true });
  } catch (e) {
    console.log("FAILED", name, String(e).slice(0, 200));
  }
}
async function firstLink(page: Page, url: string, re: RegExp): Promise<string | null> {
  await page.goto(url);
  await page.waitForLoadState("networkidle");
  const hrefs = await page.locator("a[href]").evaluateAll((as) => as.map((a) => a.getAttribute("href") ?? ""));
  return hrefs.find((h) => re.test(h)) ?? null;
}

test("screens", async ({ page, browser }) => {
  test.setTimeout(1_200_000);
  mkdirSync(OUT, { recursive: true });
  execSync("pnpm exec tsx scripts/demo-reset.ts", { stdio: "ignore" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await shot(page, "home-before-the-week", "/en");
  const period = await uploadPrairieWeek(page, "en");
  await shot(page, "convert-hours-review", `/en/convert?period=${period}&step=hours`);
  await toExceptions(page, en);
  await shot(page, "convert-exceptions");
  await toTotals(page, en);
  await shot(page, "convert-review-totals");
  await approveAndCreateFiles(page, en);
  await shot(page, "convert-files-created");
  for (const [name, url] of [
    ["home", "/en"], ["job-orders", "/en/job-orders"], ["assignments", "/en/assignments"], ["schedule", "/en/schedule"],
    ["workers", "/en/workers"], ["clients", "/en/clients"], ["approvals", "/en/approvals"], ["invoices", "/en/invoices"],
    ["receivables", "/en/receivables"], ["payments", "/en/payments"], ["bank", "/en/bank"], ["margin", "/en/margin"],
    ["margin-overtime", "/en/margin/overtime"], ["margin-cash", "/en/margin/cash"], ["margin-attendance", "/en/margin/attendance"],
    ["compliance", "/en/compliance"], ["compliance-calendar", "/en/compliance/calendar"], ["compliance-counters", "/en/compliance/counters"],
    ["compliance-workers-comp", "/en/compliance/workers-comp"], ["compliance-aca", "/en/compliance/aca"],
    ["money", "/en/money"], ["money-payroll", "/en/money/payroll"], ["money-wage-access", "/en/money/wage-access"], ["money-funding", "/en/money/funding"], ["money-insurance", "/en/money/insurance"],
    ["notifications", "/en/notifications"], ["settings-payroll", "/en/settings/payroll"], ["settings-connections", "/en/settings/connections"],
    ["settings-collections", "/en/settings/collections"], ["settings-notifications", "/en/settings/notifications"], ["settings-members", "/en/settings/members"],
    ["settings-activity", "/en/settings/activity"], ["settings-billing", "/en/settings/billing"], ["settings-compliance", "/en/settings/compliance"],
    ["settings-margin", "/en/settings/margin"], ["settings-money", "/en/settings/money"], ["settings-account", "/en/settings/account"],
  ] as const) await shot(page, name, url);
  for (const [name, list, re] of [
    ["invoice-detail", "/en/invoices", /^\/en\/invoices\/[0-9a-f-]{36}$/],
    ["client-detail", "/en/clients", /^\/en\/clients\/[0-9a-f-]{36}$/],
    ["worker-detail", "/en/workers", /^\/en\/workers\/[0-9a-f-]{36}$/],
    ["job-order-detail", "/en/job-orders", /^\/en\/job-orders\/[0-9a-f-]{36}$/],
    ["compliance-duty", "/en/compliance", /^\/en\/compliance\/[0-9a-f-]{36}$/],
    ["approval-detail", "/en/approvals", /^\/en\/approvals\/[0-9a-f-]{36}$/],
    ["payroll-handoff", "/en/money/payroll", /^\/en\/money\/payroll\/[0-9a-f-]{36}$/],
  ] as const) {
    const href = await firstLink(page, list, re);
    if (href) await shot(page, name, href);
    else console.log("NO LINK", name);
  }
  // Menus and overlays.
  await page.goto("/en");
  await page.keyboard.press("Control+k");
  await shot(page, "command-menu");
  await page.keyboard.press("Escape");
  await page.getByTestId("agency-menu").click();
  await shot(page, "agency-menu");
  await page.keyboard.press("Escape");
  // Spanish.
  await shot(page, "home-spanish", "/es");
  await shot(page, "invoices-spanish", "/es/invoices");
  // Signed out: sign-in, sign-up, the free 720-hour checker.
  const out = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const anon = await out.newPage();
  await shot(anon, "sign-in", "/en/sign-in");
  await shot(anon, "sign-up", "/en/sign-up");
  await shot(anon, "free-720-hour-checker", "/en/tools/il-720-hours");
  try {
    await anon.getByRole("button", { name: /sample/i }).first().click({ timeout: 3000 });
    await anon.waitForTimeout(500);
    await anon.getByRole("button", { name: /check|count/i }).first().click({ timeout: 3000 });
  } catch {}
  await shot(anon, "free-720-hour-checker-results");
  // Worker app on a phone.
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const w = await phone.newPage();
  await shot(w, "worker-app-sign-in", "/en/w/sign-in");
  try {
    await w.locator("[data-testid^=continue-worker]").first().click({ timeout: 5000 });
    await w.waitForURL(/\/w($|\/)/, { timeout: 15000 });
  } catch (e) { console.log("worker sign-in", String(e).slice(0, 150)); }
  for (const [name, url] of [["worker-app-home", "/en/w"], ["worker-app-shifts", "/en/w/shifts"], ["worker-app-time", "/en/w/time"], ["worker-app-pay", "/en/w/pay"], ["worker-app-messages", "/en/w/messages"], ["worker-app-more", "/en/w/more"], ["worker-app-home-spanish", "/es/w"]] as const) await shot(w, name, url);
  // Client portal: the demo contact's link from the client page.
  const clientsHrefs = await (async () => { await page.goto("/en/clients"); await page.waitForLoadState("networkidle"); return page.locator("a[href]").evaluateAll((as) => as.map((a) => a.getAttribute("href") ?? "").filter((h) => /\/en\/clients\/[0-9a-f-]{36}$/.test(h))); })();
  let portal: string | null = null;
  for (const h of clientsHrefs) {
    await page.goto(h); await page.waitForLoadState("networkidle");
    const links = await page.locator("a[href*='/portal/']").evaluateAll((as) => as.map((a) => a.getAttribute("href") ?? ""));
    const text = await page.content();
    const m = text.match(/\/(?:en|es)\/portal\/sbcp_[A-Za-z0-9_-]+/);
    portal = links[0] ?? (m ? m[0] : null);
    if (portal) break;
  }
  if (portal) {
    const p = await out.newPage();
    const base = portal.replace(/^https?:\/\/[^/]+/, "");
    for (const [name, suffix] of [["client-portal-overview", ""], ["client-portal-invoices", "/invoices"], ["client-portal-payments", "/payments"], ["client-portal-documents", "/documents"], ["client-portal-request-workers", "/request"]] as const) await shot(p, name, base + suffix);
  } else console.log("NO PORTAL LINK");
});
