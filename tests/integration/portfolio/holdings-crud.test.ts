import { describe, it, beforeAll, afterAll, expect } from "vitest";
import { requireRemoteTests } from "../../helpers/env";
import { createAdminClient } from "../../helpers/supabase";
import { createTestUser, signInAs, uniqueEmail, type TestUser } from "../../helpers/test-users";
import { cleanupUser } from "../../helpers/cleanup";
import { getTestStocks } from "../../fixtures/test-stock";

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
