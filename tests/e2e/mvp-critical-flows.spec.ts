import { expect, test, type Page } from "@playwright/test";
import {
  cleanupUser,
  cleanupUserByEmail,
  createApprovedDividendEvent,
  createConfirmedUser,
  deleteDividendEvents,
  getStockByTicker,
  makeAdmin
} from "./helpers";

const createdUsers: string[] = [];
const createdDividendEvents: string[] = [];
let normalUser: Awaited<ReturnType<typeof createConfirmedUser>>;
let adminUser: Awaited<ReturnType<typeof createConfirmedUser>>;
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
  normalUser = await createConfirmedUser("e2e-user");
  adminUser = await createConfirmedUser("e2e-admin");
  createdUsers.push(normalUser.id, adminUser.id);
  await makeAdmin(adminUser.id);
  createdDividendEvents.push(await createApprovedDividendEvent(kddi.id));
});

test.afterAll(async () => {
  await deleteDividendEvents(createdDividendEvents);
  for (const userId of createdUsers) {
    await cleanupUser(userId);
  }
});

test.fixme("signup and password reset entry points work", async ({ page }) => {
  const signupEmail = `e2e.signup.${Date.now()}@example.com`;
  await page.goto("/auth/signup");
  await page.getByLabel("メールアドレス").fill(signupEmail);
  await page.getByLabel("パスワード").fill("Test1234!");
  await page.getByRole("button", { name: "作成" }).click();
  await expect(page).toHaveURL(/\/auth\/login/);
  await expect(page.getByText("確認メールを送信しました")).toBeVisible();

  await page.getByRole("link", { name: "パスワード再設定" }).click();
  await page.getByLabel("メールアドレス").fill(signupEmail);
  await page.getByRole("button", { name: "送信" }).click();
  await expect(page).toHaveURL(/\/auth\/login/);
  await expect(page.getByText("パスワード再設定用リンクを送信しました")).toBeVisible();

  await cleanupUserByEmail(signupEmail);
});

test("normal user can complete core portfolio, calendar, notification, and settings flow", async ({
  page
}) => {
  await page.goto("/app/home");
  await expect(page).toHaveURL(/\/auth\/login/);

  await login(page, normalUser.email, normalUser.password);
  await expect(page.getByText("保有銘柄が未登録です")).toBeVisible();

  await page.goto("/app/portfolio/new");
  await page.getByLabel("銘柄名またはコード").fill("9433");
  // Search is auto-triggered after debounce — wait for results to appear
  const kddiResult = page.locator("div").filter({ hasText: /KDDI.*9433/ }).first();
  await kddiResult.getByRole("button", { name: "選択" }).click();
  await page.getByLabel("保有数量").fill("100");
  await page.getByLabel("平均取得単価").fill("4300");
  await page.getByLabel("口座区分").selectOption("nisa");
  await expect(page.getByText("税額および税引後配当額は概算です。")).toBeVisible();
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page.getByText("銘柄を追加しました")).toBeVisible();

  await page.getByRole("link", { name: "カレンダーで確認" }).click();
  await expect(page).toHaveURL(/\/app\/calendar/);
  await expect(page.getByText("配当カレンダー")).toBeVisible();
  await expect(page.getByText("入金予定")).toHaveCount(12);

  await page.getByRole("link", { name: "保有" }).click();
  await expect(page.getByText(kddi.name)).toBeVisible();
  await expect(page.getByText("100株")).toBeVisible();

  await page.goto(`/app/stocks/${kddi.id}`);
  await expect(page.getByText(kddi.ticker)).toBeVisible();
  await expect(page.getByText("データソース")).toBeVisible();
  await page.getByRole("link", { name: "目標利回りを設定" }).click();
  await expect(page.getByText("これは売買を推奨するものではありません。")).toBeVisible();
  await page.getByLabel("目標利回り").fill("3.0");
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page.getByText("有効")).toBeVisible();

  await page.goto("/app/settings");
  await page.getByLabel("年間税引後配当目標額").fill("50000");
  await page.getByLabel("金額表示").selectOption("before_tax");
  await expect(page.getByText("税額および税引後配当額は概算です。")).toBeVisible();
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page.locator('input[name="annualDividendGoalAmount"]')).toHaveValue("50000");

  await page.getByRole("button", { name: "ログアウト" }).click();
  await expect(page).toHaveURL(/\/auth\/login/);
});

test("admin routes block normal users and allow admin users", async ({ page }) => {
  await login(page, normalUser.email, normalUser.password);
  await page.goto("/admin/dividend-reviews");
  await expect(page).toHaveURL(/\/app\/home/);

  await page.goto("/app/settings");
  await page.getByRole("button", { name: "ログアウト" }).click();
  await login(page, adminUser.email, adminUser.password);
  await page.goto("/admin/dividend-reviews");
  await expect(page.getByText("AI配当候補レビュー")).toBeVisible();
});
