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
import type { MonthDetail } from "@/features/dividends/types";

beforeAll(() => requireRemoteTests());

const PASSWORD = "Test1234!";
const YEAR = new Date().getFullYear();
const TEST_MONTH = 6;
const DPS = 150;
const QTY = 80;
const TAX_RATE = 0.20315;

describe("get_dividend_month_detail RPC", () => {
  let user: TestUser;
  let client: Awaited<ReturnType<typeof signInAs>>;
  const eventIds: string[] = [];
  let stockId: string;
  let stockName: string;

  beforeAll(async () => {
    const { supported } = await getTestStocks();
    stockId = supported.id;
    stockName = supported.name;

    user = await createTestUser(uniqueEmail("month-detail"), PASSWORD);
    client = await signInAs(user.email, PASSWORD);

    await createAdminClient().from("holdings").insert({
      user_id: user.id,
      stock_id: stockId,
      quantity: QTY,
      average_purchase_price: 4000,
      account_type: "tokutei",
    });

    // Approved event in TEST_MONTH with a specific payment date
    const e1 = await createTestDividendEvent({
      stockId,
      fiscalYear: YEAR,
      dividendPerShare: DPS,
      expectedPaymentMonth: TEST_MONTH,
      expectedPaymentDate: isoDate(YEAR, TEST_MONTH, 15),
      reviewStatus: "approved",
      sourceType: "tdnet",
      sourceUrl: "https://example.com/disclosure/1",
    });
    // Rejected event in same month — must not appear
    const e2 = await createTestDividendEvent({
      stockId,
      fiscalYear: YEAR,
      dividendPerShare: 9999,
      expectedPaymentMonth: TEST_MONTH,
      reviewStatus: "rejected",
    });
    eventIds.push(e1, e2);
  });

  afterAll(async () => {
    await deleteTestDividendEvents(eventIds);
    await cleanupUser(user.id);
  });

  it("returns correct year and month", async () => {
    const { data, error } = await client.rpc("get_dividend_month_detail", {
      p_year: YEAR,
      p_month: TEST_MONTH,
      p_basis: "after_tax",
      p_account_type: "all",
    });
    expect(error).toBeNull();
    const detail = data as unknown as MonthDetail;
    expect(detail.year).toBe(YEAR);
    expect(detail.month).toBe(TEST_MONTH);
  });

  it("events array contains the approved event", async () => {
    const { data } = await client.rpc("get_dividend_month_detail", {
      p_year: YEAR,
      p_month: TEST_MONTH,
      p_basis: "after_tax",
      p_account_type: "all",
    });
    const detail = data as unknown as MonthDetail;
    expect(detail.events.length).toBeGreaterThan(0);
    const evt = detail.events[0];
    expect(evt.ticker).toBeDefined();
    expect(evt.stockName).toBe(stockName);
    expect(evt.accountType).toBe("tokutei");
    expect(evt.quantity).toBe(QTY);
  });

  it("rejected events do not appear in events array", async () => {
    const { data } = await client.rpc("get_dividend_month_detail", {
      p_year: YEAR,
      p_month: TEST_MONTH,
      p_basis: "after_tax",
      p_account_type: "all",
    });
    const detail = data as unknown as MonthDetail;
    // If rejected 9999-DPS event appeared, totalBeforeTaxAmount would be > DPS*QTY
    expect(Number(detail.totalBeforeTaxAmount)).toBeCloseTo(DPS * QTY, 1);
  });

  it("totalBeforeTaxAmount = DPS * quantity", async () => {
    const { data } = await client.rpc("get_dividend_month_detail", {
      p_year: YEAR,
      p_month: TEST_MONTH,
      p_basis: "after_tax",
      p_account_type: "all",
    });
    const detail = data as unknown as MonthDetail;
    expect(Number(detail.totalBeforeTaxAmount)).toBeCloseTo(DPS * QTY, 1);
  });

  it("totalAfterTaxAmount = before - tax", async () => {
    const { data } = await client.rpc("get_dividend_month_detail", {
      p_year: YEAR,
      p_month: TEST_MONTH,
      p_basis: "after_tax",
      p_account_type: "all",
    });
    const detail = data as unknown as MonthDetail;
    expect(Number(detail.totalAfterTaxAmount)).toBeCloseTo(
      DPS * QTY * (1 - TAX_RATE),
      1
    );
  });

  it("displayDateText contains the payment date", async () => {
    const { data } = await client.rpc("get_dividend_month_detail", {
      p_year: YEAR,
      p_month: TEST_MONTH,
      p_basis: "after_tax",
      p_account_type: "all",
    });
    const detail = data as unknown as MonthDetail;
    const evt = detail.events[0];
    // Expected: "YYYY年MM月DD日" format
    expect(evt.displayDateText).toMatch(/\d{4}年\d+月\d+日/);
  });

  it("sourceUrl and sourceType are present on the event", async () => {
    const { data } = await client.rpc("get_dividend_month_detail", {
      p_year: YEAR,
      p_month: TEST_MONTH,
      p_basis: "after_tax",
      p_account_type: "all",
    });
    const detail = data as unknown as MonthDetail;
    const evt = detail.events[0];
    expect(evt.sourceType).toBe("tdnet");
    expect(evt.sourceUrl).toBe("https://example.com/disclosure/1");
  });

  it("empty month returns events: []", async () => {
    const emptyMonth = TEST_MONTH === 6 ? 7 : 6;
    const { data } = await client.rpc("get_dividend_month_detail", {
      p_year: YEAR,
      p_month: emptyMonth,
      p_basis: "after_tax",
      p_account_type: "all",
    });
    const detail = data as unknown as MonthDetail;
    expect(detail.events).toHaveLength(0);
    expect(detail.totalAfterTaxAmount).toBeNull();
  });
});
