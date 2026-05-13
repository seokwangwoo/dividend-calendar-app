import { describe, it, beforeAll, afterAll, expect } from "vitest";
import { requireRemoteTests } from "../../helpers/env";
import { createAdminClient } from "../../helpers/supabase";
import {
  createTestUser,
  signInAs,
  uniqueEmail,
  type TestUser
} from "../../helpers/test-users";
import { cleanupUser } from "../../helpers/cleanup";
import { getTestStocks } from "../../fixtures/test-stock";
import {
  createTestDividendEvent,
  deleteTestDividendEvents
} from "../../fixtures/test-dividend-events";

beforeAll(() => requireRemoteTests());

const PASSWORD = "Test1234!";
const YEAR = new Date().getFullYear() + 11;

describe("PDF AI data contracts", () => {
  let user: TestUser;
  let client: Awaited<ReturnType<typeof signInAs>>;
  let stockId: string;
  const disclosureIds: string[] = [];
  const reviewIds: string[] = [];
  const jobIds: string[] = [];
  const eventIds: string[] = [];

  beforeAll(async () => {
    const { supported } = await getTestStocks();
    stockId = supported.id;
    user = await createTestUser(uniqueEmail("pdf-ai-contract"), PASSWORD);
    client = await signInAs(user.email, PASSWORD);

    await createAdminClient().from("holdings").insert({
      user_id: user.id,
      stock_id: stockId,
      quantity: 100,
      average_purchase_price: 4000,
      account_type: "nisa"
    });
  });

  afterAll(async () => {
    const admin = createAdminClient();
    await deleteTestDividendEvents(eventIds);
    if (reviewIds.length) await admin.from("dividend_reviews").delete().in("id", reviewIds);
    if (jobIds.length) await admin.from("jobs").delete().in("id", jobIds);
    if (disclosureIds.length) await admin.from("disclosures").delete().in("id", disclosureIds);
    await cleanupUser(user.id);
  });

  it("stores disclosure, review, job, and event phase-01 fields", async () => {
    const admin = createAdminClient();
    const externalId = `pdf-ai-phase-01-${crypto.randomUUID()}`;

    const { data: disclosure, error: disclosureError } = await admin
      .from("disclosures")
      .insert({
        stock_id: stockId,
        external_id: externalId,
        source_type: "tdnet",
        title: "配当予想の修正に関するお知らせ",
        document_url: "https://example.com/disclosure.pdf",
        storage_path: `disclosures/9433/${YEAR}/${externalId}.pdf`,
        disclosure_type: "dividend_forecast_revision",
        parse_status: "downloaded",
        review_priority: "high",
        ai_parse_attempts: 1,
        raw_payload: { externalId }
      })
      .select(
        "id, disclosure_type, parse_status, review_priority, ai_parse_attempts, raw_payload"
      )
      .single();

    expect(disclosureError).toBeNull();
    expect(disclosure).toMatchObject({
      disclosure_type: "dividend_forecast_revision",
      parse_status: "downloaded",
      review_priority: "high",
      ai_parse_attempts: 1
    });
    disclosureIds.push(disclosure!.id);

    const { data: review, error: reviewError } = await admin
      .from("dividend_reviews")
      .insert({
        stock_id: stockId,
        disclosure_id: disclosure!.id,
        fiscal_year: YEAR - 1,
        event_type: "year_end",
        extracted_dividend_per_share: 120,
        previous_dividend_per_share: 100,
        extracted_payment_month: 6,
        extracted_record_date: `${YEAR}-03-31`,
        change_type: "increase",
        evidence_text: "期末配当予想を120円に修正",
        warning_message: null,
        status: "needs_manual_check",
        confidence_score: 0.75,
        raw_payload: { events: [{ eventType: "year_end" }] }
      })
      .select("id, fiscal_year, event_type, extracted_record_date, change_type, status")
      .single();

    expect(reviewError).toBeNull();
    expect(review).toMatchObject({
      fiscal_year: YEAR - 1,
      event_type: "year_end",
      extracted_record_date: `${YEAR}-03-31`,
      change_type: "increase",
      status: "needs_manual_check"
    });
    reviewIds.push(review!.id);

    const { data: job, error: jobError } = await admin
      .from("jobs")
      .insert({
        type: "parse_disclosure_pdf_ai",
        payload: { disclosureId: disclosure!.id },
        max_attempts: 3
      })
      .select("id, type, max_attempts")
      .single();

    expect(jobError).toBeNull();
    expect(job).toMatchObject({ type: "parse_disclosure_pdf_ai", max_attempts: 3 });
    jobIds.push(job!.id);

    const eventId = await createTestDividendEvent({
      stockId,
      fiscalYear: YEAR - 1,
      expectedPaymentYear: YEAR,
      eventType: "year_end",
      dividendPerShare: 120,
      expectedPaymentMonth: 6,
      reviewStatus: "approved"
    });
    eventIds.push(eventId);

    const { error: eventError } = await admin
      .from("dividend_events")
      .update({
        disclosure_id: disclosure!.id,
        raw_payload: {
          components: {
            ordinary: 100,
            special: 20
          }
        }
      })
      .eq("id", eventId);

    expect(eventError).toBeNull();
  });

  it("keeps the disclosures storage bucket private", async () => {
    const { data, error } = await createAdminClient().storage.getBucket("disclosures");

    expect(error).toBeNull();
    expect(data?.public).toBe(false);
  });

  it("hides admin-only disclosure, review, and job rows from regular users", async () => {
    const admin = createAdminClient();
    const externalId = `pdf-ai-rls-${crypto.randomUUID()}`;

    const { data: disclosure } = await admin
      .from("disclosures")
      .insert({
        stock_id: stockId,
        external_id: externalId,
        source_type: "tdnet",
        title: "剰余金の配当に関するお知らせ"
      })
      .select("id")
      .single();
    disclosureIds.push(disclosure!.id);

    const { data: review } = await admin
      .from("dividend_reviews")
      .insert({
        stock_id: stockId,
        disclosure_id: disclosure!.id,
        status: "pending",
        raw_payload: {}
      })
      .select("id")
      .single();
    reviewIds.push(review!.id);

    const { data: job } = await admin
      .from("jobs")
      .insert({
        type: "download_disclosure_pdf",
        payload: { disclosureId: disclosure!.id }
      })
      .select("id")
      .single();
    jobIds.push(job!.id);

    const [{ data: disclosures }, { data: reviews }, { data: jobs }] = await Promise.all([
      client.from("disclosures").select("id").eq("id", disclosure!.id),
      client.from("dividend_reviews").select("id").eq("id", review!.id),
      client.from("jobs").select("id").eq("id", job!.id)
    ]);

    expect(disclosures).toEqual([]);
    expect(reviews).toEqual([]);
    expect(jobs).toEqual([]);
  });

  it("excludes non-payable approved event types from user calendar aggregation", async () => {
    const payable = await createTestDividendEvent({
      stockId,
      fiscalYear: YEAR,
      expectedPaymentYear: YEAR,
      eventType: "interim",
      dividendPerShare: 100,
      expectedPaymentMonth: 4,
      reviewStatus: "approved"
    });
    const annualTotal = await createTestDividendEvent({
      stockId,
      fiscalYear: YEAR,
      expectedPaymentYear: YEAR,
      eventType: "annual_total",
      dividendPerShare: 9999,
      expectedPaymentMonth: 4,
      reviewStatus: "approved"
    });
    const special = await createTestDividendEvent({
      stockId,
      fiscalYear: YEAR,
      expectedPaymentYear: YEAR,
      eventType: "special",
      dividendPerShare: 9999,
      expectedPaymentMonth: 4,
      reviewStatus: "approved"
    });
    eventIds.push(payable, annualTotal, special);

    const { data, error } = await client.rpc("get_dividend_calendar", {
      p_year: YEAR,
      p_amount_basis: "before_tax",
      p_account_type: "all"
    });

    expect(error).toBeNull();
    type RawCalendarRow = { month: number; amount: number | null; event_count: number };
    const april = (data as RawCalendarRow[]).find((row) => row.month === 4);
    expect(Number(april?.amount)).toBeCloseTo(10000, 1);
    expect(Number(april?.event_count)).toBe(1);
  });
});
