import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { requireRemoteTests } from "../../helpers/env";
import { createAdminClient } from "../../helpers/supabase";
import {
  createTestUser,
  signInAs,
  type TestUser,
  uniqueEmail
} from "../../helpers/test-users";
import { cleanupUser } from "../../helpers/cleanup";
import { getTestStocks } from "../../fixtures/test-stock";
import type { StockDetail } from "@/features/dividends/types";

beforeAll(() => requireRemoteTests());

const PASSWORD = "Test1234!";
const YEAR = new Date().getFullYear();

describe("admin review and disclosure pipeline", () => {
  let adminUser: TestUser;
  let appUser: TestUser;
  let adminClient: Awaited<ReturnType<typeof signInAs>>;
  let userClient: Awaited<ReturnType<typeof signInAs>>;
  let stockId: string;
  const disclosureIds: string[] = [];
  const reviewIds: string[] = [];
  const dividendEventIds: string[] = [];
  const jobIds: string[] = [];

  beforeAll(async () => {
    const { supported } = await getTestStocks();
    stockId = supported.id;

    adminUser = await createTestUser(uniqueEmail("phase6-admin"), PASSWORD);
    appUser = await createTestUser(uniqueEmail("phase6-user"), PASSWORD);

    const admin = createAdminClient();
    await admin
      .from("profiles")
      .update({ role: "admin" })
      .eq("id", adminUser.id);
    await admin.from("holdings").insert({
      user_id: appUser.id,
      stock_id: stockId,
      quantity: 10,
      average_purchase_price: 1000,
      account_type: "tokutei"
    });

    adminClient = await signInAs(adminUser.email, PASSWORD);
    userClient = await signInAs(appUser.email, PASSWORD);
  });

  afterAll(async () => {
    const admin = createAdminClient();
    if (reviewIds.length > 0) {
      await admin.from("dividend_reviews").delete().in("id", reviewIds);
    }
    if (dividendEventIds.length > 0) {
      await admin.from("dividend_events").delete().in("id", dividendEventIds);
    }
    if (disclosureIds.length > 0) {
      await admin.from("jobs").delete().filter("payload->>disclosureId", "in", `(${disclosureIds.join(",")})`);
      await admin.from("disclosures").delete().in("id", disclosureIds);
    }
    if (jobIds.length > 0) {
      await admin.from("jobs").delete().in("id", jobIds);
    }
    await cleanupUser(appUser.id);
    await cleanupUser(adminUser.id);
  });

  async function createDisclosure(suffix: string) {
    const { data, error } = await createAdminClient()
      .from("disclosures")
      .insert({
        stock_id: stockId,
        external_id: `phase6-${suffix}-${Date.now()}`,
        source_type: "tdnet",
        title: `配当予想の修正 ${suffix}`,
        document_url: `https://example.com/phase6/${suffix}`,
        published_at: `${YEAR}-01-01T00:00:00Z`
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    disclosureIds.push(data!.id);
    return data!.id;
  }

  async function createReview(params: {
    suffix: string;
    amount: number | null;
    previous?: number | null;
    rawPayload?: Record<string, unknown>;
  }) {
    const disclosureId = await createDisclosure(params.suffix);
    const { data, error } = await createAdminClient()
      .from("dividend_reviews")
      .insert({
        stock_id: stockId,
        disclosure_id: disclosureId,
        extracted_dividend_per_share: params.amount,
        previous_dividend_per_share: params.previous ?? null,
        extracted_payment_month: 9,
        confidence_score: 0.75,
        raw_payload: {
          eventType: "year_end",
          fiscalYear: YEAR,
          eventStatus: params.amount == null ? "undecided" : "estimated",
          ...params.rawPayload
        }
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    reviewIds.push(data!.id);
    return data!.id;
  }

  async function createPriorEvent(amount: number) {
    const { data, error } = await createAdminClient()
      .from("dividend_events")
      .insert({
        stock_id: stockId,
        fiscal_year: YEAR - 1,
        event_type: "year_end",
        dividend_per_share: amount,
        expected_payment_month: 9,
        status: "confirmed",
        review_status: "approved"
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    dividendEventIds.push(data!.id);
    return data!.id;
  }

  it("non-admin cannot approve review", async () => {
    const reviewId = await createReview({ suffix: "non-admin", amount: 120 });
    const { error } = await userClient.rpc("approve_dividend_review", {
      p_review_id: reviewId
    });

    expect(error).not.toBeNull();
  });

  it("admin can approve pending review and create approved dividend event metadata", async () => {
    await createPriorEvent(100);
    const reviewId = await createReview({ suffix: "increase", amount: 120 });

    const { data, error } = await adminClient.rpc("approve_dividend_review", {
      p_review_id: reviewId,
      p_override: { expectedPaymentYear: YEAR }
    });

    expect(error).toBeNull();
    const result = data as { dividendEventId: string; changeType: string };
    expect(result.changeType).toBe("increase");
    dividendEventIds.push(result.dividendEventId);

    const { data: review } = await createAdminClient()
      .from("dividend_reviews")
      .select("status, reviewed_by, reviewed_at, created_dividend_event_id")
      .eq("id", reviewId)
      .single();
    expect(review).toMatchObject({
      status: "approved",
      reviewed_by: adminUser.id,
      created_dividend_event_id: result.dividendEventId
    });
    expect(review?.reviewed_at).not.toBeNull();

    const { data: event } = await createAdminClient()
      .from("dividend_events")
      .select("review_status, dividend_per_share, change_type")
      .eq("id", result.dividendEventId)
      .single();
    expect(event).toMatchObject({
      review_status: "approved",
      dividend_per_share: 120,
      change_type: "increase"
    });
  });

  it("approved increase and decrease create notifications for holders", async () => {
    const { data: increaseNotification } = await userClient
      .from("notifications")
      .select("type, payload")
      .eq("user_id", appUser.id)
      .eq("stock_id", stockId)
      .eq("type", "dividend_increase")
      .limit(1)
      .single();
    expect(increaseNotification?.type).toBe("dividend_increase");

    const reviewId = await createReview({ suffix: "decrease", amount: 80 });
    const { data, error } = await adminClient.rpc("approve_dividend_review", {
      p_review_id: reviewId,
      p_override: { expectedPaymentYear: YEAR }
    });
    expect(error).toBeNull();
    const result = data as { dividendEventId: string; changeType: string };
    expect(result.changeType).toBe("decrease");
    dividendEventIds.push(result.dividendEventId);

    const { data: decreaseNotification } = await userClient
      .from("notifications")
      .select("type")
      .eq("user_id", appUser.id)
      .eq("stock_id", stockId)
      .eq("type", "dividend_decrease")
      .limit(1)
      .single();
    expect(decreaseNotification?.type).toBe("dividend_decrease");
  });

  it("rejecting review does not create dividend event or user notification", async () => {
    const reviewId = await createReview({ suffix: "reject", amount: 90 });

    const { data, error } = await adminClient.rpc("reject_dividend_review", {
      p_review_id: reviewId,
      p_reason: "source mismatch"
    });

    expect(error).toBeNull();
    expect(data).toMatchObject({ status: "rejected" });

    const { data: review } = await createAdminClient()
      .from("dividend_reviews")
      .select("status, rejection_reason, created_dividend_event_id")
      .eq("id", reviewId)
      .single();
    expect(review).toMatchObject({
      status: "rejected",
      rejection_reason: "source mismatch",
      created_dividend_event_id: null
    });

    const { data: detail } = await userClient.rpc("get_stock_detail", {
      p_stock_id: stockId
    });
    const stockDetail = detail as unknown as StockDetail;
    expect(
      stockDetail.dividendSchedule.some(
        (event) => Number(event.dividendPerShare) === 90
      )
    ).toBe(false);
  });

  it("unknown dividend amount is rejected unless explicitly undecided", async () => {
    const reviewId = await createReview({
      suffix: "unknown-without-status",
      amount: null,
      rawPayload: { eventStatus: "" }
    });

    const { error } = await adminClient.rpc("approve_dividend_review", {
      p_review_id: reviewId
    });

    expect(error).not.toBeNull();
  });

  it("undecided review stores null dividend instead of zero", async () => {
    const reviewId = await createReview({
      suffix: "undecided",
      amount: null,
      rawPayload: { eventStatus: "undecided" }
    });

    const { data, error } = await adminClient.rpc("approve_dividend_review", {
      p_review_id: reviewId,
      p_override: { expectedPaymentYear: YEAR }
    });

    expect(error).toBeNull();
    const result = data as { dividendEventId: string };
    dividendEventIds.push(result.dividendEventId);

    const { data: event } = await createAdminClient()
      .from("dividend_events")
      .select("dividend_per_share, status")
      .eq("id", result.dividendEventId)
      .single();
    expect(event?.dividend_per_share).toBeNull();
    expect(event?.status).toBe("undecided");
  });

  it("service-role review helper approves with explicit admin reviewer", async () => {
    const reviewId = await createReview({ suffix: "service-helper", amount: 85 });

    const { data, error } = await createAdminClient().rpc(
      "approve_dividend_review_for_reviewer",
      {
        p_review_id: reviewId,
        p_reviewer_id: adminUser.id,
        p_override: { expectedPaymentYear: YEAR }
      }
    );

    expect(error).toBeNull();
    const result = data as { dividendEventId: string };
    dividendEventIds.push(result.dividendEventId);
  });

  it("collecting the same disclosure twice is idempotent and parser creates pending review", async () => {
    const externalId = `phase6-collect-${Date.now()}`;
    const candidate = {
      externalId,
      ticker: "9433",
      sourceType: "tdnet",
      title: "配当予想の修正 130円",
      documentUrl: "https://example.com/phase6/collect",
      publishedAt: `${YEAR}-02-01T00:00:00Z`
    };

    const first = await adminClient.rpc("collect_disclosure_candidate", {
      p_candidate: candidate
    });
    const second = await adminClient.rpc("collect_disclosure_candidate", {
      p_candidate: candidate
    });

    expect(first.error).toBeNull();
    expect(second.error).toBeNull();
    const firstResult = first.data as { disclosureId: string; inserted: boolean };
    const secondResult = second.data as { disclosureId: string; inserted: boolean };
    expect(firstResult.disclosureId).toBe(secondResult.disclosureId);
    expect(firstResult.inserted).toBe(true);
    expect(secondResult.inserted).toBe(false);
    disclosureIds.push(firstResult.disclosureId);

    const { data: disclosures } = await createAdminClient()
      .from("disclosures")
      .select("id")
      .eq("external_id", externalId);
    expect(disclosures).toHaveLength(1);

    const { data: jobs } = await createAdminClient()
      .from("jobs")
      .select("id")
      .filter("payload->>disclosureId", "eq", firstResult.disclosureId);
    jobIds.push(...(jobs ?? []).map((job) => job.id));
    expect(jobs).toHaveLength(1);

    const parsed = await adminClient.rpc("parse_disclosure", {
      p_disclosure_id: firstResult.disclosureId
    });
    expect(parsed.error).toBeNull();
    const parseResult = parsed.data as { reviewId: string; status: string };
    reviewIds.push(parseResult.reviewId);
    expect(parseResult.status).toBe("pending");
  });
});
