import { describe, it, beforeAll, afterAll, expect } from "vitest";
import { requireRemoteTests } from "../../helpers/env";
import { createAdminClient } from "../../helpers/supabase";
import { createTestUser, signInAs, uniqueEmail, type TestUser } from "../../helpers/test-users";
import { cleanupUser } from "../../helpers/cleanup";
import { getTestStocks } from "../../fixtures/test-stock";

beforeAll(() => requireRemoteTests());

const PASSWORD = "Test1234!";

describe("holdings RLS", () => {
  let userA: TestUser;
  let userB: TestUser;
  let clientA: Awaited<ReturnType<typeof signInAs>>;
  let clientB: Awaited<ReturnType<typeof signInAs>>;
  let holdingId: string;

  beforeAll(async () => {
    const { supported } = await getTestStocks();
    userA = await createTestUser(uniqueEmail("rls-a"), PASSWORD);
    userB = await createTestUser(uniqueEmail("rls-b"), PASSWORD);
    clientA = await signInAs(userA.email, PASSWORD);
    clientB = await signInAs(userB.email, PASSWORD);

    const { data } = await clientA
      .from("holdings")
      .insert({
        user_id: userA.id,
        stock_id: supported.id,
        quantity: 10,
        average_purchase_price: 4000,
        account_type: "general",
      })
      .select("id")
      .single();
    holdingId = data!.id;
  });

  afterAll(async () => {
    await cleanupUser(userA.id);
    await cleanupUser(userB.id);
  });

  it("User B cannot read User A holding by ID", async () => {
    const { data } = await clientB
      .from("holdings")
      .select("id")
      .eq("id", holdingId);
    expect(data).toHaveLength(0);
  });

  it("User B cannot update User A holding", async () => {
    await clientB
      .from("holdings")
      .update({ quantity: 9999 })
      .eq("id", holdingId);

    const admin = createAdminClient();
    const { data } = await admin
      .from("holdings")
      .select("quantity")
      .eq("id", holdingId)
      .single();
    expect(Number(data!.quantity)).not.toBe(9999);
  });
});
