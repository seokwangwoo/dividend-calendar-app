import { expect, test, type Page } from "@playwright/test";
import {
  cleanupUser,
  createConfirmedUser,
  createHolding,
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
  user = await createConfirmedUser("e2e-portfolio");
  kddi = await getStockByTicker("9433");
});

test.afterAll(async () => {
  await cleanupUser(user.id);
});

test.describe.serial("holding edit and delete", () => {
  test.beforeAll(async () => {
    await createHolding(user.id, kddi.id, 100, 4300, "nisa");
  });

  test("user can edit holding quantity", async ({ page }) => {
    await login(page, user.email, user.password);
    await page.goto("/app/portfolio");
    await expect(page.getByText("100株")).toBeVisible();

    await page.getByText(kddi.name).click();
    await expect(page).toHaveURL(/\/app\/portfolio\/.+\/edit/);

    await page.getByLabel("保有数量").fill("200");
    await page.getByRole("button", { name: "保存" }).click();

    await expect(page).toHaveURL(/\/app\/portfolio$/);
    await expect(page.getByText("200株")).toBeVisible();
  });

  test("user can soft delete a holding and it disappears from portfolio", async ({ page }) => {
    await login(page, user.email, user.password);
    await page.goto("/app/portfolio");
    await expect(page.getByText(kddi.name)).toBeVisible();

    await page.getByText(kddi.name).click();
    await expect(page).toHaveURL(/\/app\/portfolio\/.+\/edit/);

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "この保有情報を削除" }).click();

    await expect(page).toHaveURL(/\/app\/portfolio$/);
    await expect(page.getByText("保有銘柄がありません")).toBeVisible();
  });
});

test("portfolio account type filter shows only matching holdings", async ({ page }) => {
  await createHolding(user.id, kddi.id, 100, 4300, "nisa");
  await createHolding(user.id, kddi.id, 50, 4100, "tokutei");

  await login(page, user.email, user.password);
  await page.goto("/app/portfolio");

  // All filter: both holdings visible
  await expect(page.getByText("100株")).toBeVisible();
  await expect(page.getByText("50株")).toBeVisible();

  // NISA filter: only 100株 holding
  await page.getByRole("button", { name: "NISA" }).click();
  await expect(page.getByText("100株")).toBeVisible();
  await expect(page.getByText("50株")).not.toBeVisible();

  // 特定口座 filter: only 50株 holding
  await page.getByRole("button", { name: "特定口座" }).click();
  await expect(page.getByText("50株")).toBeVisible();
  await expect(page.getByText("100株")).not.toBeVisible();

  // Back to all
  await page.getByRole("button", { name: "すべて" }).click();
  await expect(page.getByText("100株")).toBeVisible();
  await expect(page.getByText("50株")).toBeVisible();
});
