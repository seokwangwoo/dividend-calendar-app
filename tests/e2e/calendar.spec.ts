import { expect, test, type Page } from "@playwright/test";
import {
  cleanupUser,
  createApprovedDividendEvent,
  createConfirmedUser,
  createHolding,
  deleteDividendEvents,
  getStockByTicker
} from "./helpers";

const createdEvents: string[] = [];
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
  user = await createConfirmedUser("e2e-calendar");
  kddi = await getStockByTicker("9433");
  await createHolding(user.id, kddi.id, 100, 4300, "nisa");
  createdEvents.push(await createApprovedDividendEvent(kddi.id));
});

test.afterAll(async () => {
  await deleteDividendEvents(createdEvents);
  await cleanupUser(user.id);
});

test("calendar shows 12 months and year navigation changes displayed year", async ({
  page
}) => {
  await login(page, user.email, user.password);
  await page.goto("/app/calendar");

  // 12 monthly rows visible
  await expect(page.getByText("入金予定")).toHaveCount(12);

  const currentYear = new Date().getFullYear();
  await expect(page.getByText(`${currentYear}年`, { exact: true })).toBeVisible();

  // Navigate forward
  await page.getByRole("button", { name: "›" }).click();
  await expect(page.getByText(`${currentYear + 1}年`, { exact: true })).toBeVisible();
  await expect(page.getByText("入金予定")).toHaveCount(12);

  // Navigate back
  await page.getByRole("button", { name: "‹" }).click();
  await expect(page.getByText(`${currentYear}年`, { exact: true })).toBeVisible();
});

test("calendar basis toggle switches between tax views", async ({ page }) => {
  await login(page, user.email, user.password);
  await page.goto("/app/calendar");

  await expect(page.getByText("入金予定")).toHaveCount(12);

  // Switch to before-tax basis
  await page.getByRole("button", { name: "税引前" }).click();
  await expect(page.getByText("入金予定")).toHaveCount(12);

  // Switch back to after-tax basis
  await page.getByRole("button", { name: "税引後" }).click();
  await expect(page.getByText("入金予定")).toHaveCount(12);
});

test("calendar account type filter changes selection and re-renders", async ({ page }) => {
  await login(page, user.email, user.password);
  await page.goto("/app/calendar");

  await expect(page.getByText("入金予定")).toHaveCount(12);

  // Filter to NISA (user has NISA holding so event still shows)
  await page.getByRole("button", { name: "NISA" }).click();
  await expect(page.getByText("入金予定")).toHaveCount(12);

  // Filter to 特定口座 (no tokutei holding — 0 events per month)
  await page.getByRole("button", { name: "特定口座" }).click();
  await expect(page.getByText("入金予定")).toHaveCount(12);

  // Return to all accounts
  await page.getByRole("button", { name: "全口座" }).click();
  await expect(page.getByText("入金予定")).toHaveCount(12);
});

test("clicking a month row reveals its dividend detail", async ({ page }) => {
  await login(page, user.email, user.password);
  await page.goto("/app/calendar");

  // The approved event is scheduled in the current month
  const now = new Date();
  const monthText = `${now.getFullYear()}年${now.getMonth() + 1}月`;

  await page.getByText(monthText).first().click();

  // Month detail section header appears
  await expect(page.getByText(`${monthText} 明細`)).toBeVisible();
  // Detail shows before-tax and after-tax totals
  await expect(page.getByText("税引後合計")).toBeVisible();
});
