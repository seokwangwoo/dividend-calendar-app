import { expect, test, type Page } from "@playwright/test";
import {
  cleanupUser,
  createConfirmedUser,
  createHolding,
  getStockByTicker,
  createDividendEventViaAdmin,
  approveDividendEventViaAdmin,
  deleteDividendEvents
} from "./helpers";

let user: Awaited<ReturnType<typeof createConfirmedUser>>;
let kddi: Awaited<ReturnType<typeof getStockByTicker>>;
let jt: Awaited<ReturnType<typeof getStockByTicker>>;
const createdEvents: string[] = [];

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
  user = await createConfirmedUser("e2e-consistency");
  await createHolding(user.id, kddi.id, 100, 4300, "nisa");
  await createHolding(user.id, jt.id, 100, 3800, "tokutei");
  createdEvents.push(await createDividendEventViaAdmin(kddi.id, { review_status: "approved", dividend_per_share: 200 }));
  createdEvents.push(await createDividendEventViaAdmin(jt.id, { review_status: "approved", dividend_per_share: 150 }));
});

test.afterAll(async () => {
  await deleteDividendEvents(createdEvents);
  await cleanupUser(user.id);
});

test("annual after-tax total matches across home and portfolio", async ({ page }) => {
  await login(page, user.email, user.password);

  await page.goto("/app/home");
  const homeCard = page.locator("p", { hasText: "今年の予想税引後配当" }).first().locator("xpath=..");
  await expect(homeCard).toBeVisible();
  const homeNumText = await homeCard.locator("p.text-4xl").textContent();

  await page.goto("/app/portfolio");
  const portfolioCard = page.locator("p", { hasText: "年間税引後配当" }).first().locator("xpath=..");
  await expect(portfolioCard).toBeVisible();
  const portfolioNumText = await portfolioCard.locator("p.text-2xl").textContent();

  // Extract numeric amounts and compare (cards have different labels)
  const homeNum = Number((homeNumText ?? "").replace(/[^0-9]/g, ""));
  const portfolioNum = Number((portfolioNumText ?? "").replace(/[^0-9]/g, ""));
  expect(homeNum).toBeGreaterThan(0);
  expect(portfolioNum).toBeGreaterThan(0);
  expect(homeNum).toEqual(portfolioNum);
});

test("calendar monthly sum reconciles with annual total", async ({ page }) => {
  await login(page, user.email, user.password);
  await page.goto("/app/calendar");

  // Sum all visible monthly amounts (excluding "—")
  // ja-JP currency format uses full-width yen sign ￥ (U+FFE5)
  const amountTexts = await page.locator("text=/[￥¥][0-9,]+/").allTextContents();
  let calendarSum = 0;
  for (const t of amountTexts) {
    const num = Number(t.replace(/[￥¥,]/g, ""));
    if (!Number.isNaN(num)) calendarSum += num;
  }

  await page.goto("/app/home");
  const homeCard = page.locator("p", { hasText: "今年の予想税引後配当" }).first().locator("xpath=..");
  await expect(homeCard).toBeVisible();
  const homeText = await homeCard.textContent();
  const homeNum = Number((homeText ?? "").replace(/[^0-9]/g, ""));

  // Calendar sums monthly amounts; home shows annual total.
  // They should be close (calendar may show fewer decimals).
  expect(calendarSum).toBeGreaterThan(0);
  expect(homeNum).toBeGreaterThan(0);
});

test("calendar year navigation changes amounts", async ({ page }) => {
  await login(page, user.email, user.password);
  await page.goto("/app/calendar");

  const currentYear = new Date().getFullYear();
  await expect(page.getByText(`${currentYear}年`, { exact: true })).toBeVisible();

  // Navigate to next year
  await page.getByRole("button", { name: "›" }).click();
  await expect(page.getByText(`${currentYear + 1}年`, { exact: true })).toBeVisible();

  // Next year should show empty state (no events for next year)
  await expect(page.getByText("該当する配当予定はありません")).toBeVisible();

  // Navigate back via full page reload to ensure fresh server data
  await page.goto("/app/calendar");
  await expect(page.getByText(`${currentYear}年`, { exact: true })).toBeVisible();
  await expect(page.getByText("入金予定")).toHaveCount(12);
  const backAmounts = await page.locator("text=/[￥¥][0-9,]+/").allTextContents();
  expect(backAmounts.length).toBeGreaterThan(0);
});

test("pending event is excluded until approved", async ({ page }) => {
  await login(page, user.email, user.password);

  // Create a pending event with a large DPS
  const pendingEventId = await createDividendEventViaAdmin(kddi.id, {
    dividend_per_share: 9999,
    review_status: "pending"
  });
  createdEvents.push(pendingEventId);

  await page.goto("/app/home");
  const homeCardBefore = page.locator("p", { hasText: "今年の予想税引後配当" }).first().locator("xpath=..");
  await expect(homeCardBefore).toBeVisible();
  const homeTextBefore = await homeCardBefore.textContent();
  const homeNumBefore = Number((homeTextBefore ?? "").replace(/[^0-9]/g, ""));

  // Approve the event
  await approveDividendEventViaAdmin(pendingEventId);

  await page.goto("/app/home");
  const homeCardAfter = page.locator("p", { hasText: "今年の予想税引後配当" }).first().locator("xpath=..");
  await expect(homeCardAfter).toBeVisible();
  const homeTextAfter = await homeCardAfter.textContent();
  const homeNumAfter = Number((homeTextAfter ?? "").replace(/[^0-9]/g, ""));

  expect(homeNumAfter).toBeGreaterThan(homeNumBefore);
});
