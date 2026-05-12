import { expect, test } from "@playwright/test";
import {
  cleanupDisclosures,
  cleanupDividendReviews,
  cleanupJobs,
  cleanupUser,
  createAdminClient,
  createConfirmedUser,
  deleteDividendEvents,
  getStockByTicker,
  makeAdmin
} from "./helpers";

/**
 * System Pipeline E2E
 *
 * Uses Playwright request.post() to invoke Edge Functions directly and asserts
 * that the resulting DB state is reflected in the Admin UI.
 *
 * These tests verify the HTTP contract -> DB -> UI reflection path for
 * collect-disclosures and process-jobs, which have no user-facing trigger UI
 * in the MVP.
 */

const PASSWORD = "Test1234!";
const FUNCTION_BASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1`
  : "http://localhost:54321/functions/v1";

async function getServiceRoleHeader() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  return { Authorization: `Bearer ${key}` };
}

async function invokeCollectDisclosures(
  request: typeof test.prototype.request,
  candidate: Record<string, unknown>
) {
  return request.post(`${FUNCTION_BASE_URL}/collect-disclosures`, {
    headers: await getServiceRoleHeader(),
    data: { mode: "test", candidates: [candidate] }
  });
}

async function invokeRecentCollectDisclosures(
  request: typeof test.prototype.request,
  limit: number
) {
  return request.post(`${FUNCTION_BASE_URL}/collect-disclosures`, {
    headers: await getServiceRoleHeader(),
    data: { mode: "recent", limit }
  });
}

async function invokeProcessJobs(
  request: typeof test.prototype.request,
  supportedTypes?: string[],
  batchSize?: number
) {
  const payload: Record<string, unknown> = {};
  if (supportedTypes) payload.supported_types = supportedTypes;
  if (batchSize !== undefined) payload.batch_size = batchSize;
  return request.post(`${FUNCTION_BASE_URL}/process-jobs`, {
    headers: await getServiceRoleHeader(),
    data: payload
  });
}

test.describe("system pipeline", () => {
  let adminUser: Awaited<ReturnType<typeof createConfirmedUser>>;
  let stock: Awaited<ReturnType<typeof getStockByTicker>>;
  const disclosureIds: string[] = [];
  const reviewIds: string[] = [];
  const jobIds: string[] = [];
  const eventIds: string[] = [];

  test.beforeAll(async () => {
    stock = await getStockByTicker("9433");
    adminUser = await createConfirmedUser("e2e-sys-admin");
    await makeAdmin(adminUser.id);
  });

  test.afterAll(async () => {
    await deleteDividendEvents(eventIds);
    await cleanupDividendReviews(reviewIds);
    await cleanupJobs(jobIds);
    await cleanupDisclosures(disclosureIds);
    await cleanupUser(adminUser.id);
  });

  test("fixture candidate via collect-disclosures creates disclosure and download job", async ({
    request,
    page
  }) => {
    const externalId = `e2e-collect-${Date.now()}`;
    const candidate = {
      externalId,
      ticker: stock.ticker,
      sourceType: "tdnet",
      title: "配当予想の修正 e2e",
      documentUrl: "https://example.com/e2e-fixture.pdf",
      publishedAt: new Date().toISOString()
    };

    const response = await invokeCollectDisclosures(request, candidate);
    expect(response.status()).toBe(200);
    const body = (await response.json()) as {
      results?: Array<{ disclosureId: string; inserted: boolean }>;
    };
    expect(body.results?.length).toBe(1);
    expect(body.results?.[0]?.inserted).toBe(true);

    const disclosureId = body.results![0].disclosureId;
    disclosureIds.push(disclosureId);

    // Verify DB state via service-role client
    const admin = createAdminClient();
    const { data: disclosure } = await admin
      .from("disclosures")
      .select("id, external_id, parse_status")
      .eq("id", disclosureId)
      .single();
    expect(disclosure).toMatchObject({
      external_id: externalId,
      parse_status: "pending"
    });

    const { data: jobs } = await admin
      .from("jobs")
      .select("id, type, status, payload")
      .filter("payload->>disclosureId", "eq", disclosureId);
    expect(jobs).toHaveLength(1);
    expect(jobs![0]).toMatchObject({
      type: "download_disclosure_pdf",
      status: "pending"
    });
    jobIds.push(jobs![0].id);

    // Verify admin UI reflects the new disclosure (diagnostics page)
    await page.goto("/auth/login");
    await page.getByLabel("メールアドレス").fill(adminUser.email);
    await page.getByLabel("パスワード").fill(PASSWORD);
    await page.getByRole("button", { name: "ログイン" }).click();
    await expect(page).toHaveURL(/\/app\/home/);

    await page.goto("/admin/disclosures");
    await expect(page.getByText("公示データ")).toBeVisible();
    // The diagnostics page shows aggregate counts; we just assert it loads
    // without error after collection. A more precise assertion can be added
    // once the UI exposes per-disclosure lists.
    await expect(page.getByText("収集フロー")).toBeVisible();
  });

  test("collect-disclosures is idempotent for duplicate candidates", async ({
    request
  }) => {
    const externalId = `e2e-idempotent-${Date.now()}`;
    const candidate = {
      externalId,
      ticker: stock.ticker,
      sourceType: "tdnet",
      title: "配当予想の修正 e2e-idempotent",
      documentUrl: "https://example.com/e2e-idempotent.pdf",
      publishedAt: new Date().toISOString()
    };

    const first = await invokeCollectDisclosures(request, candidate);
    expect(first.status()).toBe(200);
    const firstBody = (await first.json()) as {
      results?: Array<{ disclosureId: string; inserted: boolean }>;
    };
    expect(firstBody.results?.[0]?.inserted).toBe(true);
    const disclosureId = firstBody.results![0].disclosureId;
    disclosureIds.push(disclosureId);

    const second = await invokeCollectDisclosures(request, candidate);
    expect(second.status()).toBe(200);
    const secondBody = (await second.json()) as {
      results?: Array<{ disclosureId: string; inserted: boolean }>;
    };
    expect(secondBody.results?.[0]?.inserted).toBe(false);
    expect(secondBody.results?.[0]?.disclosureId).toBe(disclosureId);

    const admin = createAdminClient();
    const { data: disclosures } = await admin
      .from("disclosures")
      .select("id")
      .eq("external_id", externalId);
    expect(disclosures).toHaveLength(1);

    const { data: jobs } = await admin
      .from("jobs")
      .select("id")
      .filter("payload->>disclosureId", "eq", disclosureId);
    jobIds.push(...(jobs ?? []).map((j) => j.id));
    expect(jobs).toHaveLength(1);
  });

  test("recent mode fetches Yanoshin and returns structured JSON", async ({
    request
  }) => {
    test.setTimeout(120000);

    const response = await invokeRecentCollectDisclosures(request, 10);
    expect(response.status()).toBe(200);

    const body = (await response.json()) as {
      sourceUrl?: string | null;
      results?: Array<{
        externalId: string;
        disclosureId?: string;
        inserted?: boolean;
        jobCreated?: boolean;
        skipped?: string;
        error?: string;
      }>;
    };

    expect(body.sourceUrl).toMatch(
      /^https:\/\/webapi\.yanoshin\.jp\/webapi\/tdnet\/list\/recent\.json2\?/
    );
    expect(Array.isArray(body.results)).toBe(true);

    const createdDisclosureIds = body.results
      ?.filter((result) => result.inserted && result.disclosureId)
      .map((result) => result.disclosureId as string) ?? [];
    disclosureIds.push(...createdDisclosureIds);

    if (createdDisclosureIds.length > 0) {
      const admin = createAdminClient();
      const { data: jobs } = await admin
        .from("jobs")
        .select("id")
        .filter("payload->>disclosureId", "in", `(${createdDisclosureIds.join(",")})`);
      jobIds.push(...(jobs ?? []).map((job) => job.id));
    }

    expect(
      body.results?.every(
        (result) =>
          typeof result.externalId === "string" &&
          (result.inserted === true ||
            result.inserted === false ||
            typeof result.skipped === "string" ||
            typeof result.error === "string")
      )
    ).toBe(true);
  });

  test("missing document_url disclosure is skipped and no job created", async ({
    request
  }) => {
    const externalId = `e2e-no-url-${Date.now()}`;
    const candidate = {
      externalId,
      ticker: stock.ticker,
      sourceType: "tdnet",
      title: "配当予想の修正 e2e-no-url",
      documentUrl: null,
      publishedAt: new Date().toISOString()
    };

    const response = await invokeCollectDisclosures(request, candidate);
    expect(response.status()).toBe(200);
    const body = (await response.json()) as {
      results?: Array<{ disclosureId: string; inserted: boolean; skipped?: boolean }>;
    };
    expect(body.results?.[0]?.inserted).toBe(true);
    const disclosureId = body.results![0].disclosureId;
    disclosureIds.push(disclosureId);

    const admin = createAdminClient();
    const { data: disclosure } = await admin
      .from("disclosures")
      .select("parse_status, review_priority")
      .eq("id", disclosureId)
      .single();
    expect(disclosure).toMatchObject({
      parse_status: "skipped",
      review_priority: "high"
    });

    const { data: jobs } = await admin
      .from("jobs")
      .select("id")
      .filter("payload->>disclosureId", "eq", disclosureId);
    expect(jobs).toHaveLength(0);
  });

  test("process-jobs final-failure marks job and disclosure as failed", async ({
    request
  }) => {
    // Seed a disclosure with a URL that will fail (404)
    const admin = createAdminClient();
    const externalId = `e2e-fail-${Date.now()}`;
    const { data: disc } = await admin
      .from("disclosures")
      .insert({
        stock_id: stock.id,
        external_id: externalId,
        source_type: "tdnet",
        title: "配当予想の修正 e2e-fail",
        document_url: "https://example.com/404-e2e-test.pdf",
        published_at: new Date().toISOString(),
        parse_status: "pending"
      })
      .select("id")
      .single();
    expect(disc).not.toBeNull();
    const disclosureId = disc!.id;
    disclosureIds.push(disclosureId);

    // Seed a job at max-1 attempts so the next run is the final attempt
    // priority: 1 ensures this test job is processed first even if other jobs
    // are in the queue at the default priority (3).
    const { data: job } = await admin
      .from("jobs")
      .insert({
        type: "download_disclosure_pdf",
        status: "pending",
        payload: { disclosureId },
        attempts: 2,
        max_attempts: 3,
        priority: 1,
        run_after: new Date().toISOString()
      })
      .select("id")
      .single();
    expect(job).not.toBeNull();
    jobIds.push(job!.id);

    const response = await invokeProcessJobs(request, ["download_disclosure_pdf"], 1);
    expect(response.status()).toBe(200);

    // Poll briefly for final state (process-jobs may complete asynchronously)
    let attempts = 0;
    let jobRow;
    while (attempts < 10) {
      const { data } = await admin
        .from("jobs")
        .select("status, attempts, last_error")
        .eq("id", job!.id)
        .single();
      jobRow = data;
      if (jobRow?.status === "failed") break;
      await new Promise((r) => setTimeout(r, 500));
      attempts++;
    }

    expect(jobRow).toMatchObject({
      status: "failed",
      attempts: 3
    });
    expect(jobRow?.last_error).toContain("download_failed");

    const { data: disclosure } = await admin
      .from("disclosures")
      .select("parse_status, last_parse_error")
      .eq("id", disclosureId)
      .single();
    expect(disclosure).toMatchObject({
      parse_status: "failed"
    });
    expect(disclosure?.last_parse_error).toBeTruthy();
  });

  test("process-jobs completes a download job and enqueues a parse job", async ({
    request
  }) => {
    const admin = createAdminClient();
    const externalId = `e2e-download-${Date.now()}`;
    const documentUrl =
      "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf";

    const { data: disc } = await admin
      .from("disclosures")
      .insert({
        stock_id: stock.id,
        external_id: externalId,
        source_type: "tdnet",
        title: "E2E download test",
        document_url: documentUrl,
        published_at: new Date().toISOString(),
        parse_status: "pending"
      })
      .select("id")
      .single();
    expect(disc).not.toBeNull();
    const disclosureId = disc!.id;
    disclosureIds.push(disclosureId);

    // priority: 1 ensures this test job is processed first even if other jobs
    // are in the queue at the default priority (3).
    const { data: job } = await admin
      .from("jobs")
      .insert({
        type: "download_disclosure_pdf",
        status: "pending",
        payload: { disclosureId },
        attempts: 0,
        max_attempts: 3,
        priority: 1,
        run_after: new Date().toISOString()
      })
      .select("id")
      .single();
    expect(job).not.toBeNull();
    jobIds.push(job!.id);

    const response = await invokeProcessJobs(request, ["download_disclosure_pdf"], 1);
    expect(response.status()).toBe(200);

    let attempts = 0;
    let jobRow;
    while (attempts < 20) {
      const { data } = await admin
        .from("jobs")
        .select("status, attempts, last_error")
        .eq("id", job!.id)
        .single();
      jobRow = data;
      if (jobRow?.status === "completed") break;
      await new Promise((r) => setTimeout(r, 500));
      attempts++;
    }

    expect(jobRow).toMatchObject({
      status: "completed",
      attempts: 1
    });

    const { data: disclosure } = await admin
      .from("disclosures")
      .select("parse_status, storage_path")
      .eq("id", disclosureId)
      .single();
    expect(disclosure?.parse_status).toBe("downloaded");
    expect(disclosure?.storage_path).toBeTruthy();

    const { data: parseJobs } = await admin
      .from("jobs")
      .select("id, type, status")
      .eq("type", "parse_disclosure_pdf_ai")
      .contains("payload", { disclosureId });
    expect(parseJobs).toHaveLength(1);
    expect(parseJobs![0]).toMatchObject({
      type: "parse_disclosure_pdf_ai",
      status: "pending"
    });
    jobIds.push(parseJobs![0].id);
  });

  test("process-jobs retries transient failures with backoff", async ({
    request
  }) => {
    const admin = createAdminClient();
    const externalId = `e2e-retry-${Date.now()}`;
    const documentUrl = "https://httpbin.org/status/503";

    const { data: disc } = await admin
      .from("disclosures")
      .insert({
        stock_id: stock.id,
        external_id: externalId,
        source_type: "tdnet",
        title: "E2E retry test",
        document_url: documentUrl,
        published_at: new Date().toISOString(),
        parse_status: "pending"
      })
      .select("id")
      .single();
    expect(disc).not.toBeNull();
    const disclosureId = disc!.id;
    disclosureIds.push(disclosureId);

    // priority: 1 ensures this test job is processed first even if other jobs
    // are in the queue at the default priority (3).
    const { data: job } = await admin
      .from("jobs")
      .insert({
        type: "download_disclosure_pdf",
        status: "pending",
        payload: { disclosureId },
        attempts: 1,
        max_attempts: 3,
        priority: 1,
        run_after: new Date().toISOString()
      })
      .select("id")
      .single();
    expect(job).not.toBeNull();
    jobIds.push(job!.id);

    const response = await invokeProcessJobs(request, ["download_disclosure_pdf"], 1);
    expect(response.status()).toBe(200);

    let attempts = 0;
    let jobRow;
    while (attempts < 20) {
      const { data } = await admin
        .from("jobs")
        .select("status, attempts, last_error, run_after")
        .eq("id", job!.id)
        .single();
      jobRow = data;
      if (jobRow?.status === "pending" && jobRow?.attempts === 2) break;
      await new Promise((r) => setTimeout(r, 500));
      attempts++;
    }

    expect(jobRow).toMatchObject({
      status: "pending",
      attempts: 2
    });
    expect(new Date(jobRow!.run_after).getTime()).toBeGreaterThan(Date.now());

    const { data: disclosure } = await admin
      .from("disclosures")
      .select("parse_status")
      .eq("id", disclosureId)
      .single();
    expect(disclosure?.parse_status).toBe("pending");
  });
});
