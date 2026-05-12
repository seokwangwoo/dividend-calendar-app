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
const HOLDING_QUANTITY = 100;

let user: Awaited<ReturnType<typeof createConfirmedUser>>;
let kddi: Awaited<ReturnType<typeof getStockByTicker>>;
const createdEventIds: string[] = [];

// Computed in beforeAll: expected annual dividend based on approved events for CURRENT_YEAR
let expectedAnnualDividendPerShare = 0;

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

function formatPercent(value: number | null, digits = 2): string {
  if (value == null || Number.isNaN(value)) return "-";
  return `${value.toFixed(digits)}%`;
}

test.beforeAll(async () => {
  kddi = await getStockByTicker("9433");

  user = await createConfirmedUser("e2e-verify-stock");

  // User A holding: KDDI 100 shares NISA avg 4300
  await createHolding(user.id, kddi.id, 100, 4300, "nisa");

  const admin = createAdminClient();

  // Clean up any leftover approved events from previous interrupted runs
  // (events that can be deleted — those with FK references may survive the delete).
  const { data: staleEvents } = await admin
    .from("dividend_events")
    .select("id")
    .eq("stock_id", kddi.id)
    .eq("expected_payment_year", CURRENT_YEAR)
    .eq("review_status", "approved")
    .not("source_url", "like", "https://www.release.tdnet.info%");
  if (staleEvents && staleEvents.length > 0) {
    await deleteDividendEvents(staleEvents.map((e) => e.id as string));
  }

  // Year-end event: ¥150/share with source metadata for the source section test
  const { data: eventData } = await admin
    .from("dividend_events")
    .insert({
      stock_id: kddi.id,
      fiscal_year: CURRENT_YEAR,
      expected_payment_year: CURRENT_YEAR,
      fiscal_month: null,
      event_type: "year_end",
      dividend_per_share: 150,
      expected_payment_month: 6,
      status: "confirmed",
      review_status: "approved",
      source_type: "tdnet",
      source_url: "https://example.com/disclosure/kddi",
      source_published_at: `${CURRENT_YEAR}-01-15T10:00:00Z`
    })
    .select("id")
    .single();
  if (eventData) createdEventIds.push(eventData.id as string);

  // Compute expected annual DPS from all approved events for CURRENT_YEAR after setup,
  // so the test stays correct even when persistent seed events exist alongside our own.
  const { data: approvedEvents } = await admin
    .from("dividend_events")
    .select("dividend_per_share")
    .eq("stock_id", kddi.id)
    .eq("expected_payment_year", CURRENT_YEAR)
    .eq("review_status", "approved")
    .not("dividend_per_share", "is", null);
  expectedAnnualDividendPerShare =
    (approvedEvents ?? []).reduce(
      (sum, e) => sum + Number(e.dividend_per_share),
      0
    );
});

test.afterAll(async () => {
  await deleteDividendEvents(createdEventIds);
  await cleanupUser(user.id);
});

test("stock detail shows stock info with exact values", async ({ page }) => {
  await login(page, user.email, user.password);
  await page.goto(`/app/stocks/${kddi.id}`);

  await expect(page.getByRole("heading", { name: kddi.name })).toBeVisible();
  await expect(page.getByText(kddi.ticker).first()).toBeVisible();

  // Stock info card: scope to the card containing "現在株価"
  const infoCard = page.locator("div").filter({ hasText: "現在株価" }).first();
  await expect(infoCard.getByText(formatJpy(4300)).first()).toBeVisible();
  // expected_annual_dividend_per_share is ¥150 (exact match to avoid matching ¥150/株)
  await expect(infoCard.getByText(formatJpy(150), { exact: true }).first()).toBeVisible();
  await expect(infoCard.getByText(formatPercent(3.4884)).first()).toBeVisible();
});

test("stock detail shows user holdings with exact values", async ({ page }) => {
  await login(page, user.email, user.password);
  await page.goto(`/app/stocks/${kddi.id}`);

  const holdingsSection = page.locator("section").filter({ hasText: "保有情報" }).first();
  await expect(holdingsSection).toBeVisible();

  // NISA holding: quantity 100, tax rate 0%
  // expectedAnnualDividendPerShare is computed in beforeAll from all approved events for CURRENT_YEAR.
  const expectedAnnual = expectedAnnualDividendPerShare * HOLDING_QUANTITY;
  await expect(holdingsSection.getByText("NISA").first()).toBeVisible();
  await expect(holdingsSection.getByText("100株").first()).toBeVisible();
  await expect(holdingsSection.getByText(`税引後年間 ${formatJpy(expectedAnnual)}`).first()).toBeVisible();
  await expect(holdingsSection.getByText(`税引前 ${formatJpy(expectedAnnual)}`).first()).toBeVisible();
});

test("stock detail shows dividend schedule with status labels", async ({ page }) => {
  await login(page, user.email, user.password);
  await page.goto(`/app/stocks/${kddi.id}`);

  const scheduleSection = page.locator("section").filter({ hasText: "配当スケジュール" }).first();
  await expect(scheduleSection).toBeVisible();

  // Our manual event: June, confirmed
  await expect(scheduleSection.getByText(`${CURRENT_YEAR}年6月`).first()).toBeVisible();

  // Dividend per share for our event (use exact match to avoid matching other ¥150)
  await expect(scheduleSection.getByText(`${formatJpy(150)}/株`, { exact: true }).first()).toBeVisible();

  // Status label mapping: confirmed -> 確定 (at least one confirmed event exists)
  await expect(scheduleSection.getByText("確定").first()).toBeVisible();
});

test("stock detail shows source metadata", async ({ page }) => {
  await login(page, user.email, user.password);
  await page.goto(`/app/stocks/${kddi.id}`);

  const sourceSection = page.locator("section").filter({ hasText: "データソース" }).first();
  await expect(sourceSection).toBeVisible();

  // Review status label: approved -> 検収済
  await expect(sourceSection.getByText("検収済").first()).toBeVisible();

  // Source type
  await expect(sourceSection.getByText("tdnet").first()).toBeVisible();

  // Source URL
  await expect(sourceSection.getByText("https://example.com/disclosure/kddi").first()).toBeVisible();

  // Source published at label
  await expect(sourceSection.getByText("公表日時").first()).toBeVisible();
});

test("stock detail shows unavailable yield when current price is null", async ({ page }) => {
  const admin = createAdminClient();
  const { data: nullPriceStock } = await admin
    .from("stocks")
    .insert({
      ticker: "TEST0",
      exchange: "TSE",
      name: "Test Null Price",
      name_en: "Test Null Price",
      currency: "JPY",
      support_status: "supported",
      current_price: null,
      expected_annual_dividend_per_share: 100,
      expected_dividend_yield: null
    })
    .select("id")
    .single();

  const stockId = nullPriceStock?.id as string;

  try {
    await login(page, user.email, user.password);
    await page.goto(`/app/stocks/${stockId}`);

    await expect(page.getByRole("heading", { name: "Test Null Price" })).toBeVisible();

    const infoCard = page.locator("div").filter({ hasText: "現在株価" }).first();
    await expect(infoCard.getByText("-").first()).toBeVisible();
    await expect(infoCard.getByText("予想配当利回り").first()).toBeVisible();
    await expect(infoCard.getByText("-").first()).toBeVisible();
  } finally {
    if (stockId) {
      await admin.from("stocks").delete().eq("id", stockId);
    }
  }
});

test("stock detail shows add to portfolio link when user does not hold the stock", async ({ page }) => {
  const emptyUser = await createConfirmedUser("e2e-stock-empty");

  try {
    await login(page, emptyUser.email, emptyUser.password);
    await page.goto(`/app/stocks/${kddi.id}`);

    await expect(page.getByText("この銘柄は未保有です")).toBeVisible();
    await expect(page.getByRole("link", { name: "ポートフォリオに追加" })).toBeVisible();
  } finally {
    await cleanupUser(emptyUser.id);
  }
});
