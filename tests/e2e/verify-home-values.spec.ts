import { expect, test, type Page } from "@playwright/test";
import {
  cleanupUser,
  createConfirmedUser,
  createHolding,
  getStockByTicker,
  createApprovedDividendEvent,
  deleteDividendEvents,
  createAdminClient
} from "./helpers";

const CURRENT_YEAR = new Date().getFullYear();
const CURRENT_MONTH = new Date().getMonth() + 1;

let userA: Awaited<ReturnType<typeof createConfirmedUser>>;
let kddi: Awaited<ReturnType<typeof getStockByTicker>>;
let jt: Awaited<ReturnType<typeof getStockByTicker>>;
const createdEventIds: string[] = [];

async function login(page: Page, email: string, password: string) {
  await page.goto("/auth/login");
  await page.getByLabel("メールアドレス").fill(email);
  await page.getByLabel("パスワード").fill(password);
  await page.getByRole("button", { name: "ログイン" }).click();
  await expect(page).toHaveURL(/\/app\/home/);
}

function formatJpy(amount: number | null): string {
  if (amount == null || Number.isNaN(amount)) return "-";
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0
  }).format(amount);
}

// Calculate helper event payment date (now + 7 days)
const helperPaymentDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
const helperDateText = `${helperPaymentDate.getFullYear()}年${String(helperPaymentDate.getMonth() + 1).padStart(2, "0")}月${String(helperPaymentDate.getDate()).padStart(2, "0")}日`;

test.beforeAll(async () => {
  kddi = await getStockByTicker("9433");
  jt = await getStockByTicker("2914");

  userA = await createConfirmedUser("e2e-verify-home");

  // Create holdings for User A per phase plan
  await createHolding(userA.id, kddi.id, 100, 4300, "nisa");
  await createHolding(userA.id, jt.id, 100, 3800, "tokutei");

  // Create approved dividend events for current year
  const admin = createAdminClient();

  // KDDI event via helper (expected_payment_date = now + 7 days)
  const kddiEventId = await createApprovedDividendEvent(kddi.id);
  createdEventIds.push(kddiEventId);

  // JT event in current month
  const { data: jtEventData } = await admin
    .from("dividend_events")
    .insert({
      stock_id: jt.id,
      fiscal_year: CURRENT_YEAR,
      event_type: "year_end",
      dividend_per_share: 194,
      expected_payment_month: CURRENT_MONTH,
      expected_payment_date: `${CURRENT_YEAR}-${String(CURRENT_MONTH).padStart(2, "0")}-15`,
      status: "confirmed",
      review_status: "approved",
      source_type: "e2e",
      source_url: "https://example.com/e2e-jt",
      source_published_at: new Date().toISOString()
    })
    .select("id")
    .single();
  if (jtEventData) createdEventIds.push(jtEventData.id as string);

  // Set monthly goal
  await admin
    .from("user_settings")
    .update({ monthly_dividend_goal_amount: 50000 })
    .eq("user_id", userA.id);
});

test.afterAll(async () => {
  await deleteDividendEvents(createdEventIds);
  await cleanupUser(userA.id);
});

test("home screen shows exact annual dividend values", async ({ page }) => {
  await login(page, userA.email, userA.password);

  // Seed data + e2e events:
  // KDDI seed (2026): 140 * 100 = 14,000 (NISA)
  // KDDI helper: 150 * 100 = 15,000 (NISA)
  // JT seed (2026): 38 * 100 = 3,800 before-tax -> 3,028.03 after-tax (tokutei)
  // JT manual: 194 * 100 = 19,400 before-tax -> 15,458.89 after-tax (tokutei)
  // Total before tax: 52,200
  // Total tax: 4,713.08
  // Total after tax: 47,486.92
  const expectedAfterTax = formatJpy(47486.92);
  const expectedBeforeTax = formatJpy(52200);
  const expectedTax = formatJpy(4713.08);

  // Scope to the annual dividend card
  const annualCard = page.locator("div").filter({ hasText: "今年の予想税引後配当" }).first();
  await expect(annualCard.getByText(expectedAfterTax).first()).toBeVisible();
  await expect(annualCard.getByText(`税引前 ${expectedBeforeTax}`).first()).toBeVisible();
  await expect(annualCard.getByText(`税額 ${expectedTax}`).first()).toBeVisible();
});

test("home screen shows current month expected deposit", async ({ page }) => {
  await login(page, userA.email, userA.password);

  // KDDI helper + JT manual both in current month
  // KDDI: 15,000 (NISA)
  // JT: 15,458.89 (tokutei)
  // Total after tax: 30,458.89 -> ¥30,459
  const expectedCurrentMonth = formatJpy(30458.89);

  const monthCard = page.locator("div").filter({ hasText: new RegExp(`${CURRENT_MONTH}月の予想入金額`) }).first();
  await expect(monthCard.getByText(expectedCurrentMonth).first()).toBeVisible();
});

test("home screen shows next dividend card with exact values", async ({ page }) => {
  await login(page, userA.email, userA.password);

  const nextCard = page.locator("div").filter({ hasText: "次の配当" }).first();
  await expect(nextCard).toBeVisible();
  await expect(nextCard.getByText(kddi.name, { exact: true }).first()).toBeVisible();
  await expect(nextCard.getByText(kddi.ticker).first()).toBeVisible();

  // Status label mapping: confirmed -> 確定
  await expect(nextCard.getByText("確定").first()).toBeVisible();

  // KDDI: before_tax = 150 * 100 = 15,000, after_tax = 15,000 (NISA)
  await expect(nextCard.getByText(`税引後 ${formatJpy(15000)}`).first()).toBeVisible();
  await expect(nextCard.getByText(`税引前 ${formatJpy(15000)}`).first()).toBeVisible();
  // Payment date
  await expect(nextCard.getByText(helperDateText).first()).toBeVisible();
});

test("home screen shows monthly goal progress", async ({ page }) => {
  await login(page, userA.email, userA.password);

  const goalCard = page.locator("div").filter({ hasText: "月次目標" }).first();
  await expect(goalCard).toBeVisible();

  // Goal: 50,000; current month: 30,458.89
  // Rate: 30458.89 / 50000 * 100 = 60.92%
  await expect(goalCard.getByText("60.9%").first()).toBeVisible();
  await expect(goalCard.getByText(`今月 ${formatJpy(30458.89)}`).first()).toBeVisible();
  await expect(goalCard.getByText(`目標 ${formatJpy(50000)}`).first()).toBeVisible();
});

test("home screen shows recent dividend change badge", async ({ page }) => {
  await login(page, userA.email, userA.password);

  const changeCard = page.locator("div").filter({ hasText: "最近の配当変更" }).first();
  await expect(changeCard).toBeVisible();
  await expect(changeCard.getByText("増配").first()).toBeVisible();
  await expect(changeCard.getByText(kddi.name, { exact: true }).first()).toBeVisible();
  await expect(changeCard.getByText(kddi.ticker).first()).toBeVisible();
});

test("home empty state when no holdings exist", async ({ page }) => {
  const emptyUser = await createConfirmedUser("e2e-home-empty");

  try {
    await login(page, emptyUser.email, emptyUser.password);
    await expect(page.getByText("保有銘柄が未登録です")).toBeVisible();
    await expect(page.getByRole("link", { name: "銘柄を追加" })).toBeVisible();
  } finally {
    await cleanupUser(emptyUser.id);
  }
});
