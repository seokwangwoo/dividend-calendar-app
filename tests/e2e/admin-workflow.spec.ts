import { expect, test, type Page } from "@playwright/test";
import {
  cleanupUser,
  createConfirmedUser,
  createDividendEventViaAdmin,
  deleteDividendEvents,
  getStockByTicker,
  makeAdmin,
  createHolding
} from "./helpers";

let adminUser: Awaited<ReturnType<typeof createConfirmedUser>>;
let normalUser: Awaited<ReturnType<typeof createConfirmedUser>>;
let kddi: Awaited<ReturnType<typeof getStockByTicker>>;
const createdEvents: string[] = [];

async function login(page: Page, email: string, password: string) {
  await page.goto("/auth/login");
  await page.getByLabel("メールアドレス").fill(email);
  await page.getByLabel("パスワード").fill(password);
  await page.getByRole("button", { name: "ログイン" }).click();
  await expect(page).toHaveURL(/\/app\/home/);
}

test.beforeAll(async () => {
  kddi = await getStockByTicker("9433");
  normalUser = await createConfirmedUser("e2e-admin-normal");
  adminUser = await createConfirmedUser("e2e-admin-admin");
  await makeAdmin(adminUser.id);
});

test.afterAll(async () => {
  await deleteDividendEvents(createdEvents);
  await cleanupUser(normalUser.id);
  await cleanupUser(adminUser.id);
});

test("non-admin is redirected from admin routes", async ({ page }) => {
  await login(page, normalUser.email, normalUser.password);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/app\/home/);
});

test("admin can create and approve an event", async ({ page }) => {
  await login(page, adminUser.email, adminUser.password);

  // Navigate to admin new event page
  await page.goto("/admin/dividend-reviews/new");
  await expect(page.getByText("配当イベント新規作成")).toBeVisible();

  await page.getByLabel("銘柄").selectOption(kddi.id);
  await page.getByLabel("支払年").fill(String(new Date().getFullYear()));
  await page.locator("#estimatedPaymentMonth").fill("6");
  await page.locator("#dividendPerShare").fill("250");
  await page.getByRole("button", { name: "保存（保留中として登録）" }).click();

  await expect(page).toHaveURL(/\/admin\/dividend-reviews/);
  await expect(page.locator("span", { hasText: "保留中" }).first()).toBeVisible();

  // Approve the event
  const approveButton = page.getByRole("button", { name: "承認" }).first();
  await approveButton.click();

  await expect(page.locator("span", { hasText: "承認済" }).first()).toBeVisible();

  // Verify the approved event appears on normal user's home
  await createHolding(normalUser.id, kddi.id, 100, 4300, "nisa");

  await page.goto("/app/settings");
  await page.getByRole("button", { name: "ログアウト" }).click();
  await login(page, normalUser.email, normalUser.password);
  await page.goto("/app/home");

  // The approved event amount should be reflected
  await expect(page.locator("body")).toContainText("KDDI");
});

test("admin can reject an event with a reason", async ({ page }) => {
  const eventId = await createDividendEventViaAdmin(kddi.id, {
    dividend_per_share: 500,
    review_status: "pending"
  });
  createdEvents.push(eventId);

  await login(page, adminUser.email, adminUser.password);
  await page.goto("/admin/dividend-reviews");

  await expect(page.locator("span", { hasText: "保留中" }).first()).toBeVisible();

  // Reject the event
  const rejectForm = page.locator("form", { has: page.getByRole("button", { name: "却下" }) }).first();
  await rejectForm.locator('input[name="reason"]').fill("テスト却下");
  await rejectForm.getByRole("button", { name: "却下" }).click();

  await expect(page.locator("span", { hasText: "却下" }).first()).toBeVisible();
});

test("source URL is preserved and visible in admin list", async ({ page }) => {
  const eventId = await createDividendEventViaAdmin(kddi.id, {
    dividend_per_share: 100,
    review_status: "approved",
    source_url: "https://example.com/source-test"
  });
  createdEvents.push(eventId);

  await login(page, adminUser.email, adminUser.password);
  await page.goto("/admin/dividend-reviews");

  const link = page.locator('a[href="https://example.com/source-test"]');
  await expect(link).toBeVisible();
});
