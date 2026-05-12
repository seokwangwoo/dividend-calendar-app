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
  createAdminClient
} from "./helpers";

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
  adminUser = await createConfirmedUser("e2e-approval-admin");
  await makeAdmin(adminUser.id);
});

test.afterAll(async () => {
  await deleteDividendEvents(eventIds);
  await cleanupDividendReviews(reviewIds);
  await cleanupDisclosures(disclosureIds);
  await cleanupUser(adminUser.id);
});

test("approve creates an approved dividend_event", async ({ page }) => {
  const disc = await createDisclosure({ stockId: kddi.id });
  const rev = await createReview({
    stockId: kddi.id,
    disclosureId: disc,
    extractedPaymentYear: new Date().getFullYear() + 1,
    extractedPaymentMonth: 9,
    status: "pending"
  });
  disclosureIds.push(disc);
  reviewIds.push(rev);

  await login(page, adminUser.email, adminUser.password);
  await page.goto(`/admin/dividend-reviews/${rev}`);
  await page.getByRole("button", { name: "承認する" }).click();
  await expect(page).toHaveURL(/\/admin\/dividend-reviews$/);

  const admin = createAdminClient();
  const { data: reviewRow } = await admin
    .from("dividend_reviews")
    .select("status, created_dividend_event_id")
    .eq("id", rev)
    .single();
  expect(reviewRow?.status).toBe("approved");
  expect(reviewRow?.created_dividend_event_id).toBeTruthy();
  eventIds.push(reviewRow!.created_dividend_event_id as string);

  const { data: eventRow } = await admin
    .from("dividend_events")
    .select("review_status, expected_payment_year")
    .eq("id", reviewRow!.created_dividend_event_id)
    .single();
  expect(eventRow?.review_status).toBe("approved");
  expect(eventRow?.expected_payment_year).toBe(new Date().getFullYear() + 1);
});

test("month-only review requires expectedPaymentYear override before approval", async ({ page }) => {
  const disc = await createDisclosure({ stockId: kddi.id });
  const rev = await createReview({
    stockId: kddi.id,
    disclosureId: disc,
    extractedPaymentYear: null,
    extractedPaymentMonth: 6,
    status: "pending"
  });
  disclosureIds.push(disc);
  reviewIds.push(rev);

  await login(page, adminUser.email, adminUser.password);
  await page.goto(`/admin/dividend-reviews/${rev}`);
  await page.getByRole("button", { name: "承認する" }).click();
  // HTML5 validation should block submission because expectedPaymentYear is required
  await expect(page).toHaveURL(new RegExp(`/admin/dividend-reviews/${rev}$`));

  await page.goto(`/admin/dividend-reviews/${rev}`);
  await page.locator("input[name='expectedPaymentYear']").fill(String(new Date().getFullYear() + 1));
  await page.getByRole("button", { name: "承認する" }).click();
  await expect(page).toHaveURL(/\/admin\/dividend-reviews$/);

  const admin = createAdminClient();
  const { data: reviewRow } = await admin
    .from("dividend_reviews")
    .select("created_dividend_event_id")
    .eq("id", rev)
    .single();
  if (reviewRow?.created_dividend_event_id) eventIds.push(reviewRow.created_dividend_event_id as string);

  const { data: eventRow } = await admin
    .from("dividend_events")
    .select("expected_payment_year")
    .eq("id", reviewRow!.created_dividend_event_id)
    .single();
  expect(eventRow?.expected_payment_year).toBe(new Date().getFullYear() + 1);
});

test("approval with override values persists correctly", async ({ page }) => {
  const disc = await createDisclosure({ stockId: kddi.id });
  const rev = await createReview({
    stockId: kddi.id,
    disclosureId: disc,
    extractedDividendPerShare: 100,
    extractedPaymentYear: new Date().getFullYear() + 1,
    extractedPaymentMonth: 3,
    status: "pending"
  });
  disclosureIds.push(disc);
  reviewIds.push(rev);

  await login(page, adminUser.email, adminUser.password);
  await page.goto(`/admin/dividend-reviews/${rev}`);
  await page.locator("input[name='dividendPerShare']").fill("250");
  await page.locator("input[name='recordDate']").fill(`${new Date().getFullYear() + 1}-03-01`);
  await page.locator("select[name='status']").selectOption("confirmed");
  await page.getByRole("button", { name: "承認する" }).click();
  await expect(page).toHaveURL(/\/admin\/dividend-reviews$/);

  const admin = createAdminClient();
  const { data: reviewRow } = await admin
    .from("dividend_reviews")
    .select("created_dividend_event_id")
    .eq("id", rev)
    .single();
  const eventId = reviewRow!.created_dividend_event_id as string;
  eventIds.push(eventId);

  const { data: eventRow } = await admin
    .from("dividend_events")
    .select("dividend_per_share, record_date, status")
    .eq("id", eventId)
    .single();
  expect(eventRow?.dividend_per_share).toBe(250);
  expect(eventRow?.record_date).toBe(`${new Date().getFullYear() + 1}-03-01`);
  expect(eventRow?.status).toBe("confirmed");
});

test("duplicate approval is idempotent", async ({ page }) => {
  const disc = await createDisclosure({ stockId: kddi.id });
  const rev = await createReview({
    stockId: kddi.id,
    disclosureId: disc,
    extractedPaymentYear: new Date().getFullYear() + 1,
    extractedPaymentMonth: 7,
    status: "pending"
  });
  disclosureIds.push(disc);
  reviewIds.push(rev);

  await login(page, adminUser.email, adminUser.password);
  await page.goto(`/admin/dividend-reviews/${rev}`);
  await page.getByRole("button", { name: "承認する" }).click();
  await expect(page).toHaveURL(/\/admin\/dividend-reviews$/);

  const admin = createAdminClient();
  const { data: firstReview } = await admin
    .from("dividend_reviews")
    .select("created_dividend_event_id")
    .eq("id", rev)
    .single();
  const firstEventId = firstReview!.created_dividend_event_id as string;
  eventIds.push(firstEventId);

  await page.goto(`/admin/dividend-reviews/${rev}`);
  const approveButton = page.getByRole("button", { name: "承認する" });
  if (await approveButton.isVisible().catch(() => false)) {
    await approveButton.click();
  }

  const { data: secondReview } = await admin
    .from("dividend_reviews")
    .select("created_dividend_event_id")
    .eq("id", rev)
    .single();
  expect(secondReview?.created_dividend_event_id).toBe(firstEventId);

  const { count } = await admin
    .from("dividend_events")
    .select("*", { count: "exact", head: true })
    .eq("id", firstEventId);
  expect(count).toBe(1);
});

test("reject prevents event creation and stores reason", async ({ page }) => {
  const disc = await createDisclosure({ stockId: kddi.id });
  const rev = await createReview({
    stockId: kddi.id,
    disclosureId: disc,
    status: "pending"
  });
  disclosureIds.push(disc);
  reviewIds.push(rev);

  await login(page, adminUser.email, adminUser.password);
  await page.goto(`/admin/dividend-reviews/${rev}`);
  await page.locator("input[name='reason']").fill("E2E reject reason");
  await page.getByRole("button", { name: "却下する" }).click();
  await expect(page).toHaveURL(/\/admin\/dividend-reviews$/);

  const admin = createAdminClient();
  const { data: reviewRow } = await admin
    .from("dividend_reviews")
    .select("status, rejection_reason, created_dividend_event_id")
    .eq("id", rev)
    .single();
  expect(reviewRow?.status).toBe("rejected");
  expect(reviewRow?.rejection_reason).toBe("E2E reject reason");
  expect(reviewRow?.created_dividend_event_id).toBeNull();
});

test("approving one review from a multi-event disclosure leaves siblings untouched", async ({ page }) => {
  const disc = await createDisclosure({ stockId: kddi.id });
  const rev1 = await createReview({
    stockId: kddi.id,
    disclosureId: disc,
    eventType: "interim",
    extractedPaymentYear: new Date().getFullYear() + 1,
    extractedPaymentMonth: 9,
    status: "pending"
  });
  const rev2 = await createReview({
    stockId: kddi.id,
    disclosureId: disc,
    eventType: "year_end",
    extractedPaymentYear: new Date().getFullYear() + 1,
    extractedPaymentMonth: 3,
    status: "pending"
  });
  disclosureIds.push(disc);
  reviewIds.push(rev1, rev2);

  await login(page, adminUser.email, adminUser.password);
  await page.goto(`/admin/dividend-reviews/${rev1}`);
  await page.getByRole("button", { name: "承認する" }).click();
  await expect(page).toHaveURL(/\/admin\/dividend-reviews$/);

  const admin = createAdminClient();
  const { data: r1 } = await admin.from("dividend_reviews").select("status").eq("id", rev1).single();
  const { data: r2 } = await admin.from("dividend_reviews").select("status").eq("id", rev2).single();
  expect(r1?.status).toBe("approved");
  expect(r2?.status).toBe("pending");

  const { count } = await admin
    .from("dividend_events")
    .select("*", { count: "exact", head: true })
    .eq("disclosure_id", disc);
  expect(count).toBe(1);
});

test("annual_total approval creates reference-only event", async ({ page }) => {
  const disc = await createDisclosure({ stockId: kddi.id });
  const rev = await createReview({
    stockId: kddi.id,
    disclosureId: disc,
    eventType: "annual_total",
    status: "pending"
  });
  disclosureIds.push(disc);
  reviewIds.push(rev);

  await login(page, adminUser.email, adminUser.password);
  await page.goto(`/admin/dividend-reviews/${rev}`);
  await page.getByRole("button", { name: "承認する" }).click();
  await expect(page).toHaveURL(/\/admin\/dividend-reviews$/);

  const admin = createAdminClient();
  const { data: reviewRow } = await admin
    .from("dividend_reviews")
    .select("created_dividend_event_id")
    .eq("id", rev)
    .single();
  const eventId = reviewRow!.created_dividend_event_id as string;
  eventIds.push(eventId);

  const { data: eventRow } = await admin
    .from("dividend_events")
    .select("event_type, review_status")
    .eq("id", eventId)
    .single();
  expect(eventRow?.event_type).toBe("annual_total");
  expect(eventRow?.review_status).toBe("approved");
});
