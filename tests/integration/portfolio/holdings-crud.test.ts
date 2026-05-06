import { describe, it, beforeAll, afterAll, expect } from "vitest";
import { requireRemoteTests } from "../../helpers/env";
import { createTestUser, signInAs, uniqueEmail, type TestUser } from "../../helpers/test-users";
import { cleanupUser } from "../../helpers/cleanup";
import { getTestStocks } from "../../fixtures/test-stock";
import { createAdminClient } from "../../helpers/supabase";
import {
  createTestDividendEvent,
  deleteTestDividendEvents
} from "../../fixtures/test-dividend-events";
import type { HomeSummary } from "@/features/dividends/types";

beforeAll(() => requireRemoteTests());

const PASSWORD = "Test1234!";

describe("holdings CRUD", () => {
  let user: TestUser;
  let client: Awaited<ReturnType<typeof signInAs>>;
  let stockId: string;

  beforeAll(async () => {
    const { supported } = await getTestStocks();
    stockId = supported.id;

    user = await createTestUser(uniqueEmail("holdings-crud"), PASSWORD);
    client = await signInAs(user.email, PASSWORD);
  });

  afterAll(async () => {
    await cleanupUser(user.id);
  });

  describe("insert", () => {
    it("inserts a holding successfully", async () => {
      const { error } = await client.from("holdings").insert({
        user_id: user.id,
        stock_id: stockId,
        quantity: 50,
        average_purchase_price: 3500,
        account_type: "nisa",
      });
      expect(error).toBeNull();
    });

    it("inserted holding appears in active list", async () => {
      const { data } = await client
        .from("holdings")
        .select("id")
        .eq("stock_id", stockId)
        .is("deleted_at", null);
      expect(data?.length).toBeGreaterThan(0);
    });
  });

  describe("soft delete", () => {
    let holdingId: string;

    beforeAll(async () => {
      const { data } = await client
        .from("holdings")
        .insert({
          user_id: user.id,
          stock_id: stockId,
          quantity: 10,
          average_purchase_price: 4000,
          account_type: "tokutei",
        })
        .select("id")
        .single();
      holdingId = data!.id;
    });

    it("sets deleted_at on the holding", async () => {
      const { error } = await client
        .from("holdings")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", holdingId);
      expect(error).toBeNull();
    });

    it("deleted holding is absent from active list", async () => {
      const { data } = await client
        .from("holdings")
        .select("id")
        .eq("id", holdingId)
        .is("deleted_at", null);
      expect(data).toHaveLength(0);
    });

    it("portfolio summary excludes deleted holding", async () => {
      const { data, error } = await client.rpc("get_portfolio_summary");
      expect(error).toBeNull();
      expect(data).toBeDefined();
    });
  });

  describe("same stock in multiple accounts", () => {
    beforeAll(async () => {
      await client.from("holdings").insert([
        {
          user_id: user.id,
          stock_id: stockId,
          quantity: 30,
          average_purchase_price: 4000,
          account_type: "nisa",
        },
        {
          user_id: user.id,
          stock_id: stockId,
          quantity: 20,
          average_purchase_price: 4100,
          account_type: "general",
        },
      ]);
    });

    it("both account type rows are present", async () => {
      const { data } = await client
        .from("holdings")
        .select("account_type")
        .eq("stock_id", stockId)
        .is("deleted_at", null);
      const types = data?.map((h) => h.account_type) ?? [];
      expect(types).toContain("nisa");
      expect(types).toContain("general");
    });
  });
});

describe("portfolio annual dividend consistency", () => {
  let user: TestUser;
  let client: Awaited<ReturnType<typeof signInAs>>;
  let kddiId: string;
  let jtId: string;
  const eventIds: string[] = [];
  const PAYMENT_YEAR = new Date().getFullYear() + 10;

  beforeAll(async () => {
    const admin = createAdminClient();
    const { data: kddi } = await admin
      .from("stocks")
      .select("id")
      .eq("ticker", "9433")
      .single();
    const { data: jt } = await admin
      .from("stocks")
      .select("id")
      .eq("ticker", "2914")
      .single();

    kddiId = kddi!.id;
    jtId = jt!.id;

    user = await createTestUser(uniqueEmail("portfolio-consistency"), PASSWORD);
    client = await signInAs(user.email, PASSWORD);

    await admin.from("holdings").insert([
      {
        user_id: user.id,
        stock_id: kddiId,
        quantity: 100,
        average_purchase_price: 4300,
        account_type: "nisa",
      },
      {
        user_id: user.id,
        stock_id: jtId,
        quantity: 100,
        average_purchase_price: 3800,
        account_type: "tokutei",
      },
    ]);

    eventIds.push(
      await createTestDividendEvent({
        stockId: kddiId,
        fiscalYear: PAYMENT_YEAR - 1,
        paymentYear: PAYMENT_YEAR,
        dividendPerShare: 150,
        expectedPaymentMonth: 6,
        reviewStatus: "approved",
      }),
      await createTestDividendEvent({
        stockId: jtId,
        fiscalYear: PAYMENT_YEAR - 1,
        paymentYear: PAYMENT_YEAR,
        dividendPerShare: 194,
        expectedPaymentMonth: 6,
        reviewStatus: "approved",
      }),
      await createTestDividendEvent({
        stockId: kddiId,
        fiscalYear: PAYMENT_YEAR,
        paymentYear: PAYMENT_YEAR + 1,
        dividendPerShare: 9999,
        expectedPaymentMonth: 6,
        reviewStatus: "approved",
      })
    );
  });

  afterAll(async () => {
    await deleteTestDividendEvents(eventIds);
    await cleanupUser(user.id);
  });

  it("holding summary row uses approved payment_year events, not stock estimates", async () => {
    const { data, error } = await client.rpc("get_portfolio_summary", {
      p_account_type: null,
      p_year: PAYMENT_YEAR,
    });

    expect(error).toBeNull();
    expect(Number(data?.[0]?.annual_before_tax_amount)).toBeCloseTo(34400, 1);
    expect(Number(data?.[0]?.annual_after_tax_amount)).toBeCloseTo(30458.89, 1);
  });

  it("excludes approved events whose payment_year is N±1", async () => {
    const { data, error } = await client.rpc("get_portfolio_summary", {
      p_account_type: null,
      p_year: PAYMENT_YEAR,
    });

    expect(error).toBeNull();
    expect(Number(data?.[0]?.annual_before_tax_amount)).toBeLessThan(100000);
  });

  it("KDDI + JT portfolio query matches home summary for the same payment_year", async () => {
    const [{ data: portfolio, error: portfolioError }, { data: home, error: homeError }] =
      await Promise.all([
        client.rpc("get_portfolio_summary", {
          p_account_type: null,
          p_year: PAYMENT_YEAR,
        }),
        client.rpc("get_home_summary", { p_year: PAYMENT_YEAR }),
      ]);

    expect(portfolioError).toBeNull();
    expect(homeError).toBeNull();

    const summary = home as unknown as HomeSummary;
    expect(Number(portfolio?.[0]?.annual_after_tax_amount)).toBeCloseTo(
      Number(summary.annualDividend.afterTaxAmount),
      1
    );
  });
});
