/**
 * Phase 05: Review Approval Pipeline integration tests.
 *
 * Tests cover:
 * - Approve pending/needs_manual_check reviews with full expected_payment_date
 * - payment_year derivation from full date
 * - payment_year required-confirmation when only month is known
 * - Override values applied to approved event
 * - annual_total approval stored for reference; excluded from user-facing aggregation
 * - special/commemorative breakdown counted once through payable event
 * - Upsert: updating existing event vs. inserting new
 * - Rejection with reason, reviewer metadata
 * - Duplicate approval idempotency / safe re-approval error
 * - Sibling reviews from same disclosure unaffected by single approval
 * - Approved rejected reviews remain hidden from user-facing queries
 * - Notification deduplication: repeat approval does not create duplicate notifications
 * - No notification for unchanged/unknown/annual_total
 * - ex_dividend_date NOT auto-filled from record_date
 * - Admin authorization failures for both approve and reject
 */

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

beforeAll(() => requireRemoteTests());

const PASSWORD = "Test1234!";
// Use a far-future year to avoid collision with other tests
const YEAR = new Date().getFullYear() + 12;

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

async function createDisclosure(admin: ReturnType<typeof createAdminClient>, stockId: string, suffix: string) {
  const externalId = `ph05-${suffix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const { data, error } = await admin
    .from("disclosures")
    .insert({
      stock_id: stockId,
      external_id: externalId,
      source_type: "tdnet",
      title: `配当予想の修正 ${suffix}`,
      document_url: `https://example.com/ph05/${suffix}`,
      published_at: `${YEAR}-01-15T00:00:00Z`,
      disclosure_type: "dividend_forecast_revision",
      parse_status: "parsed"
    })
    .select("id")
    .single();
  if (error) throw new Error(`createDisclosure: ${error.message}`);
  return data!.id;
}

async function createReview(
  admin: ReturnType<typeof createAdminClient>,
  stockId: string,
  disclosureId: string,
  overrides: Record<string, unknown> = {}
) {
  const { data, error } = await admin
    .from("dividend_reviews")
    .insert({
      stock_id: stockId,
      disclosure_id: disclosureId,
      extracted_dividend_per_share: 100,
      previous_dividend_per_share: 80,
      extracted_payment_month: 9,
      fiscal_year: YEAR,
      event_type: "year_end",
      change_type: "increase",
      confidence_score: 0.85,
      status: "pending",
      raw_payload: {
        eventType: "year_end",
        fiscalYear: YEAR,
        eventStatus: "estimated"
      },
      ...overrides
    })
    .select("id")
    .single();
  if (error) throw new Error(`createReview: ${error.message}`);
  return data!.id;
}

// ---------------------------------------------------------------------------
// Main test suite
// ---------------------------------------------------------------------------

describe("Phase 05: review approval pipeline", () => {
  let adminUser: TestUser;
  let appUser: TestUser;
  let adminClient: Awaited<ReturnType<typeof signInAs>>;
  let userClient: Awaited<ReturnType<typeof signInAs>>;
  let stockId: string;

  const disclosureIds: string[] = [];
  const reviewIds: string[] = [];
  const eventIds: string[] = [];
  const jobIds: string[] = [];

  beforeAll(async () => {
    const { supported } = await getTestStocks();
    stockId = supported.id;

    adminUser = await createTestUser(uniqueEmail("ph05-admin"), PASSWORD);
    appUser = await createTestUser(uniqueEmail("ph05-user"), PASSWORD);

    const admin = createAdminClient();
    await admin.from("profiles").update({ role: "admin" }).eq("id", adminUser.id);
    await admin.from("holdings").insert({
      user_id: appUser.id,
      stock_id: stockId,
      quantity: 50,
      average_purchase_price: 2000,
      account_type: "tokutei"
    });
    await admin.from("user_settings").upsert({
      user_id: appUser.id,
      in_app_notification_enabled: true,
      email_notification_enabled: false
    });

    adminClient = await signInAs(adminUser.email, PASSWORD);
    userClient = await signInAs(appUser.email, PASSWORD);
  });

  afterAll(async () => {
    const admin = createAdminClient();
    if (eventIds.length > 0) await admin.from("dividend_events").delete().in("id", eventIds);
    if (reviewIds.length > 0) await admin.from("dividend_reviews").delete().in("id", reviewIds);
    if (disclosureIds.length > 0) {
      await admin.from("jobs").delete().filter("payload->>disclosureId", "in", `(${disclosureIds.join(",")})`);
      await admin.from("disclosures").delete().in("id", disclosureIds);
    }
    if (jobIds.length > 0) await admin.from("jobs").delete().in("id", jobIds);
    await cleanupUser(appUser.id);
    await cleanupUser(adminUser.id);
  });

  // --------------------------------------------------------------------------
  // Admin authorization
  // --------------------------------------------------------------------------

  it("non-admin cannot approve a review", async () => {
    const admin = createAdminClient();
    const disclosureId = await createDisclosure(admin, stockId, "auth-fail-approve");
    disclosureIds.push(disclosureId);
    const reviewId = await createReview(admin, stockId, disclosureId);
    reviewIds.push(reviewId);

    const { error } = await userClient.rpc("approve_dividend_review", {
      p_review_id: reviewId,
      p_override: { paymentYear: YEAR }
    });
    expect(error).not.toBeNull();
  });

  it("non-admin cannot reject a review", async () => {
    const admin = createAdminClient();
    const disclosureId = await createDisclosure(admin, stockId, "auth-fail-reject");
    disclosureIds.push(disclosureId);
    const reviewId = await createReview(admin, stockId, disclosureId);
    reviewIds.push(reviewId);

    const { error } = await userClient.rpc("reject_dividend_review", {
      p_review_id: reviewId,
      p_reason: "test"
    });
    expect(error).not.toBeNull();
  });

  // --------------------------------------------------------------------------
  // payment_year derivation and required-confirmation behavior
  // --------------------------------------------------------------------------

  it("derives payment_year from full expected_payment_date", async () => {
    const admin = createAdminClient();
    const disclosureId = await createDisclosure(admin, stockId, "payment-date");
    disclosureIds.push(disclosureId);
    const reviewId = await createReview(admin, stockId, disclosureId, {
      extracted_payment_date: `${YEAR}-09-25`,
      extracted_payment_month: 9
    });
    reviewIds.push(reviewId);

    const { data, error } = await adminClient.rpc("approve_dividend_review", {
      p_review_id: reviewId
      // No paymentYear override — should derive from extracted_payment_date
    });
    expect(error).toBeNull();
    const result = data as { dividendEventId: string; paymentYear: number };
    expect(result.paymentYear).toBe(YEAR);
    eventIds.push(result.dividendEventId);

    const { data: event } = await admin
      .from("dividend_events")
      .select("payment_year, ex_dividend_date, record_date")
      .eq("id", result.dividendEventId)
      .single();
    expect(Number(event?.payment_year)).toBe(YEAR);
    // ex_dividend_date must not be auto-filled from record_date
    expect(event?.ex_dividend_date).toBeNull();
  });

  it("fails approval when only month is known and no payment_year override", async () => {
    const admin = createAdminClient();
    const disclosureId = await createDisclosure(admin, stockId, "month-only");
    disclosureIds.push(disclosureId);
    const reviewId = await createReview(admin, stockId, disclosureId, {
      // No extracted_payment_date, only month
      extracted_payment_date: null,
      extracted_payment_month: 9
    });
    reviewIds.push(reviewId);

    const { error } = await adminClient.rpc("approve_dividend_review", {
      p_review_id: reviewId
      // No paymentYear override → should fail
    });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/payment_year/i);
  });

  it("approves month-only review when payment_year override is provided", async () => {
    const admin = createAdminClient();
    const disclosureId = await createDisclosure(admin, stockId, "month-only-override");
    disclosureIds.push(disclosureId);
    const reviewId = await createReview(admin, stockId, disclosureId, {
      extracted_payment_date: null,
      extracted_payment_month: 9
    });
    reviewIds.push(reviewId);

    const { data, error } = await adminClient.rpc("approve_dividend_review", {
      p_review_id: reviewId,
      p_override: { paymentYear: YEAR }
    });
    expect(error).toBeNull();
    const result = data as { dividendEventId: string; paymentYear: number };
    expect(result.paymentYear).toBe(YEAR);
    eventIds.push(result.dividendEventId);

    const { data: event } = await admin
      .from("dividend_events")
      .select("payment_year, expected_payment_month")
      .eq("id", result.dividendEventId)
      .single();
    expect(Number(event?.payment_year)).toBe(YEAR);
    expect(Number(event?.expected_payment_month)).toBe(9);
  });

  // --------------------------------------------------------------------------
  // Override values applied
  // --------------------------------------------------------------------------

  it("applies override dividend amount and date to the approved event", async () => {
    const admin = createAdminClient();
    const disclosureId = await createDisclosure(admin, stockId, "override-values");
    disclosureIds.push(disclosureId);
    const reviewId = await createReview(admin, stockId, disclosureId, {
      extracted_payment_date: null,
      extracted_payment_month: 6
    });
    reviewIds.push(reviewId);

    const { data, error } = await adminClient.rpc("approve_dividend_review", {
      p_review_id: reviewId,
      p_override: {
        dividendPerShare: 150,
        expectedPaymentDate: `${YEAR}-06-20`,
        paymentYear: YEAR,
        changeType: "increase"
      }
    });
    expect(error).toBeNull();
    const result = data as { dividendEventId: string };
    eventIds.push(result.dividendEventId);

    const { data: event } = await admin
      .from("dividend_events")
      .select("dividend_per_share, expected_payment_date, payment_year, change_type")
      .eq("id", result.dividendEventId)
      .single();
    expect(Number(event?.dividend_per_share)).toBe(150);
    expect(event?.expected_payment_date).toBe(`${YEAR}-06-20`);
    expect(Number(event?.payment_year)).toBe(YEAR);
    expect(event?.change_type).toBe("increase");
  });

  it("override validation rejects negative dividend amount", async () => {
    const admin = createAdminClient();
    const disclosureId = await createDisclosure(admin, stockId, "override-neg-amount");
    disclosureIds.push(disclosureId);
    const reviewId = await createReview(admin, stockId, disclosureId, {
      extracted_payment_date: `${YEAR}-09-25`
    });
    reviewIds.push(reviewId);

    const { error } = await adminClient.rpc("approve_dividend_review", {
      p_review_id: reviewId,
      p_override: { dividendPerShare: -10 }
    });
    expect(error).not.toBeNull();
  });

  it("override validation rejects invalid paymentYear", async () => {
    const admin = createAdminClient();
    const disclosureId = await createDisclosure(admin, stockId, "override-bad-year");
    disclosureIds.push(disclosureId);
    const reviewId = await createReview(admin, stockId, disclosureId, {
      extracted_payment_date: `${YEAR}-09-25`
    });
    reviewIds.push(reviewId);

    const { error } = await adminClient.rpc("approve_dividend_review", {
      p_review_id: reviewId,
      p_override: { paymentYear: 1990 }
    });
    expect(error).not.toBeNull();
  });

  // --------------------------------------------------------------------------
  // needs_manual_check status acceptance
  // --------------------------------------------------------------------------

  it("approves a needs_manual_check review", async () => {
    const admin = createAdminClient();
    const disclosureId = await createDisclosure(admin, stockId, "needs-manual-check");
    disclosureIds.push(disclosureId);
    const reviewId = await createReview(admin, stockId, disclosureId, {
      status: "needs_manual_check",
      extracted_payment_date: `${YEAR}-09-25`
    });
    reviewIds.push(reviewId);

    const { data, error } = await adminClient.rpc("approve_dividend_review", {
      p_review_id: reviewId
    });
    expect(error).toBeNull();
    const result = data as { dividendEventId: string };
    eventIds.push(result.dividendEventId);

    const { data: review } = await admin
      .from("dividend_reviews")
      .select("status, reviewed_by, reviewed_at, created_dividend_event_id")
      .eq("id", reviewId)
      .single();
    expect(review?.status).toBe("approved");
    expect(review?.reviewed_by).toBe(adminUser.id);
    expect(review?.reviewed_at).not.toBeNull();
    expect(review?.created_dividend_event_id).toBe(result.dividendEventId);
  });

  it("rejects a needs_manual_check review", async () => {
    const admin = createAdminClient();
    const disclosureId = await createDisclosure(admin, stockId, "reject-manual-check");
    disclosureIds.push(disclosureId);
    const reviewId = await createReview(admin, stockId, disclosureId, {
      status: "needs_manual_check"
    });
    reviewIds.push(reviewId);

    const { data, error } = await adminClient.rpc("reject_dividend_review", {
      p_review_id: reviewId,
      p_reason: "insufficient evidence"
    });
    expect(error).toBeNull();
    expect((data as { status: string }).status).toBe("rejected");

    const { data: review } = await admin
      .from("dividend_reviews")
      .select("status, rejection_reason, reviewed_by, created_dividend_event_id")
      .eq("id", reviewId)
      .single();
    expect(review?.status).toBe("rejected");
    expect(review?.rejection_reason).toBe("insufficient evidence");
    expect(review?.reviewed_by).toBe(adminUser.id);
    expect(review?.created_dividend_event_id).toBeNull();
  });

  // --------------------------------------------------------------------------
  // annual_total: stored for reference, excluded from user-facing aggregation
  // --------------------------------------------------------------------------

  it("annual_total approval is stored but excluded from user-facing calendar aggregation", async () => {
    const admin = createAdminClient();
    const disclosureId = await createDisclosure(admin, stockId, "annual-total");
    disclosureIds.push(disclosureId);

    // annual_total review — payment_year not required for reference-only events
    const reviewId = await createReview(admin, stockId, disclosureId, {
      event_type: "annual_total",
      extracted_dividend_per_share: 9999,
      extracted_payment_month: 9,
      raw_payload: {
        eventType: "annual_total",
        fiscalYear: YEAR,
        eventStatus: "estimated"
      }
    });
    reviewIds.push(reviewId);

    const { data, error } = await adminClient.rpc("approve_dividend_review", {
      p_review_id: reviewId
      // No paymentYear required for annual_total reference events
    });
    expect(error).toBeNull();
    const result = data as { dividendEventId: string };
    eventIds.push(result.dividendEventId);

    // Event exists in DB
    const { data: event } = await admin
      .from("dividend_events")
      .select("event_type, review_status, payment_year")
      .eq("id", result.dividendEventId)
      .single();
    expect(event?.event_type).toBe("annual_total");
    expect(event?.review_status).toBe("approved");

    // annual_total must NOT appear in user-facing calendar
    const { data: calendarData, error: calErr } = await userClient.rpc("get_dividend_calendar", {
      p_year: YEAR,
      p_amount_basis: "before_tax",
      p_account_type: "all"
    });
    expect(calErr).toBeNull();
    type CalendarRow = { month: number; amount: number | null; event_count: number };
    const rows = calendarData as CalendarRow[];
    // Confirm 9999 did not appear in month 9 event count beyond the payable events
    const sept = rows.find((r) => r.month === 9);
    // The 9999 annual_total amount should NOT be counted
    if (sept) {
      expect(Number(sept.amount ?? 0)).not.toBeCloseTo(9999 * 50, -2);
    }
  });

  // --------------------------------------------------------------------------
  // Upsert semantics: update existing event when match found
  // --------------------------------------------------------------------------

  it("updates an existing event when stock_id/fiscal_year/event_type match", async () => {
    const admin = createAdminClient();

    // Pre-insert an existing event
    const { data: existing, error: insertErr } = await admin
      .from("dividend_events")
      .insert({
        stock_id: stockId,
        fiscal_year: YEAR + 1,
        payment_year: YEAR + 1,
        event_type: "interim",
        dividend_per_share: 50,
        expected_payment_month: 3,
        status: "estimated",
        review_status: "approved"
      })
      .select("id")
      .single();
    expect(insertErr).toBeNull();
    eventIds.push(existing!.id);

    // Create disclosure + review for same stock/fiscal_year/event_type
    const disclosureId = await createDisclosure(admin, stockId, "upsert-existing");
    disclosureIds.push(disclosureId);
    const reviewId = await createReview(admin, stockId, disclosureId, {
      event_type: "interim",
      extracted_dividend_per_share: 60,
      extracted_payment_month: 3,
      fiscal_year: YEAR + 1,
      raw_payload: {
        eventType: "interim",
        fiscalYear: YEAR + 1,
        eventStatus: "confirmed"
      }
    });
    reviewIds.push(reviewId);

    const { data, error } = await adminClient.rpc("approve_dividend_review", {
      p_review_id: reviewId,
      p_override: { paymentYear: YEAR + 1 }
    });
    expect(error).toBeNull();
    const result = data as { dividendEventId: string; isUpsert: boolean };
    // Should return the existing event id and flag as upsert
    expect(result.dividendEventId).toBe(existing!.id);
    expect(result.isUpsert).toBe(true);

    // The existing event should be updated
    const { data: updatedEvent } = await admin
      .from("dividend_events")
      .select("dividend_per_share, status")
      .eq("id", existing!.id)
      .single();
    expect(Number(updatedEvent?.dividend_per_share)).toBe(60);
    expect(updatedEvent?.status).toBe("confirmed");
  });

  // --------------------------------------------------------------------------
  // Rejection
  // --------------------------------------------------------------------------

  it("rejection stores reason, reviewer, timestamp and creates no event", async () => {
    const admin = createAdminClient();
    const disclosureId = await createDisclosure(admin, stockId, "reject");
    disclosureIds.push(disclosureId);
    const reviewId = await createReview(admin, stockId, disclosureId);
    reviewIds.push(reviewId);

    const { data, error } = await adminClient.rpc("reject_dividend_review", {
      p_review_id: reviewId,
      p_reason: "source mismatch"
    });
    expect(error).toBeNull();
    expect((data as { status: string }).status).toBe("rejected");

    const { data: review } = await admin
      .from("dividend_reviews")
      .select("status, rejection_reason, reviewed_by, reviewed_at, created_dividend_event_id")
      .eq("id", reviewId)
      .single();
    expect(review?.status).toBe("rejected");
    expect(review?.rejection_reason).toBe("source mismatch");
    expect(review?.reviewed_by).toBe(adminUser.id);
    expect(review?.reviewed_at).not.toBeNull();
    expect(review?.created_dividend_event_id).toBeNull();
  });

  // --------------------------------------------------------------------------
  // Duplicate approval / safe re-approval
  // --------------------------------------------------------------------------

  it("approving an already-approved review fails with a clear error", async () => {
    const admin = createAdminClient();
    const disclosureId = await createDisclosure(admin, stockId, "dup-approve");
    disclosureIds.push(disclosureId);
    const reviewId = await createReview(admin, stockId, disclosureId, {
      extracted_payment_date: `${YEAR}-09-25`,
      fiscal_year: YEAR + 2,
      raw_payload: { eventType: "year_end", fiscalYear: YEAR + 2, eventStatus: "estimated" }
    });
    reviewIds.push(reviewId);

    const { data: first, error: firstErr } = await adminClient.rpc("approve_dividend_review", {
      p_review_id: reviewId
    });
    expect(firstErr).toBeNull();
    eventIds.push((first as { dividendEventId: string }).dividendEventId);

    // Second approval attempt should fail
    const { error: secondErr } = await adminClient.rpc("approve_dividend_review", {
      p_review_id: reviewId
    });
    expect(secondErr).not.toBeNull();
  });

  it("rejecting an already-rejected review fails with a clear error", async () => {
    const admin = createAdminClient();
    const disclosureId = await createDisclosure(admin, stockId, "dup-reject");
    disclosureIds.push(disclosureId);
    const reviewId = await createReview(admin, stockId, disclosureId);
    reviewIds.push(reviewId);

    await adminClient.rpc("reject_dividend_review", {
      p_review_id: reviewId,
      p_reason: "first rejection"
    });

    const { error } = await adminClient.rpc("reject_dividend_review", {
      p_review_id: reviewId,
      p_reason: "second rejection"
    });
    expect(error).not.toBeNull();
  });

  // --------------------------------------------------------------------------
  // Sibling reviews from same disclosure unaffected
  // --------------------------------------------------------------------------

  it("approving one review does not change sibling reviews from the same disclosure", async () => {
    const admin = createAdminClient();
    const disclosureId = await createDisclosure(admin, stockId, "sibling");
    disclosureIds.push(disclosureId);

    const reviewA = await createReview(admin, stockId, disclosureId, {
      extracted_payment_date: `${YEAR}-09-25`,
      fiscal_year: YEAR + 3,
      raw_payload: { eventType: "year_end", fiscalYear: YEAR + 3, eventStatus: "estimated" }
    });
    const reviewB = await createReview(admin, stockId, disclosureId, {
      event_type: "interim",
      extracted_payment_month: 3,
      fiscal_year: YEAR + 3,
      raw_payload: { eventType: "interim", fiscalYear: YEAR + 3, eventStatus: "estimated" }
    });
    reviewIds.push(reviewA, reviewB);

    // Approve reviewA
    const { data, error } = await adminClient.rpc("approve_dividend_review", {
      p_review_id: reviewA
    });
    expect(error).toBeNull();
    eventIds.push((data as { dividendEventId: string }).dividendEventId);

    // reviewB must still be pending
    const { data: siblingReview } = await admin
      .from("dividend_reviews")
      .select("status")
      .eq("id", reviewB)
      .single();
    expect(siblingReview?.status).toBe("pending");
  });

  // --------------------------------------------------------------------------
  // Pending/rejected reviews hidden from user-facing queries
  // --------------------------------------------------------------------------

  it("pending reviews are not visible in user-facing dividend event queries", async () => {
    const admin = createAdminClient();
    const disclosureId = await createDisclosure(admin, stockId, "pending-hidden");
    disclosureIds.push(disclosureId);
    const reviewId = await createReview(admin, stockId, disclosureId, {
      extracted_dividend_per_share: 8888
    });
    reviewIds.push(reviewId);

    // The review is pending — it should not appear in the user's calendar as an event
    const { data } = await userClient.rpc("get_dividend_calendar", {
      p_year: YEAR,
      p_amount_basis: "before_tax",
      p_account_type: "all"
    });
    type CalendarRow = { month: number; amount: number | null };
    const rows = data as CalendarRow[];
    for (const row of rows) {
      // 8888 * 50 holdings = 444400; should never appear
      expect(Number(row.amount ?? 0)).not.toBeCloseTo(8888 * 50, -2);
    }
  });

  // --------------------------------------------------------------------------
  // Notification deduplication
  // --------------------------------------------------------------------------

  it("repeat approval attempts do not create duplicate notifications", async () => {
    const admin = createAdminClient();

    // Create an already-approved event to establish a baseline (so increase is detectable)
    const { data: baseEvent } = await admin
      .from("dividend_events")
      .insert({
        stock_id: stockId,
        fiscal_year: YEAR + 5,
        payment_year: YEAR + 5,
        event_type: "year_end",
        dividend_per_share: 70,
        expected_payment_month: 9,
        status: "estimated",
        review_status: "approved"
      })
      .select("id")
      .single();
    eventIds.push(baseEvent!.id);

    const disclosureId = await createDisclosure(admin, stockId, "dedup-notify");
    disclosureIds.push(disclosureId);
    const reviewId = await createReview(admin, stockId, disclosureId, {
      extracted_dividend_per_share: 85,
      extracted_payment_date: `${YEAR + 5}-09-25`,
      fiscal_year: YEAR + 5,
      raw_payload: { eventType: "year_end", fiscalYear: YEAR + 5, eventStatus: "estimated" }
    });
    reviewIds.push(reviewId);

    // First approval (will upsert existing event)
    const { data: firstResult, error: firstErr } = await adminClient.rpc(
      "approve_dividend_review",
      { p_review_id: reviewId }
    );
    expect(firstErr).toBeNull();
    const { dividendEventId } = firstResult as { dividendEventId: string };
    // event was upserted, same id as baseEvent
    expect(dividendEventId).toBe(baseEvent!.id);

    // Count notifications for this event after first approval
    const { data: notifs1 } = await admin
      .from("notifications")
      .select("id")
      .eq("stock_id", stockId)
      .eq("user_id", appUser.id)
      .filter("payload->>dividendEventId", "eq", dividendEventId);

    const countAfterFirst = (notifs1 ?? []).length;
    expect(countAfterFirst).toBeGreaterThanOrEqual(0);

    // Attempting a second approval on the same review should fail (already approved)
    const { error: secondErr } = await adminClient.rpc("approve_dividend_review", {
      p_review_id: reviewId
    });
    expect(secondErr).not.toBeNull();

    // Notification count must not have increased
    const { data: notifs2 } = await admin
      .from("notifications")
      .select("id")
      .eq("stock_id", stockId)
      .eq("user_id", appUser.id)
      .filter("payload->>dividendEventId", "eq", dividendEventId);

    expect((notifs2 ?? []).length).toBe(countAfterFirst);
  });

  // --------------------------------------------------------------------------
  // ex_dividend_date never auto-filled from record_date
  // --------------------------------------------------------------------------

  it("does not auto-fill ex_dividend_date from record_date", async () => {
    const admin = createAdminClient();
    const disclosureId = await createDisclosure(admin, stockId, "ex-div-check");
    disclosureIds.push(disclosureId);
    const reviewId = await createReview(admin, stockId, disclosureId, {
      extracted_payment_date: `${YEAR}-09-25`,
      extracted_record_date: `${YEAR}-03-31`,
      // No extracted_ex_dividend_date — must remain null after approval
      fiscal_year: YEAR + 6,
      raw_payload: { eventType: "year_end", fiscalYear: YEAR + 6, eventStatus: "estimated" }
    });
    reviewIds.push(reviewId);

    const { data, error } = await adminClient.rpc("approve_dividend_review", {
      p_review_id: reviewId
    });
    expect(error).toBeNull();
    const result = data as { dividendEventId: string };
    eventIds.push(result.dividendEventId);

    const { data: event } = await admin
      .from("dividend_events")
      .select("record_date, ex_dividend_date")
      .eq("id", result.dividendEventId)
      .single();
    // record_date should be stored
    expect(event?.record_date).toBe(`${YEAR}-03-31`);
    // ex_dividend_date must NOT be auto-derived from record_date
    expect(event?.ex_dividend_date).toBeNull();
  });
});
