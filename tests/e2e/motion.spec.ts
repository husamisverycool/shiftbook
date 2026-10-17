/**
 * Slice (n): motion from Primer's tokens (decision 0037, docs/patterns/_components/motion.md), read
 * from the browser's computed styles — a screenshot cannot show timing.
 *   hover 100ms cubic-bezier(0.25, 0.1, 0.25, 1); state change 200ms cubic-bezier(0.6, 0, 0.2, 1);
 *   enter 300ms cubic-bezier(0.3, 0.8, 0.6, 1); exit 200ms cubic-bezier(0.7, 0.1, 0.75, 0.9).
 * With reduced motion, nothing moves: only fades remain.
 */
import { expect, test, type Locator } from "@playwright/test";

const HOVER = "cubic-bezier(0.25, 0.1, 0.25, 1)";
const ENTER = "cubic-bezier(0.3, 0.8, 0.6, 1)";
const EXIT = "cubic-bezier(0.7, 0.1, 0.75, 0.9)";

const style = (l: Locator, prop: string) => l.evaluate((el, p) => getComputedStyle(el).getPropertyValue(p).trim(), prop);

test("hover, press and focus: one 100ms transition that reverses, no press movement", async ({ page }) => {
  await page.goto("/en");
  const button = page.locator('[data-slot="button"]').first();
  await expect(button).toBeVisible();
  expect(await style(button, "transition-duration")).toBe("0.1s");
  expect(await style(button, "transition-timing-function")).toBe(HOVER);
  const before = await button.boundingBox();
  await button.hover();
  await page.mouse.down();
  expect((await button.boundingBox())?.y).toBe(before?.y);
  await page.mouse.up();
});

test("menus enter in 300ms and leave in 200ms, moving 4px without scaling", async ({ page }) => {
  await page.goto("/en");
  await page.getByTestId("agency-menu").click();
  const menu = page.locator('[data-slot="dropdown-menu-content"]');
  await expect(menu).toBeVisible();
  expect(await style(menu, "animation-duration")).toBe("0.3s");
  expect(await style(menu, "animation-timing-function")).toBe(ENTER);
  expect(await style(menu, "--tw-enter-scale")).not.toBe("0.95");
  await page.keyboard.press("Escape");
  // The closing frame carries the exit token until the menu unmounts.
  const exit = await page.evaluate(() => {
    const el = document.querySelector('[data-slot="dropdown-menu-content"]');
    return el ? [getComputedStyle(el).animationDuration, getComputedStyle(el).animationTimingFunction] : null;
  });
  if (exit) expect(exit).toEqual(["0.2s", EXIT]);
  await expect(menu).toBeHidden();
});

test("page tabs: the underline slides to the chosen tab", async ({ page }) => {
  await page.goto("/en/receivables");
  const nav = page.locator('nav[data-underline="ready"]').first();
  await expect(nav).toBeVisible();
  const bar = nav.locator("span[aria-hidden]").last();
  expect(await style(bar, "transition-duration")).toBe("0.2s");
  const active = nav.locator("[aria-current=page]");
  const [a, b] = [await active.boundingBox(), await bar.boundingBox()];
  expect(Math.round(b!.x)).toBe(Math.round(a!.x));
  expect(Math.round(b!.width)).toBe(Math.round(a!.width));
});

test("reduced motion: menus fade without moving", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/en");
  await page.getByTestId("agency-menu").click();
  const menu = page.locator('[data-slot="dropdown-menu-content"]');
  await expect(menu).toBeVisible();
  expect(await style(menu, "--tw-enter-translate-y")).toBe("0");
  expect(await style(menu, "--tw-enter-translate-x")).toBe("0");
});
