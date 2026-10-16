/**
 * Slice (k) step 1 in the browser (decisions 0025, 0026): the gate to sign-in; the Owner invites a
 * coordinator through the demo mailbox; they join, set up the authenticator (the code computed from the
 * setup key), sign out and back in with the code; a wrong code and a locked login are refused; the
 * accountant sees no change buttons; a password reset through the demo mailbox; the language
 * preference; accessibility on every new screen, in English and Spanish.
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { base32Decode, hotp, stepAt } from "../../src/server/auth/totp";

type Messages = typeof import("../../messages/en.json");
const en = JSON.parse(readFileSync("messages/en.json", "utf8")) as Messages;
const es = JSON.parse(readFileSync("messages/es.json", "utf8")) as Messages;
const PASSWORD = "correct horse battery staple";
/** A fresh address each run: the throttle remembers wrong passwords per email for 15 minutes. */
const CASEY = `casey.${Date.now()}@cedarrow.example.com`;

async function check(page: Page, where: string) {
  // Let toasts and dialogs finish moving: mid-animation colours are half-transparent.
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const serious = result.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${where}: ${v.id} — ${v.help} (${v.nodes.map((n) => n.target.join(" ")).join(", ")})`)).toEqual([]);
}

/** A browser with nobody signed in. */
async function signedOut(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  return context.newPage();
}

/** The code the authenticator would show, `ahead` steps from now (a step is never accepted twice). */
const codeFrom = (setupKey: string, ahead = 0) => hotp(base32Decode(setupKey.replace(/\s+/g, "")), stepAt(Math.floor(Date.now() / 1000)) + ahead);

test.beforeAll(() => {
  execSync("pnpm exec tsx scripts/demo-reset.ts", { stdio: "ignore" });
});

test("nobody gets past sign-in without a session; the demo people continue without a password", async ({ browser }) => {
  const page = await signedOut(browser);
  await page.goto("/en/job-orders");
  await expect(page).toHaveURL(/\/en\/sign-in\?next=%2Fjob-orders$/);
  await expect(page.getByRole("heading", { level: 1, name: en.signIn.title })).toBeVisible();
  await check(page, "sign-in");
  // A file route answers the same way.
  const api = await page.request.get("/api/files/receivables", { maxRedirects: 0 });
  expect([302, 303, 307, 308]).toContain(api.status());
  // Wrong password: one message, whatever was wrong.
  await page.getByTestId("email").fill("owner@cedarrow.example.com");
  await page.getByTestId("password").fill("not the password at all");
  await page.getByTestId("sign-in").click();
  await expect(page.getByTestId("sign-in-error")).toHaveText(en.signIn.invalid);
  await page.getByTestId("continue-owner").click();
  await expect(page).toHaveURL(/\/en\/job-orders$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  // Spanish sign-in page.
  const es1 = await signedOut(browser);
  await es1.goto("/es/sign-in");
  await expect(es1.getByRole("heading", { level: 1, name: es.signIn.title })).toBeVisible();
  await expect(es1.getByTestId("continue-accountant")).toContainText("Morgan Ellis");
  await check(es1, "inicio de sesión");
});

test("the Owner invites a coordinator; they join, set up the authenticator, sign out and in with the code; wrong codes and too many tries are refused", async ({ page, browser }) => {
  // The Owner: Members, Invite.
  await page.goto("/en/settings/members");
  await expect(page.getByRole("heading", { level: 1, name: en.members.title })).toBeVisible();
  await check(page, "members");
  await page.getByTestId("invite-member").click();
  await page.getByTestId("invite-name").fill("Casey Rivera");
  await page.getByTestId("invite-email").fill(CASEY);
  await page.getByTestId("role-coordinator").check();
  await check(page, "invite dialog");
  await page.getByTestId("send-invite").click();
  // The demo sends no email: the demo mailbox's copy opens with the link.
  const copy = page.getByTestId("demo-invite-copy");
  await expect(copy).toBeVisible();
  const link = await copy.getByTestId("email-link").getAttribute("href");
  expect(link).toMatch(/\/en\/invite\/sbau_/);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("member").filter({ hasText: CASEY }).getByTestId("member-status")).toHaveText(en.members.statusLabels.invited);

  // Casey, in another browser: join with a password.
  const casey = await signedOut(browser);
  await casey.goto(link!);
  await expect(casey.getByRole("heading", { level: 1, name: en.invite.title.replace("{agency}", "Cedar Row Staffing (demo)") })).toBeVisible();
  await check(casey, "invite");
  await casey.getByTestId("new-password").fill("too short");
  await casey.getByTestId("confirm-password").fill("too short");
  await casey.getByTestId("password-submit").click();
  await expect(casey.getByTestId("password-error")).toHaveText(en.newPassword.errors.too_short);
  await casey.getByTestId("new-password").fill(PASSWORD);
  await casey.getByTestId("confirm-password").fill(PASSWORD);
  await casey.getByTestId("password-submit").click();

  // A coordinator needs the authenticator before the app opens.
  await expect(casey).toHaveURL(/\/en\/sign-in\/setup$/);
  await expect(casey.getByTestId("setup-qr")).toBeVisible();
  await check(casey, "authenticator setup");
  await casey.getByTestId("show-setup-key").click();
  const setupKey = (await casey.getByTestId("setup-key").textContent())!;
  await casey.getByTestId("setup-code").fill("000000");
  await casey.getByTestId("setup-verify").click();
  await expect(casey.getByTestId("setup-error")).toHaveText(en.setup.invalid);
  await casey.getByTestId("setup-code").fill(codeFrom(setupKey));
  await casey.getByTestId("setup-verify").click();
  await expect(casey.getByTestId("recovery-code-item")).toHaveCount(10);
  const recovery = await casey.getByTestId("recovery-code-item").allTextContents();
  await check(casey, "recovery codes");
  await casey.getByTestId("codes-saved").click();
  await expect(casey).toHaveURL(/\/en\/convert$/);

  // Sign out from the agency menu.
  await casey.getByTestId("agency-menu").click();
  await expect(casey.getByTestId("menu-person")).toHaveText("Casey Rivera · Coordinator");
  await casey.getByTestId("menu-sign-out").click();
  await expect(casey).toHaveURL(/\/en\/sign-in\?notice=signed_out$/);
  await expect(casey.getByTestId("sign-in-notice")).toHaveText(en.signIn.notice.signed_out);

  // Sign in: password, then the code (a wrong one first).
  await casey.goto("/en/invoices");
  await casey.getByTestId("email").fill(CASEY);
  await casey.getByTestId("password").fill(PASSWORD);
  await casey.getByTestId("sign-in").click();
  await expect(casey).toHaveURL(/\/en\/sign-in\/code\?next=%2Finvoices$/);
  await check(casey, "code");
  await casey.getByTestId("code").fill("000000");
  await expect(casey.getByTestId("code-error")).toHaveText(en.signInCode.invalid);
  // The setup's own code was used once; the next step's code is new.
  await casey.getByTestId("code").fill(codeFrom(setupKey, 1));
  await expect(casey).toHaveURL(/\/en\/invoices$/);

  // A recovery code works once, and the next page says how many are left.
  await casey.getByTestId("agency-menu").click();
  await casey.getByTestId("menu-sign-out").click();
  await casey.getByTestId("email").fill(CASEY);
  await casey.getByTestId("password").fill(PASSWORD);
  await casey.getByTestId("sign-in").click();
  await casey.getByTestId("toggle-recovery").click();
  await casey.getByTestId("recovery-code").fill(recovery[0]!);
  await casey.getByTestId("code-submit").click();
  await expect(casey).toHaveURL(/\/en\/convert$/);
  await expect(casey.getByText("You signed in with a recovery code. 9 codes are left.")).toBeVisible();

  // Too many wrong passwords from one place: even the right one waits. (The address comes from the
  // proxy in front of the app; here the test plays that proxy.)
  const someone = await (await browser.newContext({ storageState: { cookies: [], origins: [] }, extraHTTPHeaders: { "x-forwarded-for": "203.0.113.9" } })).newPage();
  await someone.goto("/en/sign-in");
  await someone.getByTestId("email").fill(CASEY);
  for (let i = 0; i < 10; i += 1) {
    await someone.getByTestId("password").fill(`wrong password number ${i}`);
    await someone.getByTestId("sign-in").click();
    await expect(someone.getByTestId("sign-in-error")).toHaveText(en.signIn.invalid);
    // The refused password is cleared.
    await expect(someone.getByTestId("password")).toHaveValue("");
  }
  // Now even the right password waits.
  await someone.getByTestId("password").fill(PASSWORD);
  await someone.getByTestId("sign-in").click();
  await expect(someone.getByTestId("sign-in-error")).toContainText(en.signIn.locked);

  // The Owner suspends Casey: signed out at once.
  await page.reload();
  const row = page.getByTestId("member").filter({ hasText: CASEY });
  await expect(row.getByTestId("member-status")).toHaveText(en.members.statusLabels.active);
  await row.getByTestId("member-menu").click();
  await page.getByTestId("suspend").click();
  await page.getByTestId("confirm-member-action").click();
  await expect(row.getByTestId("member-status")).toHaveText(en.members.statusLabels.suspended);
  await casey.goto("/en/convert");
  await expect(casey).toHaveURL(/\/en\/sign-in\?notice=expired$/);
});

test("the accountant reads everything and sees no change buttons", async ({ browser }) => {
  const page = await signedOut(browser);
  await page.goto("/en/sign-in");
  await page.getByTestId("continue-accountant").click();
  await expect(page).toHaveURL(/\/en\/convert$/);
  await page.getByTestId("agency-menu").click();
  await expect(page.getByTestId("menu-person")).toHaveText("Morgan Ellis (demo) · Accountant");
  await page.keyboard.press("Escape");
  await page.goto("/en/settings/members");
  await expect(page.getByTestId("member").first()).toBeVisible();
  await expect(page.getByTestId("invite-member")).toHaveCount(0);
  await expect(page.getByTestId("member-menu")).toHaveCount(0);
  await expect(page.getByText(en.members.ownerOnly)).toBeVisible();
  // Job orders and timesheets: readable, with no change controls and a line saying who changes them.
  await page.goto("/en/job-orders");
  await expect(page.getByText(en.jobOrders.readOnly)).toBeVisible();
  await expect(page.getByRole("button", { name: en.jobOrders.create })).toHaveCount(0);
  await page.goto("/en/convert");
  await page.getByRole("link", { name: en.landing.start }).first().click();
  await expect(page.getByText(en.convert.readOnly)).toBeVisible();
  await expect(page.getByTestId("drop-zone")).toHaveCount(0);
  await check(page, "convert, read only");
  // The margin is theirs to read.
  await page.goto("/en/margin");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("a password reset through the demo mailbox, and the language preference", async ({ browser }) => {
  // Rosa (billing) sets a password in her account first: the demo people have none.
  const page = await signedOut(browser);
  await page.goto("/en/sign-in");
  await page.getByTestId("continue-billing").click();
  await expect(page).toHaveURL(/\/en\/convert$/);
  await page.goto("/en/settings/account");
  await expect(page.getByRole("heading", { level: 1, name: en.account.title })).toBeVisible();
  await check(page, "account");
  await page.getByTestId("new-password").fill(PASSWORD);
  await page.getByTestId("confirm-password").fill(PASSWORD);
  await page.getByTestId("password-submit").click();
  await expect(page.getByText(en.account.passwordSaved)).toBeVisible();

  // Language: Spanish, then back.
  await page.getByTestId("language").selectOption("es");
  await expect(page).toHaveURL(/\/es\/settings\/account$/);
  await expect(page.getByRole("heading", { level: 1, name: es.account.title })).toBeVisible();
  await check(page, "cuenta");
  await page.getByTestId("language").selectOption("en");
  await expect(page).toHaveURL(/\/en\/settings\/account$/);

  // Forgot password: the reset email's copy, then a new password.
  const other = await signedOut(browser);
  await other.goto("/en/sign-in");
  await other.getByTestId("email").fill("billing@cedarrow.example.com");
  await other.getByTestId("forgot").click();
  await expect(other.getByTestId("reset-email")).toHaveValue("billing@cedarrow.example.com");
  await check(other, "reset");
  await other.getByTestId("reset-send").click();
  await expect(other.getByRole("heading", { level: 1, name: en.reset.sentTitle })).toBeVisible();
  const resetLink = await other.getByTestId("demo-reset-copy").getByTestId("email-link").getAttribute("href");
  expect(resetLink).toMatch(/\/en\/sign-in\/reset\/sbau_/);
  await other.goto(resetLink!);
  await expect(other.getByRole("heading", { level: 1, name: en.newPassword.title })).toBeVisible();
  await check(other, "new password");
  await other.getByTestId("new-password").fill("another long passphrase");
  await other.getByTestId("confirm-password").fill("another long passphrase, not the same");
  await other.getByTestId("password-submit").click();
  await expect(other.getByTestId("password-error")).toHaveText(en.newPassword.mismatch);
  await other.getByTestId("confirm-password").fill("another long passphrase");
  await other.getByTestId("password-submit").click();
  await expect(other).toHaveURL(/\/en\/convert$/);
  // The link worked once.
  await other.goto(resetLink!);
  await expect(other.getByTestId("link-gone")).toBeVisible();
  await check(other, "link gone");
});
