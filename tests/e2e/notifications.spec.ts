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
  user = await createConfirmedUser("e2e-notifications");
  kddi = await getStockByTicker("9433");
});

test.afterAll(async () => {
  await cleanupUser(user.id);
});

test("notification list shows unread state and can mark a single notification as read", async ({
  page
}) => {
  await createInAppNotification(user.id, kddi.id, {
    type: "yield_target",
    title: "目標利回り達成",
    body: "KDDIの利回りが目標に達しました。\nこれは売買を推奨するものではありません。"
  });

  await login(page, user.email, user.password);
  await page.goto("/app/notifications");

  await expect(page.getByText("目標利回り達成")).toBeVisible();
  await expect(page.getByText("未読")).toBeVisible();

  await page.getByRole("button", { name: "既読にする", exact: true }).click();

  await expect(page.getByText("既読").first()).toBeVisible();
  await expect(page.getByText("未読").first()).not.toBeVisible();
});

test("mark all notifications as read clears all unread states", async ({ page }) => {
  await createInAppNotification(user.id, kddi.id, {
    type: "yield_target",
    title: "通知A",
    body: "本文A"
  });
  await createInAppNotification(user.id, kddi.id, {
    type: "data_update",
    title: "通知B",
    body: "本文B"
  });

  await login(page, user.email, user.password);
  await page.goto("/app/notifications");

  await expect(page.getByRole("button", { name: "すべて既読にする" })).toBeVisible();

  await page.getByRole("button", { name: "すべて既読にする" }).click();

  await expect(page.getByText("未読").first()).not.toBeVisible();
  await expect(page.getByRole("button", { name: "すべて既読にする" })).not.toBeVisible();
});

test("notification list investment-neutral disclaimer is visible", async ({ page }) => {
  await createInAppNotification(user.id, kddi.id, {
    type: "yield_target",
    title: "利回り通知",
    body: "テスト本文"
  });

  await login(page, user.email, user.password);
  await page.goto("/app/notifications");

  await expect(page.getByText("これは売買を推奨するものではありません。", { exact: false }).first()).toBeVisible();
});
