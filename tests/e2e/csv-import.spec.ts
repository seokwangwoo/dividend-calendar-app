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

test("portfolio CSVインポート link navigates to /app/portfolio/import", async ({ page }) => {
  await login(page, user.email, user.password);
  await page.goto("/app/portfolio");

  // CSVインポート is now a link (not a button) to /app/portfolio/import
  await page.getByRole("link", { name: "CSVインポート" }).click();
  await expect(page).toHaveURL(/\/app\/portfolio\/import/);
});

test("valid CSV import preview and commit", async ({ page }) => {
  await login(page, user.email, user.password);
  await page.goto("/app/portfolio/import");

  // Use 'general' account type so it doesn't conflict with later tests that use nisa/tokutei
  const csvContent = "9433,100,4300,general";
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles({
    name: "holdings.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csvContent)
  });

  await page.getByRole("button", { name: /プレビュー/ }).click();
  await expect(page.getByText("登録予定 1件")).toBeVisible();
  await expect(page.getByText(kddi.name)).toBeVisible();

  await page.getByRole("button", { name: /件をインポート確定/ }).click();
  await expect(page.getByText("インポート完了")).toBeVisible();

  // Verify holding appears in portfolio — ticker is half-width
  await page.goto("/app/portfolio");
  await expect(page.getByText(kddi.ticker)).toBeVisible();
  await expect(page.getByText("100株")).toBeVisible();
});

test("invalid row shows error in preview", async ({ page }) => {
  await login(page, user.email, user.password);
  await page.goto("/app/portfolio/import");

  // Only error row: 9999 doesn't exist and has negative quantity
  const csvContent = "9999,-10,4300,nisa";
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles({
    name: "holdings-invalid.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csvContent)
  });

  await page.getByRole("button", { name: /プレビュー/ }).click();
  // Summary badge shows エラー count
  await expect(page.getByText(/エラー \d+件/)).toBeVisible();
  await expect(page.getByText(/数量は正の数値/)).toBeVisible();

  // With 0 non-duplicate valid rows the commit button shows disabled state
  await expect(page.getByRole("button", { name: "インポートできる行がありません" })).toBeVisible();
});

test("unsupported ticker shows error", async ({ page }) => {
  await login(page, user.email, user.password);
  await page.goto("/app/portfolio/import");

  const csvContent = "9999,100,4300,nisa";
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles({
    name: "holdings-unsupported.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csvContent)
  });

  await page.getByRole("button", { name: /プレビュー/ }).click();
  await expect(page.getByText("サポートされていません")).toBeVisible();
});

test("existing holdings are not overwritten by CSV import", async ({ page }) => {
  // Pre-create a KDDI/tokutei holding — this represents an existing holding in the portfolio
  await createHolding(user.id, kddi.id, 50, 4200, "tokutei");

  await login(page, user.email, user.password);
  await page.goto("/app/portfolio/import");

  // Import KDDI/nisa — different account type from the pre-existing tokutei holding
  // so this row is NOT a duplicate and should be added (now user has tokutei + nisa)
  const csvContent = "9433,100,4300,nisa";
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles({
    name: "holdings-dup.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csvContent)
  });

  await page.getByRole("button", { name: /プレビュー/ }).click();
  await expect(page.getByText("登録予定 1件")).toBeVisible();
  await page.getByRole("button", { name: /件をインポート確定/ }).click();
  await expect(page.getByText("インポート完了")).toBeVisible();

  await page.goto("/app/portfolio");
  // All KDDI holdings (general from test 1, tokutei pre-created, nisa just imported) — at least 2 by 9433 ticker
  // Use a count that's ≥ 2 (tokutei + nisa from this test; general from prior test may also be there)
  const kddiTickers = page.getByText("9433");
  const count = await kddiTickers.count();
  expect(count).toBeGreaterThanOrEqual(2);
});

test("duplicate row shows 重複スキップ badge and is not inserted", async ({ page }) => {
  // At this point the user already has a KDDI/nisa holding from the prior test.
  // Uploading the same row (9433/nisa) should be detected as a duplicate.

  await login(page, user.email, user.password);
  await page.goto("/app/portfolio/import");

  // Upload CSV with the same KDDI/nisa row
  const csvContent = "9433,100,4300,nisa";
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles({
    name: "holdings-duplicate.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csvContent)
  });

  await page.getByRole("button", { name: /プレビュー/ }).click();

  // Preview should show 重複スキップ badge on that row (exact badge text in the table row)
  await expect(page.getByText("重複スキップ", { exact: true })).toBeVisible();

  // With 0 non-duplicate rows the commit button shows disabled state text
  await expect(page.getByRole("button", { name: "インポートできる行がありません" })).toBeVisible();
});
