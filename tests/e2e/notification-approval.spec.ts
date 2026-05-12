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
  cleanupNotificationsForUser
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
  normalUser = await createConfirmedUser("e2e-notif-user");
  adminUser = await createConfirmedUser("e2e-notif-admin");
  await makeAdmin(adminUser.id);
  await createHolding(normalUser.id, kddi.id, 100, 4300, "nisa");
});

test.beforeEach(async () => {
  await cleanupNotificationsForUser(normalUser.id);
});

test.afterAll(async () => {
  await deleteDividendEvents(eventIds);
  await cleanupDividendReviews(reviewIds);
  await cleanupDisclosures(disclosureIds);
  await cleanupUser(normalUser.id);
  await cleanupUser(adminUser.id);
});

async function seedAndApprove(
  page: Page,
  changeType: string,
  overrides: Record<string, unknown> = {}
) {
  const disc = await createDisclosure({ stockId: kddi.id });
  const rev = await createReview({
    stockId: kddi.id,
    disclosureId: disc,
    changeType,
    extractedPaymentYear: new Date().getFullYear() + 1,
    extractedPaymentMonth: 9,
    ...overrides
  });
  disclosureIds.push(disc);
  reviewIds.push(rev);

  await login(page, adminUser.email, adminUser.password);
  await page.goto(`/admin/dividend-reviews/${rev}`);
  await page.getByRole("button", { name: "承認する" }).click();
  await expect(page).toHaveURL(/\/admin\/dividend-reviews$/);

  const { data } = await (await import("./helpers")).createAdminClient()
    .from("dividend_reviews")
    .select("created_dividend_event_id")
    .eq("id", rev)
    .single();
  if (data?.created_dividend_event_id) eventIds.push(data.created_dividend_event_id as string);
  return rev;
}

test("increase approval creates dividend_increase notification", async ({ page }) => {
  await seedAndApprove(page, "increase");
  const notifs = await getNotificationsForUser(normalUser.id);
  const increaseNotif = notifs.find((n) => n.type === "dividend_increase");
  expect(increaseNotif).toBeTruthy();
  expect(increaseNotif?.title).toContain("増額");

  await login(page, normalUser.email, normalUser.password);
  await page.goto("/app/notifications");
  await expect(page.getByText("配当予想が増額されました")).toBeVisible();
});

test("decrease approval creates dividend_decrease notification", async ({ page }) => {
  await seedAndApprove(page, "decrease");
  const notifs = await getNotificationsForUser(normalUser.id);
  const decreaseNotif = notifs.find((n) => n.type === "dividend_decrease");
  expect(decreaseNotif).toBeTruthy();
});

test("no_dividend approval creates no_dividend notification", async ({ page }) => {
  await seedAndApprove(page, "no_dividend", { extractedDividendPerShare: 0 });
  const notifs = await getNotificationsForUser(normalUser.id);
  const noDivNotif = notifs.find((n) => n.type === "no_dividend");
  expect(noDivNotif).toBeTruthy();
});

test("special approval creates special_dividend notification", async ({ page }) => {
  await seedAndApprove(page, "special");
  const notifs = await getNotificationsForUser(normalUser.id);
  const specialNotif = notifs.find((n) => n.type === "special_dividend");
  expect(specialNotif).toBeTruthy();
});

test("unchanged approval does not create notification", async ({ page }) => {
  await seedAndApprove(page, "unchanged");
  const notifs = await getNotificationsForUser(normalUser.id);
  const changeNotifs = notifs.filter((n) =>
    ["dividend_increase", "dividend_decrease", "no_dividend", "special_dividend"].includes(n.type)
  );
  expect(changeNotifs.length).toBe(0);
});

test("duplicate approval does not duplicate notifications", async ({ page }) => {
  const disc = await createDisclosure({ stockId: kddi.id });
  const rev = await createReview({
    stockId: kddi.id,
    disclosureId: disc,
    changeType: "increase",
    extractedPaymentYear: new Date().getFullYear() + 1,
    extractedPaymentMonth: 10
  });
  disclosureIds.push(disc);
  reviewIds.push(rev);

  await login(page, adminUser.email, adminUser.password);
  await page.goto(`/admin/dividend-reviews/${rev}`);
  await page.getByRole("button", { name: "承認する" }).click();
  await expect(page).toHaveURL(/\/admin\/dividend-reviews$/);

  const { data } = await (await import("./helpers")).createAdminClient()
    .from("dividend_reviews")
    .select("created_dividend_event_id")
    .eq("id", rev)
    .single();
  if (data?.created_dividend_event_id) eventIds.push(data.created_dividend_event_id as string);

  const beforeCount = (await getNotificationsForUser(normalUser.id)).filter(
    (n) => n.type === "dividend_increase"
  ).length;

  await page.goto(`/admin/dividend-reviews/${rev}`);
  const approveButton = page.getByRole("button", { name: "承認する" });
  if (await approveButton.isVisible().catch(() => false)) {
    await approveButton.click();
  }

  const afterCount = (await getNotificationsForUser(normalUser.id)).filter(
    (n) => n.type === "dividend_increase"
  ).length;
  expect(afterCount).toBe(beforeCount);
});

test("rejected review does not create notification", async ({ page }) => {
  const disc = await createDisclosure({ stockId: kddi.id });
  const rev = await createReview({
    stockId: kddi.id,
    disclosureId: disc,
    changeType: "increase",
    extractedPaymentYear: new Date().getFullYear() + 1,
    extractedPaymentMonth: 11
  });
  disclosureIds.push(disc);
  reviewIds.push(rev);

  const beforeCount = (await getNotificationsForUser(normalUser.id)).length;

  await login(page, adminUser.email, adminUser.password);
  await page.goto(`/admin/dividend-reviews/${rev}`);
  await page.locator("input[name='reason']").fill("E2E reject");
  await page.getByRole("button", { name: "却下する" }).click();
  await expect(page).toHaveURL(/\/admin\/dividend-reviews$/);

  const afterCount = (await getNotificationsForUser(normalUser.id)).length;
  expect(afterCount).toBe(beforeCount);
});
