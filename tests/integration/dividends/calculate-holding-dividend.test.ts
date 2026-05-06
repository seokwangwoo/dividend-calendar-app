import { describe, expect, it, beforeAll } from "vitest";
import { requireRemoteTests } from "../../helpers/env";
import { createTestUser, signInAs, uniqueEmail, deleteTestUser, type TestUser } from "../../helpers/test-users";
import { expectApprox } from "../../helpers/assertions";
import { getTestStocks } from "../../fixtures/test-stock";

beforeAll(() => requireRemoteTests());

const PASSWORD = "Test1234!";
const TAX_RATE = 0.20315;

describe("calculate_holding_dividend RPC", () => {
  let user: TestUser;
  let client: Awaited<ReturnType<typeof signInAs>>;
  let stockId: string;
  let dps: number;

  beforeAll(async () => {
    const { supported } = await getTestStocks();
    stockId = supported.id;
    dps = Number(supported.expected_annual_dividend_per_share);

    const email = uniqueEmail("calc-test");
    user = await createTestUser(email, PASSWORD);
    client = await signInAs(email, PASSWORD);

    return async () => deleteTestUser(user.id);
  });

  async function calc(qty: number, accountType: string) {
    const { data, error } = await client.rpc("calculate_holding_dividend", {
      p_stock_id: stockId,
      p_quantity: qty,
      p_average_purchase_price: 4000,
      p_account_type: accountType,
    });
    if (error) throw new Error(error.message);
    return data![0];
  }

  describe("NISA", () => {
    it("tax is zero", async () => {
      const row = await calc(100, "nisa");
      expectApprox(Number(row.estimated_tax_amount), 0, 0.001, "NISA tax");
    });

    it("after_tax_amount equals before_tax_amount", async () => {
      const row = await calc(100, "nisa");
      expectApprox(
        Number(row.after_tax_amount),
        Number(row.before_tax_amount),
        0.001,
        "NISA after = before"
      );
    });

    it("before_tax_amount = DPS * quantity", async () => {
      const row = await calc(100, "nisa");
      expectApprox(Number(row.before_tax_amount), dps * 100, 0.01);
    });
  });

  describe("tokutei", () => {
    it("tax = before_tax * 20.315%", async () => {
      const row = await calc(100, "tokutei");
      expectApprox(
        Number(row.estimated_tax_amount),
        dps * 100 * TAX_RATE,
        0.01,
        "tokutei tax rate"
      );
    });

    it("after_tax = before - tax", async () => {
      const row = await calc(100, "tokutei");
      expectApprox(
        Number(row.after_tax_amount),
        dps * 100 * (1 - TAX_RATE),
        0.01
      );
    });
  });

  describe("general", () => {
    it("tax = before_tax * 20.315%", async () => {
      const row = await calc(100, "general");
      expectApprox(
        Number(row.estimated_tax_amount),
        dps * 100 * TAX_RATE,
        0.01,
        "general tax rate"
      );
    });

    it("after_tax = before - tax", async () => {
      const row = await calc(100, "general");
      expectApprox(
        Number(row.after_tax_amount),
        dps * 100 * (1 - TAX_RATE),
        0.01
      );
    });
  });

  describe("quantity scaling", () => {
    it("doubling quantity doubles before_tax_amount", async () => {
      const r1 = await calc(100, "tokutei");
      const r2 = await calc(200, "tokutei");
      expectApprox(
        Number(r2.before_tax_amount) / Number(r1.before_tax_amount),
        2,
        0.001,
        "quantity 2x → amount 2x"
      );
    });
  });

  describe("account type effect on tax", () => {
    it("switching from nisa to tokutei increases tax", async () => {
      const nisa = await calc(100, "nisa");
      const tokutei = await calc(100, "tokutei");
      expect(Number(nisa.estimated_tax_amount)).toBe(0);
      expect(Number(tokutei.estimated_tax_amount)).toBeGreaterThan(0);
    });
  });
});
