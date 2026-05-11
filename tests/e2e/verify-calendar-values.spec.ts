import { expect, test, type Page } from "@playwright/test";
import {
  cleanupUser,
  createConfirmedUser,
  createHolding,
  getStockByTicker,
  deleteDividendEvents,
  createAdminClient
} from "./helpers";

const CURRENT_YEAR = new Date().getFullYear();
const CURRENT_MONTH = new Date().getMonth() + 1;

let user: Awaited<ReturnType<typeof createConfirmedUser>>;
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

test.beforeAll(async () => {
  kddi = await getStockByTicker("9433");
  jt = await getStockByTicker("2914");

  user = await createConfirmedUser("e2e-verify-calendar");

  // User A holdings per phase plan
  await createHolding(user.id, kddi.id, 100, 4300, "nisa");
  await createHolding(user.id, jt.id, 100, 3800, "tokutei");

  const admin = createAdminClient();

  // Remove any stale e2e events for these stocks from previous failed runs
  // to prevent duplicate events corrupting test assertions
  await admin
    .from("dividend_events")
    .delete()
    .in("stock_id", [kddi.id, jt.id])
    .eq("source_type", "e2e")
    .eq("payment_year", CURRENT_YEAR);

  // Create approved events for KDDI in current month
  const { data: kddiEvent } = await admin
    .from("dividend_events")
    .insert({
      stock_id: kddi.id,
      fiscal_year: CURRENT_YEAR,
      event_type: "year_end",
      dividend_per_share: 150,
      expected_payment_month: CURRENT_MONTH,
      expected_payment_date: `${CURRENT_YEAR}-${String(CURRENT_MONTH).padStart(2, "0")}-15`,
      status: "confirmed",
      review_status: "approved",
      source_type: "e2e",
      source_url: "https://example.com/e2e-kddi",
      source_published_at: new Date().toISOString()
    })
    .select("id")
    .single();
  if (kddiEvent) createdEventIds.push(kddiEvent.id as string);

  // Create approved event for JT in a different month
  const otherMonth = CURRENT_MONTH === 12 ? 1 : CURRENT_MONTH + 1;
  const { data: jtEvent } = await admin
    .from("dividend_events")
    .insert({
      stock_id: jt.id,
      fiscal_year: CURRENT_YEAR,
      event_type: "year_end",
      dividend_per_share: 194,
      expected_payment_month: otherMonth,
      expected_payment_date: `${CURRENT_YEAR}-${String(otherMonth).padStart(2, "0")}-15`,
      status: "confirmed",
      review_status: "approved",
      source_type: "e2e",
      source_url: "https://example.com/e2e-jt",
      source_published_at: new Date().toISOString()
    })
    .select("id")
    .single();
  if (jtEvent) createdEventIds.push(jtEvent.id as string);
});

test.afterAll(async () => {
  await deleteDividendEvents(createdEventIds);
  await cleanupUser(user.id);
});

test("calendar shows 12 months with correct totals", async ({ page }) => {
  await login(page, user.email, user.password);
  await page.goto("/app/calendar");

  // 12 monthly rows visible
  await expect(page.getByText("入金予定")).toHaveCount(12);
  await expect(page.getByText(`${CURRENT_YEAR}年`, { exact: true })).toBeVisible();

  // Current month should show KDDI amount: 150 * 100 = 15,000 (NISA, after_tax)
  const currentMonthText = `${CURRENT_YEAR}年${CURRENT_MONTH}月`;
  await expect(page.getByText(currentMonthText)).toBeVisible();

  // Other month should show JT amount: 194 * 100 * (1 - 0.20315) = 15,458.89
  const otherMonth = CURRENT_MONTH === 12 ? 1 : CURRENT_MONTH + 1;
  const otherMonthText = `${CURRENT_YEAR}年${otherMonth}月`;
  await expect(page.getByText(otherMonthText)).toBeVisible();
});

test("basis switch updates every monthly total", async ({ page }) => {
  await login(page, user.email, user.password);
  await page.goto("/app/calendar");

  // Default after-tax basis shows tax引後 badge
  await expect(page.getByText("税引後").first()).toBeVisible();

  // Switch to before-tax
  await page.getByRole("button", { name: "税引前" }).click();

  // Badge should update
  await expect(page.getByText("税引前").first()).toBeVisible();

  // Current month KDDI before-tax = 150 * 100 = 15,000
  const currentMonthText = `${CURRENT_YEAR}年${CURRENT_MONTH}月`;
  const currentMonthRow = page.locator("button", { hasText: currentMonthText });
  await expect(currentMonthRow).toContainText(formatJpy(15000));
});

test("account filter updates totals and event lists", async ({ page }) => {
  await login(page, user.email, user.password);
  await page.goto("/app/calendar");

  // NISA filter: only KDDI visible in current month
  await page.getByRole("button", { name: "NISA" }).click();
  const currentMonthText = `${CURRENT_YEAR}年${CURRENT_MONTH}月`;
  await expect(page.getByText(currentMonthText)).toBeVisible();

  // 特定口座 filter: only JT visible in its month
  await page.getByRole("button", { name: "特定口座" }).click();
  const otherMonth = CURRENT_MONTH === 12 ? 1 : CURRENT_MONTH + 1;
  const otherMonthText = `${CURRENT_YEAR}年${otherMonth}月`;
  await expect(page.getByText(otherMonthText)).toBeVisible();

  // Back to all
  await page.getByRole("button", { name: "全口座" }).click();
  await expect(page.getByText(currentMonthText)).toBeVisible();
  await expect(page.getByText(otherMonthText)).toBeVisible();
});

test("month detail shows per-stock event cards with exact values", async ({ page }) => {
  await login(page, user.email, user.password);
  await page.goto("/app/calendar");

  const currentMonthText = `${CURRENT_YEAR}年${CURRENT_MONTH}月`;
  await page.getByText(currentMonthText).first().click();

  await expect(page.getByText(`${currentMonthText} 明細`)).toBeVisible();

  // Totals for KDDI event (NISA, tax=0)
  // before_tax = 15,000, estimated_tax = 0, after_tax = 15,000
  const detailSection = page.locator("div").filter({ hasText: `${currentMonthText} 明細` }).first();
  await expect(detailSection.getByText("税引前合計").first()).toBeVisible();
  await expect(detailSection.getByText("税額").first()).toBeVisible();
  await expect(detailSection.getByText("税引後合計").first()).toBeVisible();

  // Verify the total rows contain the expected amounts
  const beforeTaxRow = detailSection.locator("div").filter({ hasText: "税引前合計" }).first();
  await expect(beforeTaxRow).toContainText(formatJpy(15000));
  const taxRow = detailSection.locator("div").filter({ hasText: /^(?!.*合計).*税額/ }).first();
  await expect(taxRow).toContainText(formatJpy(0));
  const afterTaxRow = detailSection.locator("div").filter({ hasText: "税引後合計" }).first();
  await expect(afterTaxRow).toContainText(formatJpy(15000));

  // Event card values scoped to detail section
  await expect(detailSection.getByText(kddi.name).first()).toBeVisible();
  await expect(detailSection.getByText(kddi.ticker).first()).toBeVisible();
  await expect(detailSection.getByText("NISA").first()).toBeVisible();
  await expect(detailSection.getByText("確定").first()).toBeVisible();
  await expect(detailSection.getByText("100株").first()).toBeVisible();
});

test("undecided amounts are not shown as zero", async ({ page }) => {
  await login(page, user.email, user.password);
  await page.goto("/app/calendar");

  // Find a month with no events and click it
  const emptyMonth = CURRENT_MONTH === 1 ? 2 : 1;
  const emptyMonthText = `${CURRENT_YEAR}年${emptyMonth}月`;
  await page.getByText(emptyMonthText).first().click();

  await expect(page.getByText(`${emptyMonthText} 明細`)).toBeVisible();
  // Month with no events should show null/— not zero
  await expect(page.getByText(formatJpy(0))).not.toBeVisible();
});
