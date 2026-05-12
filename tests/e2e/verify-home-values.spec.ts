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

const helperDateText = `${CURRENT_YEAR}年${CURRENT_MONTH}月`;

test.beforeAll(async () => {
  kddi = await getStockByTicker("9433");
  jt = await getStockByTicker("2914");

  // Pre-cleanup: remove any stale e2e events from previous interrupted runs
  const admin = createAdminClient();
  const { data: staleEvents } = await admin
    .from("dividend_events")
    .select("id")
    .in("stock_id", [kddi.id, jt.id])
    .eq("source_type", "e2e");
  if (staleEvents && staleEvents.length > 0) {
    await deleteDividendEvents(staleEvents.map((e) => e.id as string));
  }

  userA = await createConfirmedUser("e2e-verify-home");

  // Create holdings for User A per phase plan
  await createHolding(userA.id, kddi.id, 100, 4300, "nisa");
  await createHolding(userA.id, jt.id, 100, 3800, "tokutei");

  // KDDI event via helper (current expected payment year/month)
  const kddiEventId = await createApprovedDividendEvent(kddi.id);
  createdEventIds.push(kddiEventId);

  // JT event — same expected payment month as KDDI; larger after-tax amount wins the month-level next-dividend tie.
  const jtPaymentMonth = CURRENT_MONTH;
  const jtPaymentYear = CURRENT_YEAR;
  const { data: jtEventData } = await admin
    .from("dividend_events")
    .insert({
      stock_id: jt.id,
      fiscal_year: CURRENT_YEAR,
      expected_payment_year: jtPaymentYear,
      fiscal_month: null,
      event_type: "year_end",
      dividend_per_share: 194,
      expected_payment_month: jtPaymentMonth,
      status: "confirmed",
      review_status: "approved",
      source_type: "e2e",
      source_url: "https://example.com/e2e-jt",
      source_published_at: new Date().toISOString()
    })
    .select("id")
    .single();
  if (jtEventData) createdEventIds.push(jtEventData.id as string);

  // Set annual goal
  await admin
    .from("user_settings")
    .update({ annual_dividend_goal_amount: 50000 })
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
  await expect(nextCard.getByText(jt.name, { exact: true }).first()).toBeVisible();
  await expect(nextCard.getByText(jt.ticker).first()).toBeVisible();

  // Status label mapping: confirmed -> 確定
  await expect(nextCard.getByText("確定").first()).toBeVisible();

  // JT: before_tax = 194 * 100 = 19,400, after_tax = 15,458.89 (tokutei)
  await expect(nextCard.getByText(`税引後 ${formatJpy(15458.89)}`).first()).toBeVisible();
  await expect(nextCard.getByText(`税引前 ${formatJpy(19400)}`).first()).toBeVisible();
  // Payment year/month
  await expect(nextCard.getByText(helperDateText).first()).toBeVisible();
});

test("home screen shows annual goal progress", async ({ page }) => {
  await login(page, userA.email, userA.password);

  const goalCard = page.locator("div").filter({ hasText: "年間税引後配当目標" }).first();
  await expect(goalCard).toBeVisible();

  // Goal: 50,000; annual after-tax: 47,486.92
  // Rate: 47486.92 / 50000 * 100 = 94.97%
  await expect(goalCard.getByText("95.0%").first()).toBeVisible();
  await expect(goalCard.getByText(`今年 ${formatJpy(47486.92)}`).first()).toBeVisible();
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

test("home shows annual goal empty state when holdings exist but annual goal is not set", async ({ page }) => {
  const goalEmptyUser = await createConfirmedUser("e2e-home-goal-empty");

  try {
    await createHolding(goalEmptyUser.id, kddi.id, 100, 4300, "nisa");

    await login(page, goalEmptyUser.email, goalEmptyUser.password);

    await expect(page.getByText("年間税引後配当目標が未設定です")).toBeVisible();
    await expect(page.getByRole("link", { name: "目標を設定" })).toBeVisible();
    await expect(page.getByText("保有銘柄が未登録です")).not.toBeVisible();
  } finally {
    await cleanupUser(goalEmptyUser.id);
  }
});
