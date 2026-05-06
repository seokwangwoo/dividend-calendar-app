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
  isoDate
} from "../../fixtures/test-dividend-events";
import type { CalendarMonth } from "@/features/dividends/types";

beforeAll(() => requireRemoteTests());

const PASSWORD = "Test1234!";
const YEAR = new Date().getFullYear();
const DPS = 200;
const QTY = 100;

describe("get_dividend_calendar RPC", () => {
  let user: TestUser;
  let client: Awaited<ReturnType<typeof signInAs>>;
  const eventIds: string[] = [];
  let stockId: string;

  beforeAll(async () => {
    const { supported } = await getTestStocks();
    stockId = supported.id;

    user = await createTestUser(uniqueEmail("cal"), PASSWORD);
    client = await signInAs(user.email, PASSWORD);

    // NISA holding (tax = 0)
    await createAdminClient().from("holdings").insert([
      {
        user_id: user.id,
        stock_id: stockId,
        quantity: QTY,
        average_purchase_price: 4000,
        account_type: "nisa",
      },
      {
        user_id: user.id,
        stock_id: stockId,
        quantity: QTY,
        average_purchase_price: 4000,
        account_type: "tokutei",
      },
    ]);

    // Approved events in months 3 and 9
    const e1 = await createTestDividendEvent({
      stockId,
      fiscalYear: YEAR,
      dividendPerShare: DPS,
      expectedPaymentMonth: 3,
      reviewStatus: "approved",
    });
    const e2 = await createTestDividendEvent({
      stockId,
      fiscalYear: YEAR,
      dividendPerShare: DPS,
      expectedPaymentMonth: 9,
      reviewStatus: "approved",
    });
    // Pending event — should be excluded
    const e3 = await createTestDividendEvent({
      stockId,
      fiscalYear: YEAR,
      dividendPerShare: 9999,
      expectedPaymentMonth: 3,
      reviewStatus: "pending",
    });
    eventIds.push(e1, e2, e3);
  });

  afterAll(async () => {
    await deleteTestDividendEvents(eventIds);
    await cleanupUser(user.id);
  });

  it("returns exactly 12 rows", async () => {
    const { data, error } = await client.rpc("get_dividend_calendar", {
      p_year: YEAR,
      p_amount_basis: "after_tax",
      p_account_type: "all",
    });
    expect(error).toBeNull();
    const rows = data as CalendarMonth[];
    expect(rows).toHaveLength(12);
    const months = rows.map((r) => r.month);
    expect(months).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it("months with events have non-null amounts", async () => {
    const { data } = await client.rpc("get_dividend_calendar", {
      p_year: YEAR,
      p_amount_basis: "after_tax",
      p_account_type: "all",
    });
    type RawRow = { month: number; amount: number | null; event_count: number };
    const m3r = (data as RawRow[]).find((r) => r.month === 3);
    const m9r = (data as RawRow[]).find((r) => r.month === 9);
    expect(m3r!.amount).not.toBeNull();
    expect(m9r!.amount).not.toBeNull();
    expect(Number(m3r!.event_count)).toBeGreaterThan(0);
    expect(Number(m9r!.event_count)).toBeGreaterThan(0);
  });

  describe("basis switch", () => {
    it("before_tax amount > after_tax amount for tokutei holdings", async () => {
      const [{ data: bData }, { data: aData }] = await Promise.all([
        client.rpc("get_dividend_calendar", {
          p_year: YEAR,
          p_amount_basis: "before_tax",
          p_account_type: "tokutei",
        }),
        client.rpc("get_dividend_calendar", {
          p_year: YEAR,
          p_amount_basis: "after_tax",
          p_account_type: "tokutei",
        }),
      ]);
      const bRow = (bData as CalendarMonth[]).find((r) => r.month === 3);
      const aRow = (aData as CalendarMonth[]).find((r) => r.month === 3);
      expect(Number(bRow!.amount)).toBeGreaterThan(Number(aRow!.amount));
    });

    it("after_tax = before_tax for NISA (tax = 0)", async () => {
      const [{ data: bData }, { data: aData }] = await Promise.all([
        client.rpc("get_dividend_calendar", {
          p_year: YEAR,
          p_amount_basis: "before_tax",
          p_account_type: "nisa",
        }),
        client.rpc("get_dividend_calendar", {
          p_year: YEAR,
          p_amount_basis: "after_tax",
          p_account_type: "nisa",
        }),
      ]);
      const bRow = (bData as CalendarMonth[]).find((r) => r.month === 3);
      const aRow = (aData as CalendarMonth[]).find((r) => r.month === 3);
      expect(Number(bRow!.amount)).toBeCloseTo(Number(aRow!.amount), 1);
    });
  });

  describe("account type filter", () => {
    it("nisa filter returns less than or equal to all-filter amount", async () => {
      const [{ data: allData }, { data: nisaData }] = await Promise.all([
        client.rpc("get_dividend_calendar", {
          p_year: YEAR,
          p_amount_basis: "after_tax",
          p_account_type: "all",
        }),
        client.rpc("get_dividend_calendar", {
          p_year: YEAR,
          p_amount_basis: "after_tax",
          p_account_type: "nisa",
        }),
      ]);
      const allRow = (allData as CalendarMonth[]).find((r) => r.month === 3);
      const nisaRow = (nisaData as CalendarMonth[]).find((r) => r.month === 3);
      expect(Number(nisaRow!.amount)).toBeGreaterThan(0);
      expect(Number(nisaRow!.amount)).toBeLessThanOrEqual(
        Number(allRow!.amount)
      );
    });

    it("tokutei filter returns less than nisa amount (tax deducted)", async () => {
      const [{ data: nisaData }, { data: tokuteiData }] = await Promise.all([
        client.rpc("get_dividend_calendar", {
          p_year: YEAR,
          p_amount_basis: "after_tax",
          p_account_type: "nisa",
        }),
        client.rpc("get_dividend_calendar", {
          p_year: YEAR,
          p_amount_basis: "after_tax",
          p_account_type: "tokutei",
        }),
      ]);
      const nisaRow = (nisaData as CalendarMonth[]).find((r) => r.month === 3);
      const tokuteiRow = (tokuteiData as CalendarMonth[]).find(
        (r) => r.month === 3
      );
      // NISA tax=0, tokutei tax=20.315% → same before-tax DPS, tokutei yields less
      expect(Number(tokuteiRow!.amount)).toBeLessThan(Number(nisaRow!.amount));
    });

    it("all filter returns combined amounts", async () => {
      const [{ data: allData }, { data: nisaData }, { data: tokuteiData }] =
        await Promise.all([
          client.rpc("get_dividend_calendar", {
            p_year: YEAR,
            p_amount_basis: "after_tax",
            p_account_type: "all",
          }),
          client.rpc("get_dividend_calendar", {
            p_year: YEAR,
            p_amount_basis: "after_tax",
            p_account_type: "nisa",
          }),
          client.rpc("get_dividend_calendar", {
            p_year: YEAR,
            p_amount_basis: "after_tax",
            p_account_type: "tokutei",
          }),
        ]);
      const allRow = (allData as CalendarMonth[]).find((r) => r.month === 3);
      const nisaRow = (nisaData as CalendarMonth[]).find((r) => r.month === 3);
      const tokuteiRow = (tokuteiData as CalendarMonth[]).find(
        (r) => r.month === 3
      );
      expect(Number(allRow!.amount)).toBeCloseTo(
        Number(nisaRow!.amount) + Number(tokuteiRow!.amount),
        1
      );
    });

    it("pending events do not appear in calendar totals", async () => {
      const { data } = await client.rpc("get_dividend_calendar", {
        p_year: YEAR,
        p_amount_basis: "before_tax",
        p_account_type: "all",
      });
      const row = (data as CalendarMonth[]).find((r) => r.month === 3);
      // Pending event has DPS=9999 — if included, amount would be far larger
      expect(Number(row!.amount)).toBeLessThan(9999 * QTY);
    });
  });

  describe("calendar basis switch", () => {
    const cbEventIds: string[] = [];

    afterAll(async () => {
      await deleteTestDividendEvents(cbEventIds);
    });

    it("record_date basis groups events by record_date month", async () => {
      const e = await createTestDividendEvent({
        stockId,
        fiscalYear: YEAR,
        dividendPerShare: DPS,
        expectedPaymentMonth: 9,
        recordDate: isoDate(YEAR, 5, 20),
        reviewStatus: "approved"
      });
      cbEventIds.push(e);

      const { data } = await client.rpc("get_dividend_calendar", {
        p_year: YEAR,
        p_amount_basis: "before_tax",
        p_account_type: "all",
        p_calendar_basis: "record_date"
      });
      const mayRow = (data as CalendarMonth[]).find((r) => r.month === 5);
      expect(mayRow!.amount).not.toBeNull();
      expect(Number(mayRow!.event_count)).toBeGreaterThan(0);
    });

    it("ex_dividend_date basis groups events by ex_dividend_date month", async () => {
      const e = await createTestDividendEvent({
        stockId,
        fiscalYear: YEAR,
        dividendPerShare: DPS,
        expectedPaymentMonth: 9,
        exDividendDate: isoDate(YEAR, 4, 15),
        reviewStatus: "approved"
      });
      cbEventIds.push(e);

      const { data } = await client.rpc("get_dividend_calendar", {
        p_year: YEAR,
        p_amount_basis: "before_tax",
        p_account_type: "all",
        p_calendar_basis: "ex_dividend_date"
      });
      const aprRow = (data as CalendarMonth[]).find((r) => r.month === 4);
      expect(aprRow!.amount).not.toBeNull();
      expect(Number(aprRow!.event_count)).toBeGreaterThan(0);
    });
  });
});
