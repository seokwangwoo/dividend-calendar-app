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
  deleteTestDividendEvents
} from "../../fixtures/test-dividend-events";
import type { HomeSummary } from "@/features/dividends/types";

beforeAll(() => requireRemoteTests());

const PASSWORD = "Test1234!";
const YEAR = new Date().getFullYear();
const CURRENT_MONTH = new Date().getMonth() + 1;

describe("get_home_summary RPC", () => {
  let stockId: string;
  let dps: number;

  beforeAll(async () => {
    const { supported } = await getTestStocks();
    stockId = supported.id;
    dps = Number(supported.expected_annual_dividend_per_share);
  });

  describe("no holdings", () => {
    let user: TestUser;
    let client: Awaited<ReturnType<typeof signInAs>>;

    beforeAll(async () => {
      user = await createTestUser(uniqueEmail("home-empty"), PASSWORD);
      client = await signInAs(user.email, PASSWORD);
    });

    afterAll(() => cleanupUser(user.id));

    it("annualDividend.afterTaxAmount is null when no holdings", async () => {
      const { data, error } = await client.rpc("get_home_summary", {
        p_year: YEAR,
      });
      expect(error).toBeNull();
      const summary = data as unknown as HomeSummary;
      expect(summary.annualDividend.afterTaxAmount).toBeNull();
    });

    it("nextDividend is null when no holdings", async () => {
      const { data } = await client.rpc("get_home_summary", { p_year: YEAR });
      const summary = data as unknown as HomeSummary;
      expect(summary.nextDividend).toBeNull();
    });
  });

  describe("with holdings and approved events", () => {
    let user: TestUser;
    let client: Awaited<ReturnType<typeof signInAs>>;
    const eventIds: string[] = [];
    const QTY = 100;

    beforeAll(async () => {
      user = await createTestUser(uniqueEmail("home-with-data"), PASSWORD);
      client = await signInAs(user.email, PASSWORD);

      // Insert holding
      await createAdminClient().from("holdings").insert({
        user_id: user.id,
        stock_id: stockId,
        quantity: QTY,
        average_purchase_price: 4000,
        account_type: "tokutei",
      });

      // Approved event in a non-current month (month 3)
      const nonCurrentMonth = CURRENT_MONTH === 3 ? 4 : 3;
      const e1 = await createTestDividendEvent({
        stockId,
        fiscalYear: YEAR,
        dividendPerShare: dps,
        expectedPaymentMonth: nonCurrentMonth,
        reviewStatus: "approved",
      });
      eventIds.push(e1);
    });

    afterAll(async () => {
      await deleteTestDividendEvents(eventIds);
      await cleanupUser(user.id);
    });

    it("annualDividend.beforeTaxAmount >= DPS * quantity (at least our event)", async () => {
      const { data } = await client.rpc("get_home_summary", { p_year: YEAR });
      const summary = data as unknown as HomeSummary;
      expect(Number(summary.annualDividend.beforeTaxAmount)).toBeGreaterThanOrEqual(
        dps * QTY - 0.1
      );
    });

    it("annualDividend.afterTaxAmount < beforeTaxAmount (tax applied for tokutei)", async () => {
      const { data } = await client.rpc("get_home_summary", { p_year: YEAR });
      const summary = data as unknown as HomeSummary;
      expect(Number(summary.annualDividend.afterTaxAmount)).toBeLessThan(
        Number(summary.annualDividend.beforeTaxAmount)
      );
    });

    it("annualDividend.afterTaxAmount = beforeTaxAmount - estimatedTaxAmount", async () => {
      const { data } = await client.rpc("get_home_summary", { p_year: YEAR });
      const summary = data as unknown as HomeSummary;
      const before = Number(summary.annualDividend.beforeTaxAmount);
      const tax = Number(summary.annualDividend.estimatedTaxAmount);
      const after = Number(summary.annualDividend.afterTaxAmount);
      expect(after).toBeCloseTo(before - tax, 1);
    });
  });

  describe("currentMonthDividend uses only current month events", () => {
    let user: TestUser;
    let client: Awaited<ReturnType<typeof signInAs>>;
    const eventIds: string[] = [];
    const QTY = 50;

    beforeAll(async () => {
      user = await createTestUser(uniqueEmail("home-month"), PASSWORD);
      client = await signInAs(user.email, PASSWORD);

      await createAdminClient().from("holdings").insert({
        user_id: user.id,
        stock_id: stockId,
        quantity: QTY,
        average_purchase_price: 4000,
        account_type: "nisa",
      });

      // Event in current month
      const e1 = await createTestDividendEvent({
        stockId,
        fiscalYear: YEAR,
        dividendPerShare: 200,
        expectedPaymentMonth: CURRENT_MONTH,
        reviewStatus: "approved",
      });
      // Event in a different month — should NOT affect currentMonthDividend
      const otherMonth = CURRENT_MONTH === 12 ? 1 : CURRENT_MONTH + 1;
      const e2 = await createTestDividendEvent({
        stockId,
        fiscalYear: YEAR,
        dividendPerShare: 9999,
        expectedPaymentMonth: otherMonth,
        reviewStatus: "approved",
      });
      eventIds.push(e1, e2);
    });

    afterAll(async () => {
      await deleteTestDividendEvents(eventIds);
      await cleanupUser(user.id);
    });

    it("currentMonthDividend reflects only the current month event", async () => {
      const { data } = await client.rpc("get_home_summary", { p_year: YEAR });
      const summary = data as unknown as HomeSummary;
      // Only the 200 DPS × 50 QTY event (NISA, tax=0) should appear
      expect(Number(summary.currentMonthDividend.afterTaxAmount)).toBeCloseTo(
        200 * QTY,
        1
      );
    });

    it("currentMonthDividend.month equals current month", async () => {
      const { data } = await client.rpc("get_home_summary", { p_year: YEAR });
      const summary = data as unknown as HomeSummary;
      expect(summary.currentMonthDividend.month).toBe(CURRENT_MONTH);
    });
  });

  describe("pending and rejected events are excluded", () => {
    let user: TestUser;
    let client: Awaited<ReturnType<typeof signInAs>>;
    const eventIds: string[] = [];

    beforeAll(async () => {
      user = await createTestUser(uniqueEmail("home-pending"), PASSWORD);
      client = await signInAs(user.email, PASSWORD);

      await createAdminClient().from("holdings").insert({
        user_id: user.id,
        stock_id: stockId,
        quantity: 10,
        average_purchase_price: 4000,
        account_type: "tokutei",
      });

      // Only pending and rejected events — should not contribute to totals
      const e1 = await createTestDividendEvent({
        stockId,
        fiscalYear: YEAR,
        dividendPerShare: 5000,
        expectedPaymentMonth: CURRENT_MONTH,
        reviewStatus: "pending",
      });
      const e2 = await createTestDividendEvent({
        stockId,
        fiscalYear: YEAR,
        dividendPerShare: 5000,
        expectedPaymentMonth: CURRENT_MONTH,
        reviewStatus: "rejected",
      });
      eventIds.push(e1, e2);
    });

    afterAll(async () => {
      await deleteTestDividendEvents(eventIds);
      await cleanupUser(user.id);
    });

    it("annualDividend.afterTaxAmount is null with only pending/rejected events", async () => {
      const { data } = await client.rpc("get_home_summary", { p_year: YEAR });
      const summary = data as unknown as HomeSummary;
      expect(summary.annualDividend.afterTaxAmount).toBeNull();
    });
  });
});
