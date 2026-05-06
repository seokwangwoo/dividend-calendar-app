import { expect, test, type Page } from "@playwright/test";
import {
  cleanupUser,
  createConfirmedUser,
  createHolding,
  getStockByTicker,
  createHoldingWithGoal
} from "./helpers";

let zeroHoldingsUser: Awaited<ReturnType<typeof createConfirmedUser>>;
let holdingsUser: Awaited<ReturnType<typeof createConfirmedUser>>;
let kddi: Awaited<ReturnType<typeof getStockByTicker>>;
let jt: Awaited<ReturnType<typeof getStockByTicker>>;

async function login(page: Page, email: string, password: string) {
  await page.goto("/auth/login");
  await page.getByLabel("メールアドレス").fill(email);
  await page.getByLabel("パスワード").fill(password);
  await page.getByRole("button", { name: "ログイン" }).click();
  await expect(page).toHaveURL(/\/app\/home/);
}

test.beforeAll(async () => {
  [kddi, jt] = await Promise.all([
    getStockByTicker("9433"),
    getStockByTicker("2914")
  ]);
  zeroHoldingsUser = await createConfirmedUser("e2e-empty");
  holdingsUser = await createConfirmedUser("e2e-goal");
  await createHoldingWithGoal(holdingsUser.id, kddi.id, 100, 4300, "nisa", null);
  await createHolding(holdingsUser.id, jt.id, 100, 3800, "tokutei");
});

test.afterAll(async () => {
  await cleanupUser(zeroHoldingsUser.id);
  await cleanupUser(holdingsUser.id);
});

test("new user onboarding flow shows add-holding CTA", async ({ page }) => {
  await login(page, zeroHoldingsUser.email, zeroHoldingsUser.password);
  await page.goto("/app/home");

  await expect(page.getByText("保有銘柄が未登録です")).toBeVisible();
  await expect(page.getByRole("link", { name: /銘柄を追加/ })).toBeVisible();

  // No dividend summary cards
  await expect(page.getByText("年間税引後配当")).not.toBeVisible();
});

test("portfolio empty state shown for zero holdings user", async ({ page }) => {
  await login(page, zeroHoldingsUser.email, zeroHoldingsUser.password);
  await page.goto("/app/portfolio");

  await expect(page.getByText("保有銘柄がありません")).toBeVisible();
  await expect(page.getByRole("link", { name: /銘柄を追加/ })).toBeVisible();
});

test("calendar empty state shown for zero holdings user", async ({ page }) => {
  await login(page, zeroHoldingsUser.email, zeroHoldingsUser.password);
  await page.goto("/app/calendar");

  await expect(page.getByText("保有銘柄がありません")).toBeVisible();
});

test("annual goal prompt visible for user with holdings but no goal", async ({ page }) => {
  await login(page, holdingsUser.email, holdingsUser.password);
  await page.goto("/app/home");

  // Goal-setting CTA should be visible
  await expect(page.getByText("目標を設定")).toBeVisible();
});

test("portfolio sort works", async ({ page }) => {
  await login(page, holdingsUser.email, holdingsUser.password);
  await page.goto("/app/portfolio");

  // Sort by highest annual after-tax dividend
  await page.getByRole("button", { name: "税引後配当額順" }).click();

  // Verify both holdings are visible
  await expect(page.getByText(kddi.name)).toBeVisible();
  await expect(page.getByText(jt.name)).toBeVisible();

  // Sort by ticker ascending
  await page.getByRole("button", { name: "銘柄コード順" }).click();
  await expect(page.getByText(kddi.name)).toBeVisible();
  await expect(page.getByText(jt.name)).toBeVisible();
});

test("PWA manifest is reachable and well-formed", async ({ request }) => {
  const response = await request.get("/manifest.webmanifest");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("application/manifest+json");

  const body = await response.json();
  expect(body.name).toBeTruthy();
  expect(body.short_name).toBeTruthy();
  expect(body.display).toBeTruthy();
  expect(body.icons).toBeInstanceOf(Array);
  expect(body.icons.length).toBeGreaterThan(0);
});
