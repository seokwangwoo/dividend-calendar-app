import { expect, test, type Page } from "@playwright/test";
import {
  cleanupUser,
  createConfirmedUser,
  createAdminClient
} from "./helpers";

let user: Awaited<ReturnType<typeof createConfirmedUser>>;

async function login(page: Page, email: string, password: string) {
  await page.goto("/auth/login");
  await page.getByLabel("メールアドレス").fill(email);
  await page.getByLabel("パスワード").fill(password);
  await page.getByRole("button", { name: "ログイン" }).click();
  await expect(page).toHaveURL(/\/app\/home/);
}

test.beforeAll(async () => {
  user = await createConfirmedUser("e2e-verify-settings");

  // Pre-set some settings values
  const admin = createAdminClient();
  await admin
    .from("user_settings")
    .update({
      email_notification_enabled: true,
      in_app_notification_enabled: false,
      default_amount_basis: "before_tax",
      monthly_dividend_goal_amount: 75000
    })
    .eq("user_id", user.id);
});

test.afterAll(async () => {
  await cleanupUser(user.id);
});

test("settings screen shows account email", async ({ page }) => {
  await login(page, user.email, user.password);
  await page.goto("/app/settings");

  await expect(page.getByText("アカウント", { exact: true })).toBeVisible();
  await expect(page.getByText(user.email)).toBeVisible();
});

test("settings screen shows toggle states", async ({ page }) => {
  await login(page, user.email, user.password);
  await page.goto("/app/settings");

  // Email notifications enabled
  const emailCheckbox = page.locator('input[name="emailNotificationEnabled"]');
  await expect(emailCheckbox).toBeChecked();

  // In-app notifications disabled
  const inAppCheckbox = page.locator('input[name="inAppNotificationEnabled"]');
  await expect(inAppCheckbox).not.toBeChecked();
});

test("settings screen shows default amount basis selector", async ({ page }) => {
  await login(page, user.email, user.password);
  await page.goto("/app/settings");

  const basisSelect = page.locator("select#defaultAmountBasis");
  await expect(basisSelect).toHaveValue("before_tax");
});

test("settings screen shows currency and monthly goal", async ({ page }) => {
  await login(page, user.email, user.password);
  await page.goto("/app/settings");

  // Currency is JPY
  await expect(page.getByText("通貨", { exact: true })).toBeVisible();
  await expect(page.locator("input#currency")).toHaveValue("JPY");

  // Monthly goal
  await expect(page.getByText("月間配当目標額", { exact: true })).toBeVisible();
  await expect(page.locator('input[name="monthlyDividendGoalAmount"]')).toHaveValue("75000");
});

test("settings screen shows tax calculation notice", async ({ page }) => {
  await login(page, user.email, user.password);
  await page.goto("/app/settings");

  await expect(page.getByText("税額計算について")).toBeVisible();
  await expect(
    page.getByText("税額および税引後配当額は概算です。実際の税額・入金額は証券会社の明細をご確認ください。")
  ).toBeVisible();
});

test("settings screen has logout button", async ({ page }) => {
  await login(page, user.email, user.password);
  await page.goto("/app/settings");

  await expect(page.getByRole("button", { name: "ログアウト" })).toBeVisible();
});
