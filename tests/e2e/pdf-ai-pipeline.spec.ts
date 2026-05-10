import { expect, test, type Page } from "@playwright/test";
import {
  cleanupUser,
  createConfirmedUser,
  getStockByTicker,
  makeAdmin,
  createDisclosure,
  createReview,
  cleanupDividendReviews,
  cleanupDisclosures,
  deleteDividendEvents,
  createHolding,
  getNotificationsForUser,
  createAdminClient
} from "./helpers";

let adminUser: Awaited<ReturnType<typeof createConfirmedUser>>;
let normalUser: Awaited<ReturnType<typeof createConfirmedUser>>;
let kddi: Awaited<ReturnType<typeof getStockByTicker>>;
const reviewIds: string[] = [];
const disclosureIds: string[] = [];
const eventIds: string[] = [];

async function login(page: Page, email: string, password: string) {
  await page.goto("/auth/login");
  await page.getByLabel("メールアドレス").fill(email);
  await page.getByLabel("パスワード").fill(password);
  await page.getByRole("button", { name: "ログイン" }).click();
  await expect(page).toHaveURL(/\/app\/home/);
}

test.beforeAll(async () => {
  kddi = await getStockByTicker("9433");
  normalUser = await createConfirmedUser("e2e-pipeline-user");
  adminUser = await createConfirmedUser("e2e-pipeline-admin");
  await makeAdmin(adminUser.id);
  await createHolding(normalUser.id, kddi.id, 100, 4300, "nisa");
});

test.afterAll(async () => {
  await deleteDividendEvents(eventIds);
  await cleanupDividendReviews(reviewIds);
  await cleanupDisclosures(disclosureIds);
  await cleanupUser(normalUser.id);
  await cleanupUser(adminUser.id);
});

test("full pipeline from disclosure to user reflection", async ({ page }) => {
  const disc = await createDisclosure({
    stockId: kddi.id,
    storagePath: "disclosures/9433/2026-01-01/e2e-pipeline.pdf"
  });
  disclosureIds.push(disc);

  const revYearEnd = await createReview({
    stockId: kddi.id,
    disclosureId: disc,
    eventType: "year_end",
    changeType: "increase",
    extractedDividendPerShare: 180,
    extractedPaymentDate: `${new Date().getFullYear() + 1}-06-15`,
    status: "pending"
  });
  const revAnnualTotal = await createReview({
    stockId: kddi.id,
    disclosureId: disc,
    eventType: "annual_total",
    extractedDividendPerShare: 360,
    status: "pending"
  });
  reviewIds.push(revYearEnd, revAnnualTotal);

  await login(page, adminUser.email, adminUser.password);
  await page.goto("/admin/dividend-reviews");
  await expect(page.getByText("AI配当候補レビュー")).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(2);

  await page.goto(`/admin/dividend-reviews/${revYearEnd}`);
  await expect(page.getByRole("heading", { name: "AI抽出値" })).toBeVisible();
  await expect(page.getByText("署名付きURLを生成")).toBeVisible();

  await page.getByRole("button", { name: "承認する" }).click();
  await expect(page).toHaveURL(/\/admin\/dividend-reviews$/);

  const admin = createAdminClient();
  const { data: yearEndReview } = await admin
    .from("dividend_reviews")
    .select("created_dividend_event_id")
    .eq("id", revYearEnd)
    .single();
  if (yearEndReview?.created_dividend_event_id) {
    eventIds.push(yearEndReview.created_dividend_event_id as string);
  }

  await page.goto("/app/settings");
  await page.getByRole("button", { name: "ログアウト" }).click();
  await login(page, normalUser.email, normalUser.password);
  await page.goto("/app/home");
  await expect(page.locator("body")).toContainText("今回 ￥180");

  await page.goto("/app/calendar");
  await page.locator("button:has-text('›')").click();
  await expect(page.getByText(`${new Date().getFullYear() + 1}年6月`)).toBeVisible();

  await page.goto("/app/portfolio");
  await expect(page.locator("body")).toContainText(kddi.name);

  await page.goto("/app/notifications");
  await expect(page.getByText("配当予想が増額されました")).toBeVisible();

  await page.goto("/app/settings");
  await page.getByRole("button", { name: "ログアウト" }).click();
  await login(page, adminUser.email, adminUser.password);
  await page.goto(`/admin/dividend-reviews/${revAnnualTotal}`);
  await page.getByRole("button", { name: "承認する" }).click();
  await expect(page).toHaveURL(/\/admin\/dividend-reviews$/);

  const { data: annualReview } = await admin
    .from("dividend_reviews")
    .select("created_dividend_event_id")
    .eq("id", revAnnualTotal)
    .single();
  if (annualReview?.created_dividend_event_id) {
    eventIds.push(annualReview.created_dividend_event_id as string);
  }

  await page.goto("/app/settings");
  await page.getByRole("button", { name: "ログアウト" }).click();
  await login(page, normalUser.email, normalUser.password);
  await page.goto("/app/home");
  await expect(page.locator("body")).not.toContainText("36,000");

  const discCorrection = await createDisclosure({
    stockId: kddi.id,
    disclosureType: "correction",
    reviewPriority: "high"
  });
  const revCorrection = await createReview({
    stockId: kddi.id,
    disclosureId: discCorrection,
    confidenceScore: 0.3,
    status: "pending"
  });
  disclosureIds.push(discCorrection);
  reviewIds.push(revCorrection);

  await page.goto("/app/settings");
  await page.getByRole("button", { name: "ログアウト" }).click();
  await login(page, adminUser.email, adminUser.password);
  await page.goto(`/admin/dividend-reviews/${revCorrection}`);
  await page.locator("input[name='reason']").fill("Low confidence");
  await page.getByRole("button", { name: "却下する" }).click();
  await expect(page).toHaveURL(/\/admin\/dividend-reviews$/);

  await page.goto("/app/settings");
  await page.getByRole("button", { name: "ログアウト" }).click();
  await login(page, normalUser.email, normalUser.password);
  await page.goto("/app/notifications");
  const notifs = await getNotificationsForUser(normalUser.id);
  const rejectedNotif = notifs.find((n) => n.body.includes("Low confidence"));
  expect(rejectedNotif).toBeUndefined();
});
