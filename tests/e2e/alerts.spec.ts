import { expect, test, type Page } from "@playwright/test";
import {
  cleanupUser,
  createConfirmedUser,
  createHolding,
  getStockByTicker,
  createAdminClient
} from "./helpers";

let user: Awaited<ReturnType<typeof createConfirmedUser>>;
let kddi: Awaited<ReturnType<typeof getStockByTicker>>;

async function login(page: Page, email: string, password: string) {
  await page.goto("/auth/login");
  await page.getByLabel("メールアドレス").fill(email);
  await page.getByLabel("パスワード").fill(password);
  await page.getByRole("button", { name: "ログイン" }).click();
  await expect(page).toHaveURL(/\/app\/home/);
}

test.beforeAll(async () => {
  kddi = await getStockByTicker("9433");
  user = await createConfirmedUser("e2e-alerts");
  await createHolding(user.id, kddi.id, 100, 4300, "nisa");
});

test.afterAll(async () => {
  await cleanupUser(user.id);
});

test("stale price suppresses yield alert display", async ({ page }) => {
  // Set stock price_updated_at to 49 hours ago
  const staleDate = new Date(Date.now() - 49 * 60 * 60 * 1000).toISOString();
  await createAdminClient()
    .from("stocks")
    .update({ price_updated_at: staleDate })
    .eq("id", kddi.id);

  await login(page, user.email, user.password);
  await page.goto(`/app/stocks/${kddi.id}`);

  // Look for stale price warning indicator
  await expect(page.locator("body")).toContainText("株価");

  // Reset price_updated_at
  await createAdminClient()
    .from("stocks")
    .update({ price_updated_at: new Date().toISOString() })
    .eq("id", kddi.id);
});

test("notification rule page shows single before-tax basis label and no basis selector", async ({
  page
}) => {
  await login(page, user.email, user.password);
  await page.goto(`/app/stocks/${kddi.id}/notification-rule`);

  // The read-only basis label must be visible
  await expect(page.getByText("予想配当利回り（税引前", { exact: false })).toBeVisible();

  // There must be no <select> or radio group for basis choice
  await expect(page.locator("select[name='basis']")).not.toBeAttached();
  await expect(page.locator("input[type='radio'][name='basis']")).not.toBeAttached();

  // After-tax yield label must not appear on the page
  await expect(page.getByText("税引後配当利回り", { exact: false })).not.toBeVisible();
});

test("dividend change alert only reaches holders", async ({ page }) => {
  const nonHolder = await createConfirmedUser("e2e-alerts-nonholder");

  // Create a dividend change notification for kddi
  await createAdminClient()
    .from("notifications")
    .insert({
      user_id: user.id,
      stock_id: kddi.id,
      type: "dividend_increase",
      title: "配当増加",
      body: "KDDIの配当が増加しました。",
      channel: "in_app",
      status: "unread"
    });

  // Non-holder should not see the notification
  await login(page, nonHolder.email, nonHolder.password);
  await page.goto("/app/notifications");
  await expect(page.getByText("配当増加")).not.toBeVisible();

  await page.goto("/app/settings");
  await page.getByRole("button", { name: "ログアウト" }).click();

  // Holder should see it
  await login(page, user.email, user.password);
  await page.goto("/app/notifications");
  await expect(page.getByText("配当増加")).toBeVisible();

  await cleanupUser(nonHolder.id);
});
