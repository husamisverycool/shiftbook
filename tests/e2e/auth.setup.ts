/** Signs in as the demo Owner through the sign-in page's "Continue as" (decision K3) and keeps the session for the other tests. */
import { expect, test as setup } from "@playwright/test";
import { OWNER_STATE } from "../../playwright.config";

setup("continue as the demo Owner", async ({ page }) => {
  await page.goto("/en/convert");
  await expect(page).toHaveURL(/\/en\/sign-in\?next=%2Fconvert$/);
  await page.getByTestId("continue-owner").click();
  await expect(page).toHaveURL(/\/en\/convert$/);
  await page.context().storageState({ path: OWNER_STATE });
});
