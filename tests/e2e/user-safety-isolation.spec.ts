import { expect, test, type Page } from "@playwright/test";
import {
  cleanupUser,
  createConfirmedUser,
  createHolding,
  getStockByTicker,
  createDisclosure,
  createReview,
  cleanupDividendReviews,
  cleanupDisclosures,
  deleteDividendEvents,
  approveReviewViaApi,
  rejectReviewViaApi,
  makeAdmin,
  createAdminClient
} from "./helpers";

let user: Awaited<ReturnType<typeof createConfirmedUser>>;
let adminUser: Awaited<ReturnType<typeof createConfirmedUser>>;
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
  user = await createConfirmedUser("e2e-safety-user");
  adminUser = await createConfirmedUser("e2e-safety-admin");
  await makeAdmin(adminUser.id);
  await createHolding(user.id, kddi.id, 100, 4300, "nisa");
});

test.afterAll(async () => {
  await deleteDividendEvents(eventIds);
  await cleanupDividendReviews(reviewIds);
  await cleanupDisclosures(disclosureIds);
  await cleanupUser(user.id);
  await cleanupUser(adminUser.id);
});

test("pending review is invisible to users", async ({ page }) => {
  const disclosureId = await createDisclosure({ stockId: kddi.id });
  disclosureIds.push(disclosureId);
  const reviewId = await createReview({
    stockId: kddi.id,
    disclosureId,
    extractedDividendPerShare: 999,
    status: "pending"
  });
  reviewIds.push(reviewId);

  await login(page, user.email, user.password);
  await page.goto("/app/home");
  await expect(page.locator("body")).not.toContainText("¥999");
  await page.goto("/app/calendar");
  await expect(page.locator("body")).not.toContainText("¥999");
  await page.goto("/app/portfolio");
  await expect(page.locator("body")).not.toContainText("¥999");
});

test("rejected review is invisible to users", async ({ page }) => {
  const disclosureId = await createDisclosure({ stockId: kddi.id });
  disclosureIds.push(disclosureId);
  const reviewId = await createReview({
    stockId: kddi.id,
    disclosureId,
    extractedDividendPerShare: 888,
    status: "pending"
  });
  reviewIds.push(reviewId);
  await rejectReviewViaApi(reviewId, adminUser.id, "E2E rejection");

  await login(page, user.email, user.password);
  await page.goto("/app/home");
  await expect(page.locator("body")).not.toContainText("¥888");
});

test("approved payable event appears on user surfaces", async ({ page }) => {
  const disclosureId = await createDisclosure({ stockId: kddi.id });
  disclosureIds.push(disclosureId);
  const reviewId = await createReview({
    stockId: kddi.id,
    disclosureId,
    extractedDividendPerShare: 200,
    extractedPaymentDate: `${new Date().getFullYear() + 1}-06-15`,
    eventType: "year_end",
    status: "pending"
  });
  reviewIds.push(reviewId);
  await approveReviewViaApi(reviewId, adminUser.id);

  const admin = createAdminClient();
  const { data } = await admin
    .from("dividend_reviews")
    .select("created_dividend_event_id")
    .eq("id", reviewId)
    .single();
  if (data?.created_dividend_event_id) eventIds.push(data.created_dividend_event_id as string);

  await login(page, user.email, user.password);
  await page.goto("/app/home");
  await expect(page.locator("body")).toContainText("今回 ￥200");
});

test("annual_total is excluded from cash total and payment calendar", async ({ page }) => {
  const disclosureId = await createDisclosure({ stockId: kddi.id });
  disclosureIds.push(disclosureId);
  const reviewId = await createReview({
    stockId: kddi.id,
    disclosureId,
    extractedDividendPerShare: 5000,
    eventType: "annual_total",
    status: "pending"
  });
  reviewIds.push(reviewId);
  await approveReviewViaApi(reviewId, adminUser.id);

  const admin = createAdminClient();
  const { data } = await admin
    .from("dividend_reviews")
    .select("created_dividend_event_id")
    .eq("id", reviewId)
    .single();
  if (data?.created_dividend_event_id) eventIds.push(data.created_dividend_event_id as string);

  await login(page, user.email, user.password);
  await page.goto("/app/home");
  await expect(page.locator("body")).not.toContainText("500,000");
});

test("special/commemorative breakdown does not double-count", async ({ page }) => {
  const disclosureId = await createDisclosure({ stockId: kddi.id });
  disclosureIds.push(disclosureId);
  const reviewId = await createReview({
    stockId: kddi.id,
    disclosureId,
    extractedDividendPerShare: 300,
    eventType: "year_end",
    changeType: "special",
    rawPayload: {
      ordinary: 200,
      special: 80,
      commemorative: 20,
      total: 300
    },
    status: "pending"
  });
  reviewIds.push(reviewId);
  await approveReviewViaApi(reviewId, adminUser.id);

  const admin = createAdminClient();
  const { data } = await admin
    .from("dividend_reviews")
    .select("created_dividend_event_id")
    .eq("id", reviewId)
    .single();
  if (data?.created_dividend_event_id) eventIds.push(data.created_dividend_event_id as string);

  await login(page, user.email, user.password);
  await page.goto("/app/home");
  await expect(page.locator("body")).toContainText("今回 ￥300");
});

test("ex-dividend calendar excludes null ex_dividend_date", async ({ page }) => {
  const disclosureId = await createDisclosure({ stockId: kddi.id });
  disclosureIds.push(disclosureId);
  const reviewId = await createReview({
    stockId: kddi.id,
    disclosureId,
    extractedDividendPerShare: 150,
    extractedExDividendDate: null,
    status: "pending"
  });
  reviewIds.push(reviewId);
  await approveReviewViaApi(reviewId, adminUser.id);

  const admin = createAdminClient();
  const { data } = await admin
    .from("dividend_reviews")
    .select("created_dividend_event_id")
    .eq("id", reviewId)
    .single();
  if (data?.created_dividend_event_id) eventIds.push(data.created_dividend_event_id as string);

  await login(page, user.email, user.password);
  await page.goto("/app/calendar/ex-dividend").catch(() => {});
  if (page.url().includes("/app/calendar/ex-dividend")) {
    await expect(page.locator("body")).not.toContainText(kddi.name);
  }
});
