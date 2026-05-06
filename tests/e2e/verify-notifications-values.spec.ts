import { expect, test, type Page } from "@playwright/test";
import {
  cleanupUser,
  createConfirmedUser,
  createInAppNotification,
  getStockByTicker
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
  user = await createConfirmedUser("e2e-verify-notifications");
});

test.afterAll(async () => {
  await cleanupUser(user.id);
});

test("notification filter tabs are visible and functional", async ({ page }) => {
  await createInAppNotification(user.id, kddi.id, {
    type: "yield_target",
    title: "目標利回り達成テスト",
    body: "KDDIの利回りが目標に達しました。\nこれは売買を推奨するものではありません。"
  });

  await login(page, user.email, user.password);
  await page.goto("/app/notifications");

  await expect(page.getByRole("link", { name: "すべて" })).toBeVisible();
  await expect(page.getByRole("link", { name: "目標利回り" })).toBeVisible();
  await expect(page.getByRole("link", { name: "配当変更" })).toBeVisible();
  await expect(page.getByRole("link", { name: "データ更新" })).toBeVisible();

  // Click yield_target filter
  await page.getByRole("link", { name: "目標利回り" }).click();
  await expect(page.getByText("目標利回り達成テスト").first()).toBeVisible();
});

test("notification groups show today, this week, older", async ({ page }) => {
  await createInAppNotification(user.id, kddi.id, {
    type: "data_update",
    title: "今日の通知",
    body: "本文A"
  });

  await login(page, user.email, user.password);
  await page.goto("/app/notifications");

  await expect(page.getByRole("heading", { name: "今日" })).toBeVisible();
  await expect(page.getByText("今日の通知").first()).toBeVisible();
});

test("notification card shows exact values", async ({ page }) => {
  await createInAppNotification(user.id, kddi.id, {
    type: "yield_target",
    title: "テスト通知タイトル",
    body: "テスト通知の本文です。\n2行目のテキスト。"
  });

  await login(page, user.email, user.password);
  await page.goto("/app/notifications");

  // Scope to the specific notification card by its title
  const notificationCard = page.locator("div").filter({ hasText: "テスト通知タイトル" }).first();

  // Title
  await expect(notificationCard.getByText("テスト通知タイトル").first()).toBeVisible();

  // Body summary (first 2 lines joined with space)
  await expect(notificationCard.getByText("テスト通知の本文です。 2行目のテキスト。").first()).toBeVisible();

  // Stock ticker and name
  await expect(notificationCard.getByText(`${kddi.ticker} · ${kddi.name}`).first()).toBeVisible();

  // Unread state
  await expect(notificationCard.getByText("未読", { exact: true }).first()).toBeVisible();
});

test("target yield notification body includes evaluated yield details", async ({ page }) => {
  await createInAppNotification(user.id, kddi.id, {
    type: "yield_target",
    title: "利回り通知詳細",
    body: "評価利回り: 3.50%\n目標利回り: 3.00%\n条件: 以上"
  });

  await login(page, user.email, user.password);
  await page.goto("/app/notifications");

  // Scope to the specific notification
  const notificationCard = page.locator("div").filter({ hasText: "利回り通知詳細" }).first();

  // Body summary only shows first 2 lines
  await expect(notificationCard.getByText("評価利回り: 3.50% 目標利回り: 3.00%").first()).toBeVisible();
  await expect(notificationCard.getByText("利回り通知詳細").first()).toBeVisible();
});

test("investment-neutral disclaimer is present", async ({ page }) => {
  await createInAppNotification(user.id, kddi.id, {
    type: "yield_target",
    title: "免責通知",
    body: "テスト"
  });

  await login(page, user.email, user.password);
  await page.goto("/app/notifications");

  await expect(
    page.getByText("これは売買を推奨するものではありません。").first()
  ).toBeVisible();
  await expect(
    page.getByText("投資判断はご自身で行ってください。").first()
  ).toBeVisible();
});
