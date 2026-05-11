import { expect, test, type Page } from "@playwright/test";
import {
  cleanupUser,
  createConfirmedUser,
  getStockByTicker,
  makeAdmin,
  createDisclosure,
  createReview,
  cleanupDividendReviews,
  cleanupDisclosures
} from "./helpers";

let adminUser: Awaited<ReturnType<typeof createConfirmedUser>>;
let normalUser: Awaited<ReturnType<typeof createConfirmedUser>>;
let kddi: Awaited<ReturnType<typeof getStockByTicker>>;
const reviewIds: string[] = [];
const disclosureIds: string[] = [];

async function login(page: Page, email: string, password: string) {
  await page.goto("/auth/login");
  await page.getByLabel("メールアドレス").fill(email);
  await page.getByLabel("パスワード").fill(password);
  await page.getByRole("button", { name: "ログイン" }).click();
  await expect(page).toHaveURL(/\/app\/home/);
}

test.beforeAll(async () => {
  kddi = await getStockByTicker("9433");
  normalUser = await createConfirmedUser("e2e-adminui-normal");
  adminUser = await createConfirmedUser("e2e-adminui-admin");
  await makeAdmin(adminUser.id);
});

test.afterAll(async () => {
  await cleanupDividendReviews(reviewIds);
  await cleanupDisclosures(disclosureIds);
  await cleanupUser(normalUser.id);
  await cleanupUser(adminUser.id);
});

test("list shows pending and needs-manual-check by default", async ({ page }) => {
  const disc1 = await createDisclosure({ stockId: kddi.id });
  const rev1 = await createReview({ stockId: kddi.id, disclosureId: disc1, status: "pending" });
  const disc2 = await createDisclosure({ stockId: kddi.id });
  const rev2 = await createReview({ stockId: kddi.id, disclosureId: disc2, status: "needs_manual_check" });
  const disc3 = await createDisclosure({ stockId: kddi.id });
  const rev3 = await createReview({ stockId: kddi.id, disclosureId: disc3, status: "approved" });
  const disc4 = await createDisclosure({ stockId: kddi.id });
  const rev4 = await createReview({ stockId: kddi.id, disclosureId: disc4, status: "rejected" });
  disclosureIds.push(disc1, disc2, disc3, disc4);
  reviewIds.push(rev1, rev2, rev3, rev4);

  await login(page, adminUser.email, adminUser.password);
  await page.goto("/admin/dividend-reviews");

  await expect(page.locator("tbody").getByText("保留中").first()).toBeVisible();
  await expect(page.locator("tbody").getByText("要確認").first()).toBeVisible();
  await expect(page.locator("tbody").getByText("承認済")).not.toBeVisible();

  await page.locator("select[name='status']").selectOption("approved");
  await page.getByRole("button", { name: "絞り込む" }).click();
  await expect(page.locator("tbody").getByText("承認済").first()).toBeVisible();
});

test("priority sorting and filters", async ({ page }) => {
  const discUrgent = await createDisclosure({ stockId: kddi.id, reviewPriority: "urgent" });
  const revUrgent = await createReview({ stockId: kddi.id, disclosureId: discUrgent, status: "pending" });
  const discHigh = await createDisclosure({ stockId: kddi.id, reviewPriority: "high" });
  const revHigh = await createReview({ stockId: kddi.id, disclosureId: discHigh, status: "pending" });
  const discNormal = await createDisclosure({ stockId: kddi.id, reviewPriority: "normal" });
  const revNormal = await createReview({ stockId: kddi.id, disclosureId: discNormal, status: "pending" });
  const discLow = await createDisclosure({ stockId: kddi.id, reviewPriority: "low" });
  const revLow = await createReview({ stockId: kddi.id, disclosureId: discLow, status: "pending" });
  disclosureIds.push(discUrgent, discHigh, discNormal, discLow);
  reviewIds.push(revUrgent, revHigh, revNormal, revLow);

  await login(page, adminUser.email, adminUser.password);
  await page.goto("/admin/dividend-reviews");

  const rows = page.locator("tbody tr");
  const firstPriority = await rows.first().locator("td").first().textContent();
  expect(firstPriority).toContain("緊急");

  await page.locator("select[name='priority']").selectOption("high");
  await page.getByRole("button", { name: "絞り込む" }).click();
  await expect(page.locator("tbody").getByText("高")).toBeVisible();
  await expect(page.locator("tbody").getByText("緊急")).not.toBeVisible();
});

test("disclosure type and ticker filters", async ({ page }) => {
  const discRev = await createDisclosure({ stockId: kddi.id, disclosureType: "dividend_forecast_revision" });
  const revRev = await createReview({ stockId: kddi.id, disclosureId: discRev, status: "pending" });
  const discEarn = await createDisclosure({ stockId: kddi.id, disclosureType: "earnings_release" });
  const revEarn = await createReview({ stockId: kddi.id, disclosureId: discEarn, status: "pending" });
  disclosureIds.push(discRev, discEarn);
  reviewIds.push(revRev, revEarn);

  await login(page, adminUser.email, adminUser.password);
  await page.goto("/admin/dividend-reviews");

  await page.locator("select[name='disclosureType']").selectOption("earnings_release");
  await page.getByRole("button", { name: "絞り込む" }).click();
  await expect(page.getByText("AI配当候補レビュー")).toBeVisible();

  await page.locator("input[name='ticker']").fill("9433");
  await page.getByRole("button", { name: "絞り込む" }).click();
  await expect(page.getByText("9433")).toBeVisible();
});

test("signed PDF button appears only when storage_path exists", async ({ page }) => {
  const discNoPath = await createDisclosure({ stockId: kddi.id, storagePath: null });
  const revNoPath = await createReview({ stockId: kddi.id, disclosureId: discNoPath, status: "pending" });
  const discWithPath = await createDisclosure({
    stockId: kddi.id,
    storagePath: "disclosures/9433/2026-01-01/test.pdf"
  });
  const revWithPath = await createReview({ stockId: kddi.id, disclosureId: discWithPath, status: "pending" });
  disclosureIds.push(discNoPath, discWithPath);
  reviewIds.push(revNoPath, revWithPath);

  await login(page, adminUser.email, adminUser.password);

  await page.goto(`/admin/dividend-reviews/${revNoPath}`);
  await expect(page.getByText("PDFは保管されていません")).toBeVisible();
  await expect(page.locator("text=署名付きURLを生成")).not.toBeVisible();

  await page.goto(`/admin/dividend-reviews/${revWithPath}`);
  await expect(page.locator("text=署名付きURLを生成")).toBeVisible();
});

test("raw payload is visible to admins only", async ({ page }) => {
  const disc = await createDisclosure({ stockId: kddi.id });
  const rev = await createReview({ stockId: kddi.id, disclosureId: disc, status: "pending" });
  disclosureIds.push(disc);
  reviewIds.push(rev);

  await login(page, adminUser.email, adminUser.password);
  await page.goto(`/admin/dividend-reviews/${rev}`);
  await page.getByText("RAWペイロード（管理者専用）").click();
  await expect(page.locator("pre")).toContainText("eventType");

  await page.goto("/app/settings");
  await page.getByRole("button", { name: "ログアウト" }).click();
  await login(page, normalUser.email, normalUser.password);
  await page.goto(`/admin/dividend-reviews/${rev}`);
  await expect(page).not.toHaveURL(/\/admin\/dividend-reviews\//);
});

test("correction disclosure is marked high priority", async ({ page }) => {
  const disc = await createDisclosure({ stockId: kddi.id, disclosureType: "correction", reviewPriority: "high" });
  const rev = await createReview({ stockId: kddi.id, disclosureId: disc, status: "pending" });
  disclosureIds.push(disc);
  reviewIds.push(rev);

  await login(page, adminUser.email, adminUser.password);
  await page.goto("/admin/dividend-reviews");
  await expect(page.locator("tbody").getByText("高").first()).toBeVisible();
});
