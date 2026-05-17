import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
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
import { getActiveYieldTargets } from "@/features/notifications/queries";

const mocks = vi.hoisted(() => ({
  serverClient: null as Awaited<ReturnType<typeof signInAs>> | null
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => {
    if (!mocks.serverClient) {
      throw new Error("serverClient mock is not configured");
    }

    return mocks.serverClient;
  })
}));

beforeAll(() => requireRemoteTests());

const PASSWORD = "Test1234!";

describe("yield target queries", () => {
  let owner: TestUser;
  let otherUser: TestUser;
  let ownerClient: Awaited<ReturnType<typeof signInAs>>;
  let stock: {
    id: string;
    name: string;
    ticker: string;
    expected_dividend_yield: number | null;
  };

  beforeAll(async () => {
    const { supported } = await getTestStocks();
    const admin = createAdminClient();
    const { data: stockRow, error: stockError } = await admin
      .from("stocks")
      .select("id, name, ticker, expected_dividend_yield")
      .eq("id", supported.id)
      .single();

    if (stockError || !stockRow) {
      throw new Error(stockError?.message ?? "Test stock not found");
    }

    stock = stockRow;
    owner = await createTestUser(uniqueEmail("yield-target-owner"), PASSWORD);
    otherUser = await createTestUser(uniqueEmail("yield-target-other"), PASSWORD);
    ownerClient = await signInAs(owner.email, PASSWORD);
    mocks.serverClient = ownerClient;

    const { error } = await admin.from("notification_rules").insert([
      {
        user_id: owner.id,
        stock_id: stock.id,
        basis: "before_tax_yield",
        operator: "gte",
        target_yield: 3.5,
        status: "active",
        notify_in_app: true,
        notify_email: false
      },
      {
        user_id: owner.id,
        stock_id: stock.id,
        basis: "before_tax_yield",
        operator: "lte",
        target_yield: 2,
        status: "disabled",
        notify_in_app: true,
        notify_email: false
      },
      {
        user_id: otherUser.id,
        stock_id: stock.id,
        basis: "before_tax_yield",
        operator: "gte",
        target_yield: 9.9,
        status: "active",
        notify_in_app: true,
        notify_email: false
      }
    ]);

    if (error) {
      throw new Error(`insert notification_rules: ${error.message}`);
    }
  });

  afterAll(async () => {
    mocks.serverClient = null;
    if (owner) await cleanupUser(owner.id);
    if (otherUser) await cleanupUser(otherUser.id);
  });

  it("returns only the current user's active yield targets with joined stock data", async () => {
    const targets = await getActiveYieldTargets();

    expect(targets).toHaveLength(1);
    expect(targets[0]).toEqual({
      ruleId: expect.any(String),
      stockId: stock.id,
      stockName: stock.name,
      ticker: stock.ticker,
      operator: "gte",
      targetYield: 3.5,
      expectedDividendYield: stock.expected_dividend_yield
    });
  });
});
