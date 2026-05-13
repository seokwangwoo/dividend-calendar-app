import { describe, it, beforeAll, afterAll, expect } from "vitest";
import { requireRemoteTests } from "../../helpers/env";
import { createTestUser, signInAs, uniqueEmail, type TestUser } from "../../helpers/test-users";
import { cleanupUser } from "../../helpers/cleanup";
import { getTestStocks } from "../../fixtures/test-stock";

beforeAll(() => requireRemoteTests());

const PASSWORD = "Test1234!";

describe("unsupported stock rules", () => {
  let user: TestUser;
  let client: Awaited<ReturnType<typeof signInAs>>;

  beforeAll(async () => {
    user = await createTestUser(uniqueEmail("unsupported"), PASSWORD);
    client = await signInAs(user.email, PASSWORD);
  });

  afterAll(async () => {
    await cleanupUser(user.id);
  });

  it("calculate_holding_dividend allows unsupported stock calculations", async () => {
    const { unsupported } = await getTestStocks();

    if (!unsupported) {
      console.warn("No unsupported stock in seed — skipping test");
      return;
    }

    const { data, error } = await client.rpc("calculate_holding_dividend", {
      p_stock_id: unsupported.id,
      p_quantity: 10,
      p_average_purchase_price: 1000,
      p_account_type: "nisa",
    });
    expect(error).toBeNull();
    expect(data?.[0]).toMatchObject({
      currency: "JPY",
    });
    expect(data).toHaveLength(1);
  });

  it("unsupported stock is visible in search results", async () => {
    const { unsupported } = await getTestStocks();
    if (!unsupported) return;

    const { data, error } = await client
      .from("stocks")
      .select("id, ticker, support_status")
      .eq("id", unsupported.id)
      .single();
    expect(error).toBeNull();
    expect(data?.support_status).toBe("unsupported");
  });
});
