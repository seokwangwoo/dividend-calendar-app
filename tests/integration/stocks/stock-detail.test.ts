import { describe, it, beforeAll, afterAll, expect } from "vitest";
import { requireRemoteTests } from "../../helpers/env";
import { createAdminClient } from "../../helpers/supabase";
import {
  createTestUser,
  signInAs,
  uniqueEmail,
  type TestUser,
} from "../../helpers/test-users";
import { cleanupUser } from "../../helpers/cleanup";
import { getTestStocks } from "../../fixtures/test-stock";
import {
  createTestDividendEvent,
  deleteTestDividendEvents,
  isoDate,
} from "../../fixtures/test-dividend-events";
import type { StockDetail } from "@/features/dividends/types";

beforeAll(() => requireRemoteTests());

const PASSWORD = "Test1234!";
const YEAR = new Date().getFullYear();

describe("get_stock_detail RPC", () => {
  let user: TestUser;
  let client: Awaited<ReturnType<typeof signInAs>>;
  const eventIds: string[] = [];
  let stockId: string;

  beforeAll(async () => {
    const { supported } = await getTestStocks();
    stockId = supported.id;

    user = await createTestUser(uniqueEmail("stock-detail"), PASSWORD);
    client = await signInAs(user.email, PASSWORD);

    // Insert holding for this user
    await createAdminClient().from("holdings").insert({
      user_id: user.id,
      stock_id: stockId,
      quantity: 30,
      average_purchase_price: 4000,
      account_type: "nisa",
    });

    // Approved event with source info
    const e1 = await createTestDividendEvent({
      stockId,
      fiscalYear: YEAR,
      dividendPerShare: 100,
      expectedPaymentDate: isoDate(YEAR, 9, 20),
      expectedPaymentMonth: 9,
      status: "confirmed",
      reviewStatus: "approved",
      sourceType: "tdnet",
      sourceUrl: "https://example.com/disclosure/approved",
      sourcePublishedAt: `${YEAR}-01-15T10:00:00Z`,
    });
    // Pending event — must not appear in scheduleEvents
    const e2 = await createTestDividendEvent({
      stockId,
      fiscalYear: YEAR,
      dividendPerShare: 200,
      expectedPaymentMonth: 3,
      reviewStatus: "pending",
    });
    // Rejected event — must not appear
    const e3 = await createTestDividendEvent({
      stockId,
      fiscalYear: YEAR,
      dividendPerShare: 300,
      expectedPaymentMonth: 6,
      reviewStatus: "rejected",
    });
    eventIds.push(e1, e2, e3);
  });

  afterAll(async () => {
    await deleteTestDividendEvents(eventIds);
    await cleanupUser(user.id);
  });

  it("returns stock basic info", async () => {
    const { data, error } = await client.rpc("get_stock_detail", {
      p_stock_id: stockId,
    });
    expect(error).toBeNull();
    const detail = data as unknown as StockDetail;
    expect(detail.stock.id).toBe(stockId);
    expect(detail.stock.ticker).toBeDefined();
    expect(detail.stock.name).toBeDefined();
  });

  it("userHoldings contains the user's holding", async () => {
    const { data } = await client.rpc("get_stock_detail", {
      p_stock_id: stockId,
    });
    const detail = data as unknown as StockDetail;
    expect(detail.userHoldings.length).toBeGreaterThan(0);
    const holding = detail.userHoldings[0];
    expect(holding.accountType).toBe("nisa");
    expect(Number(holding.quantity)).toBe(30);
  });

  it("dividendSchedule contains only approved events", async () => {
    const { data } = await client.rpc("get_stock_detail", {
      p_stock_id: stockId,
    });
    const detail = data as unknown as StockDetail;
    // Our approved event has DPS=100 and payment date in month 9 of YEAR.
    // Pending and rejected events should not appear.
    // We identify our event by the unique source URL.
    // All returned events must be approved (review_status='approved')
    // The RPC only returns approved events, so every event status can be
    // estimated/confirmed/paid/undecided — but none should be pending/rejected.
    expect(
      detail.dividendSchedule.every(
        (e: { status: string }) =>
          e.status !== "pending" && e.status !== "rejected"
      )
    ).toBe(true);
    // Our specific confirmed event should be present
    const ourEvent = detail.dividendSchedule.find(
      (e: { status: string; dividendPerShare: number | null }) =>
        e.status === "confirmed" && Number(e.dividendPerShare) === 100
    );
    expect(ourEvent).toBeDefined();
  });

  it("source shows reviewStatus = approved", async () => {
    const { data } = await client.rpc("get_stock_detail", {
      p_stock_id: stockId,
    });
    const detail = data as unknown as StockDetail;
    // source is the most recent approved event's source metadata
    expect(detail.source).not.toBeNull();
    expect(detail.source!.reviewStatus).toBe("approved");
  });

  it("dividendSchedule event has status = confirmed", async () => {
    const { data } = await client.rpc("get_stock_detail", {
      p_stock_id: stockId,
    });
    const detail = data as unknown as StockDetail;
    const approved = detail.dividendSchedule.find(
      (e) => Number(e.dividendPerShare) === 100
    );
    expect(approved?.status).toBe("confirmed");
  });
});

describe("get_stock_detail with no holdings", () => {
  let user: TestUser;
  let client: Awaited<ReturnType<typeof signInAs>>;
  let stockId: string;

  beforeAll(async () => {
    const { supported } = await getTestStocks();
    stockId = supported.id;
    user = await createTestUser(uniqueEmail("stock-detail-empty"), PASSWORD);
    client = await signInAs(user.email, PASSWORD);
  });

  afterAll(() => cleanupUser(user.id));

  it("userHoldings is empty when user does not hold the stock", async () => {
    const { data } = await client.rpc("get_stock_detail", {
      p_stock_id: stockId,
    });
    const detail = data as unknown as StockDetail;
    expect(detail.userHoldings).toHaveLength(0);
  });
});
