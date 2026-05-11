import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { requireEnv, requireRemoteTests } from "../../helpers/env";
import { createAdminClient } from "../../helpers/supabase";
import {
  createTestUser,
  signInAs,
  type TestUser,
  uniqueEmail
} from "../../helpers/test-users";
import { cleanupUser } from "../../helpers/cleanup";
import { getTestStocks } from "../../fixtures/test-stock";

beforeAll(() => requireRemoteTests());

const PASSWORD = "Test1234!";
const YEAR = new Date().getFullYear() + 13;

function functionUrl(functionName: string): string {
  return `${requireEnv("NEXT_PUBLIC_SUPABASE_URL")}/functions/v1/${functionName}`;
}

async function accessToken(client: SupabaseClient<Database>): Promise<string> {
  const { data, error } = await client.auth.getSession();
  if (error || !data.session) {
    throw new Error(`Missing test session: ${error?.message ?? "no session"}`);
  }
  return data.session.access_token;
}

async function invokeReviewFunction(
  functionName: "approve-dividend-review" | "reject-dividend-review",
  client: SupabaseClient<Database>,
  body: Record<string, unknown>
): Promise<Response> {
  const token = await accessToken(client);
  const anonKey = requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  return fetch(functionUrl(functionName), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: anonKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
}

async function createDisclosure(
  admin: ReturnType<typeof createAdminClient>,
  stockId: string,
  suffix: string
): Promise<string> {
  const externalId = `edge-review-${suffix}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`;
  const { data, error } = await admin
    .from("disclosures")
    .insert({
      stock_id: stockId,
      external_id: externalId,
      source_type: "tdnet",
      title: `Edge Function integration ${suffix}`,
      document_url: `https://example.com/edge-review/${suffix}.pdf`,
      published_at: `${YEAR}-01-15T00:00:00Z`,
      disclosure_type: "dividend_forecast_revision",
      parse_status: "parsed"
    })
    .select("id")
    .single();

  if (error || !data) throw new Error(`createDisclosure: ${error?.message}`);
  return data.id;
}

async function createReview(
  admin: ReturnType<typeof createAdminClient>,
  stockId: string,
  disclosureId: string,
  suffix: string
): Promise<string> {
  const { data, error } = await admin
    .from("dividend_reviews")
    .insert({
      stock_id: stockId,
      disclosure_id: disclosureId,
      extracted_dividend_per_share: 123,
      previous_dividend_per_share: 100,
      extracted_payment_month: 9,
      fiscal_year: YEAR,
      event_type: "year_end",
      change_type: "increase",
      confidence_score: 0.9,
      status: "pending",
      raw_payload: {
        test: "review-edge-functions",
        suffix,
        eventType: "year_end",
        fiscalYear: YEAR,
        eventStatus: "estimated"
      }
    })
    .select("id")
    .single();

  if (error || !data) throw new Error(`createReview: ${error?.message}`);
  return data.id;
}

describe("review Edge Functions", () => {
  let adminUser: TestUser;
  let appUser: TestUser;
  let adminClient: SupabaseClient<Database>;
  let userClient: SupabaseClient<Database>;
  let stockId: string;

  const disclosureIds: string[] = [];
  const reviewIds: string[] = [];
  const eventIds: string[] = [];

  beforeAll(async () => {
    const { supported } = await getTestStocks();
    stockId = supported.id;

    adminUser = await createTestUser(uniqueEmail("edge-fn-admin"), PASSWORD);
    appUser = await createTestUser(uniqueEmail("edge-fn-user"), PASSWORD);

    const admin = createAdminClient();
    const { error } = await admin
      .from("profiles")
      .update({ role: "admin" })
      .eq("id", adminUser.id);
    if (error) throw new Error(`make admin: ${error.message}`);

    adminClient = await signInAs(adminUser.email, PASSWORD);
    userClient = await signInAs(appUser.email, PASSWORD);
  });

  afterAll(async () => {
    const admin = createAdminClient();
    if (reviewIds.length > 0) {
      await admin.from("dividend_reviews").delete().in("id", reviewIds);
    }
    if (eventIds.length > 0) {
      await admin.from("dividend_events").delete().in("id", eventIds);
    }
    if (disclosureIds.length > 0) {
      await admin.from("jobs").delete().filter("payload->>disclosureId", "in", `(${disclosureIds.join(",")})`);
      await admin.from("disclosures").delete().in("id", disclosureIds);
    }
    if (appUser) await cleanupUser(appUser.id);
    if (adminUser) await cleanupUser(adminUser.id);
  });

  it("approves a review through the deployed approve-dividend-review Edge Function", async () => {
    const admin = createAdminClient();
    const disclosureId = await createDisclosure(admin, stockId, "approve");
    disclosureIds.push(disclosureId);
    const reviewId = await createReview(admin, stockId, disclosureId, "approve");
    reviewIds.push(reviewId);

    const response = await invokeReviewFunction("approve-dividend-review", adminClient, {
      reviewId,
      override: { paymentYear: YEAR }
    });
    const body = await response.json();

    expect(response.status, JSON.stringify(body)).toBe(200);
    expect(body).toMatchObject({
      dividendEventId: expect.any(String),
      paymentYear: YEAR
    });
    eventIds.push(body.dividendEventId);

    const { data: review } = await admin
      .from("dividend_reviews")
      .select("status, reviewed_by, reviewed_at, created_dividend_event_id")
      .eq("id", reviewId)
      .single();
    expect(review).toMatchObject({
      status: "approved",
      reviewed_by: adminUser.id,
      created_dividend_event_id: body.dividendEventId
    });
    expect(review?.reviewed_at).not.toBeNull();

    const { data: event } = await admin
      .from("dividend_events")
      .select("review_status, payment_year, dividend_per_share")
      .eq("id", body.dividendEventId)
      .single();
    expect(event).toMatchObject({
      review_status: "approved",
      payment_year: YEAR,
      dividend_per_share: 123
    });
  });

  it("rejects a review through the deployed reject-dividend-review Edge Function", async () => {
    const admin = createAdminClient();
    const disclosureId = await createDisclosure(admin, stockId, "reject");
    disclosureIds.push(disclosureId);
    const reviewId = await createReview(admin, stockId, disclosureId, "reject");
    reviewIds.push(reviewId);

    const response = await invokeReviewFunction("reject-dividend-review", adminClient, {
      reviewId,
      reason: "edge function integration rejection"
    });
    const body = await response.json();

    expect(response.status, JSON.stringify(body)).toBe(200);
    expect(body).toMatchObject({ status: "rejected" });

    const { data: review } = await admin
      .from("dividend_reviews")
      .select("status, rejection_reason, reviewed_by, reviewed_at, created_dividend_event_id")
      .eq("id", reviewId)
      .single();
    expect(review).toMatchObject({
      status: "rejected",
      rejection_reason: "edge function integration rejection",
      reviewed_by: adminUser.id,
      created_dividend_event_id: null
    });
    expect(review?.reviewed_at).not.toBeNull();
  });

  it("returns 403 when a non-admin calls approve-dividend-review", async () => {
    const admin = createAdminClient();
    const disclosureId = await createDisclosure(admin, stockId, "forbidden");
    disclosureIds.push(disclosureId);
    const reviewId = await createReview(admin, stockId, disclosureId, "forbidden");
    reviewIds.push(reviewId);

    const response = await invokeReviewFunction("approve-dividend-review", userClient, {
      reviewId,
      override: { paymentYear: YEAR }
    });
    const body = await response.json();

    expect(response.status, JSON.stringify(body)).toBe(403);
    expect(body).toMatchObject({ error: "Forbidden" });

    const { data: review } = await admin
      .from("dividend_reviews")
      .select("status, created_dividend_event_id")
      .eq("id", reviewId)
      .single();
    expect(review).toMatchObject({
      status: "pending",
      created_dividend_event_id: null
    });
  });
});
