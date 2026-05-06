import { expect, test, type Page } from "@playwright/test";
import {
  createAdminClient,
  cleanupUser,
  createConfirmedUser,
  createHolding,
  deleteDividendEvents,
  getStockByTicker
} from "./helpers";

let user: Awaited<ReturnType<typeof createConfirmedUser>>;
let kddi: Awaited<ReturnType<typeof getStockByTicker>>;
let jt: Awaited<ReturnType<typeof getStockByTicker>>;
const CURRENT_YEAR = new Date().getFullYear();
const CURRENT_MONTH = new Date().getMonth() + 1;
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

function formatPercent(value: number | null, digits = 2): string {
  if (value == null || Number.isNaN(value)) return "-";
  return `${value.toFixed(digits)}%`;
}

test.beforeAll(async () => {
  kddi = await getStockByTicker("9433");
  jt = await getStockByTicker("2914");

  user = await createConfirmedUser("e2e-verify-portfolio");

  // User A holdings per phase plan
  await createHolding(user.id, kddi.id, 100, 4300, "nisa");
  await createHolding(user.id, jt.id, 100, 3800, "tokutei");

  const admin = createAdminClient();
  const { data: kddiEventData } = await admin
    .from("dividend_events")
    .insert({
      stock_id: kddi.id,
      fiscal_year: CURRENT_YEAR,
      payment_year: CURRENT_YEAR,
      event_type: "year_end",
      dividend_per_share: 150,
      expected_payment_month: CURRENT_MONTH,
      expected_payment_date: `${CURRENT_YEAR}-${String(CURRENT_MONTH).padStart(2, "0")}-15`,
      status: "confirmed",
      review_status: "approved",
      source_type: "e2e",
      source_url: "https://example.com/e2e-kddi"
    })
    .select("id")
    .single();
  if (kddiEventData) createdEventIds.push(kddiEventData.id as string);

  const { data: jtEventData } = await admin
    .from("dividend_events")
    .insert({
      stock_id: jt.id,
      fiscal_year: CURRENT_YEAR,
      payment_year: CURRENT_YEAR,
      event_type: "year_end",
      dividend_per_share: 194,
      expected_payment_month: CURRENT_MONTH,
      expected_payment_date: `${CURRENT_YEAR}-${String(CURRENT_MONTH).padStart(2, "0")}-15`,
      status: "confirmed",
      review_status: "approved",
      source_type: "e2e",
      source_url: "https://example.com/e2e-jt"
    })
    .select("id")
    .single();
  if (jtEventData) createdEventIds.push(jtEventData.id as string);
});

test.afterAll(async () => {
  await deleteDividendEvents(createdEventIds);
  await cleanupUser(user.id);
});

test("portfolio summary card shows exact values", async ({ page }) => {
  await login(page, user.email, user.password);
  await page.goto("/app/portfolio");

  // KDDI NISA: (seed 140 + e2e 150) * 100 = 29,000
  // JT tokutei: (seed 38 + e2e 194) * 100 * (1 - 0.20315) = 18,486.92
  // Total after_tax = 47,486.92 -> ¥47,487
  // Holding count = 2
  const summaryCard = page.locator("div").filter({ hasText: "ポートフォリオ概要" }).first();
  await expect(summaryCard.getByText("2", { exact: true }).first()).toBeVisible();
  await expect(summaryCard.getByText(formatJpy(47486.92)).first()).toBeVisible();

  // Portfolio after-tax yield: annual after-tax dividend / total acquisition cost.
  await expect(summaryCard.getByText(formatPercent(5.8626)).first()).toBeVisible();
});

test("portfolio account filter updates summary and holding cards", async ({ page }) => {
  await login(page, user.email, user.password);
  await page.goto("/app/portfolio");

  // NISA filter: only KDDI
  await page.getByRole("button", { name: "NISA" }).click();
  await expect(page.getByRole("link", { name: new RegExp(kddi.name) })).toBeVisible();
  await expect(page.getByRole("link", { name: new RegExp(jt.name) })).not.toBeVisible();

  // Summary should update to 1 holding
  const summaryCard = page.locator("div").filter({ hasText: "ポートフォリオ概要" }).first();
  await expect(summaryCard.getByText("1", { exact: true }).first()).toBeVisible();
  await expect(summaryCard.getByText(formatJpy(29000)).first()).toBeVisible();

  // 特定口座 filter: only JT
  await page.getByRole("button", { name: "特定口座" }).click();
  await expect(page.getByRole("link", { name: new RegExp(jt.name) })).toBeVisible();
  await expect(page.getByRole("link", { name: new RegExp(kddi.name) })).not.toBeVisible();

  // Back to all
  await page.getByRole("button", { name: "すべて" }).click();
  await expect(page.getByRole("link", { name: new RegExp(kddi.name) })).toBeVisible();
  await expect(page.getByRole("link", { name: new RegExp(jt.name) })).toBeVisible();
});

test("portfolio holding card shows exact values", async ({ page }) => {
  await login(page, user.email, user.password);
  await page.goto("/app/portfolio");

  // KDDI card
  const kddiCard = page.getByRole("link", { name: new RegExp(kddi.name) });
  await expect(kddiCard.getByText(kddi.ticker).first()).toBeVisible();
  await expect(kddiCard.getByText("NISA").first()).toBeVisible();
  await expect(kddiCard.getByText(/100株/).first()).toBeVisible();
  await expect(kddiCard.getByText(formatJpy(4300)).first()).toBeVisible();
  await expect(kddiCard.getByText(formatJpy(29000)).first()).toBeVisible();

  // JT card
  const jtCard = page.getByRole("link", { name: new RegExp(jt.name) });
  await expect(jtCard.getByText(jt.ticker).first()).toBeVisible();
  await expect(jtCard.getByText("特定口座").first()).toBeVisible();
  await expect(jtCard.getByText(/100株/).first()).toBeVisible();
  await expect(jtCard.getByText(formatJpy(3800)).first()).toBeVisible();
  await expect(jtCard.getByText(formatJpy(18486.92)).first()).toBeVisible();
});

test("portfolio empty state when no holdings exist", async ({ page }) => {
  const emptyUser = await createConfirmedUser("e2e-portfolio-empty");

  try {
    await login(page, emptyUser.email, emptyUser.password);
    await page.goto("/app/portfolio");
    await expect(page.getByText("保有銘柄がありません")).toBeVisible();
    await expect(page.getByRole("link", { name: "銘柄を追加" })).toBeVisible();
  } finally {
    await cleanupUser(emptyUser.id);
  }
});
