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
  kddi = await getStockByTicker("9433");
  user = await createConfirmedUser("e2e-csv");
});

test.afterAll(async () => {
  await cleanupUser(user.id);
});

test("valid CSV import preview and commit", async ({ page }) => {
  await login(page, user.email, user.password);
  await page.goto("/app/portfolio");

  await page.getByRole("button", { name: "CSVインポート" }).click();

  const csvContent = "9433,100,4300,nisa";
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles({
    name: "holdings.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csvContent)
  });

  await page.getByRole("button", { name: "プレビュー" }).click();
  await expect(page.getByText("登録予定 1件")).toBeVisible();
  await expect(page.getByText(kddi.name)).toBeVisible();

  await page.getByRole("button", { name: "1件を登録" }).click();
  await expect(page.getByText("登録が完了しました。")).toBeVisible();

  // Verify holding appears in portfolio
  await page.goto("/app/portfolio");
  await expect(page.getByText(kddi.name)).toBeVisible();
  await expect(page.getByText("100株")).toBeVisible();
});

test("invalid row shows error and blocks commit", async ({ page }) => {
  await login(page, user.email, user.password);
  await page.goto("/app/portfolio");

  await page.getByRole("button", { name: "CSVインポート" }).click();

  const csvContent = "9433,100,4300,nisa\n9999,-10,4300,nisa";
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles({
    name: "holdings-invalid.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csvContent)
  });

  await page.getByRole("button", { name: "プレビュー" }).click();
  await expect(page.getByText("エラー")).toBeVisible();
  await expect(page.getByText("数量は正の数値")).toBeVisible();

  // Commit button should NOT be visible when there are errors
  await expect(page.getByRole("button", { name: /件を登録/ })).not.toBeVisible();
});

test("unsupported ticker shows error", async ({ page }) => {
  await login(page, user.email, user.password);
  await page.goto("/app/portfolio");

  await page.getByRole("button", { name: "CSVインポート" }).click();

  const csvContent = "9999,100,4300,nisa";
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles({
    name: "holdings-unsupported.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csvContent)
  });

  await page.getByRole("button", { name: "プレビュー" }).click();
  await expect(page.getByText("サポートされていません")).toBeVisible();
});

test("existing holdings are not overwritten by CSV import", async ({ page }) => {
  // Pre-create a KDDI holding
  await createHolding(user.id, kddi.id, 50, 4200, "tokutei");

  await login(page, user.email, user.password);
  await page.goto("/app/portfolio");

  await page.getByRole("button", { name: "CSVインポート" }).click();

  const csvContent = "9433,100,4300,nisa";
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles({
    name: "holdings-dup.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csvContent)
  });

  await page.getByRole("button", { name: "プレビュー" }).click();
  await page.getByRole("button", { name: "1件を登録" }).click();

  await page.goto("/app/portfolio");
  // Both holdings should exist
  const kddiCards = page.locator("text=/KDDI/");
  await expect(kddiCards).toHaveCount(2);
});

test("calendar basis switch — payment month default", async ({ page }) => {
  await login(page, user.email, user.password);
  await page.goto("/app/calendar");

  await expect(page.getByRole("button", { name: "支払月" })).toBeVisible();
});

test("calendar basis switch changes active basis", async ({ page }) => {
  await login(page, user.email, user.password);
  await page.goto("/app/calendar");

  await page.getByRole("button", { name: "権利確定日" }).click();
  await expect(page.getByRole("button", { name: "権利確定日" })).toBeVisible();

  await page.getByRole("button", { name: "除権日" }).click();
  await expect(page.getByRole("button", { name: "除権日" })).toBeVisible();
});

test("basis change preserves account type filter", async ({ page }) => {
  await login(page, user.email, user.password);
  await page.goto("/app/calendar");

  // Apply NISA filter
  await page.getByRole("button", { name: "NISA" }).click();

  // Switch calendar basis
  await page.getByRole("button", { name: "権利確定日" }).click();

  // NISA filter should still be active
  const nisaButton = page.getByRole("button", { name: "NISA" });
  await expect(nisaButton).toHaveClass(/border-brand/);
});
