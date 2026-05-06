import { afterAll, beforeAll, describe, expect, it } from "vitest";
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

beforeAll(() => requireRemoteTests());

const PASSWORD = "Test1234!";

describe("notification rules, notifications, and settings", () => {
  let user: TestUser;
  let client: Awaited<ReturnType<typeof signInAs>>;
  let stockId: string;
  const notificationIds: string[] = [];

  beforeAll(async () => {
    const { supported } = await getTestStocks();
    stockId = supported.id;
    user = await createTestUser(uniqueEmail("notifications"), PASSWORD);
    client = await signInAs(user.email, PASSWORD);
  });

  afterAll(async () => {
    if (notificationIds.length > 0) {
      await createAdminClient()
        .from("notifications")
        .delete()
        .in("id", notificationIds);
    }
    await cleanupUser(user.id);
  });

  it("creates before-tax gte and after-tax lte rules", async () => {
    const { data: beforeTaxRule, error: beforeTaxError } = await client
      .from("notification_rules")
      .insert({
        user_id: user.id,
        stock_id: stockId,
        basis: "before_tax_yield",
        operator: "gte",
        target_yield: 3.5,
        notify_in_app: true,
        notify_email: false
      })
      .select("*")
      .single();

    expect(beforeTaxError).toBeNull();
    expect(beforeTaxRule?.basis).toBe("before_tax_yield");
    expect(beforeTaxRule?.operator).toBe("gte");

    const { data: afterTaxRule, error: afterTaxError } = await client
      .from("notification_rules")
      .insert({
        user_id: user.id,
        stock_id: stockId,
        basis: "after_tax_yield",
        operator: "lte",
        target_yield: 2,
        notify_in_app: true,
        notify_email: true
      })
      .select("*")
      .single();

    expect(afterTaxError).toBeNull();
    expect(afterTaxRule?.basis).toBe("after_tax_yield");
    expect(afterTaxRule?.operator).toBe("lte");
  });

  it("disables a rule without hard deleting it", async () => {
    const { data: rule } = await client
      .from("notification_rules")
      .select("id")
      .eq("user_id", user.id)
      .eq("stock_id", stockId)
      .eq("basis", "after_tax_yield")
      .single();

    expect(rule).not.toBeNull();

    const { error } = await client
      .from("notification_rules")
      .update({ status: "disabled" })
      .eq("id", rule!.id);

    expect(error).toBeNull();

    const { data: disabledRule } = await client
      .from("notification_rules")
      .select("status")
      .eq("id", rule!.id)
      .single();

    expect(disabledRule?.status).toBe("disabled");
  });

  it("runs evaluation, creates an in-app notification, excludes disabled rules, and blocks duplicates", async () => {
    const { data: activeRule } = await client
      .from("notification_rules")
      .select("*")
      .eq("user_id", user.id)
      .eq("stock_id", stockId)
      .eq("basis", "before_tax_yield")
      .eq("status", "active")
      .single();

    expect(activeRule).not.toBeNull();

    const { data: firstResult, error: firstError } = await client.rpc(
      "evaluate_notification_rules",
      {
        p_stock_id: stockId,
        p_user_id: user.id,
        p_dry_run: false
      }
    );

    expect(firstError).toBeNull();
    expect(firstResult).toMatchObject({
      evaluated: 1,
      matched: 1,
      inserted: 1,
      deduplicated: 0
    });

    const { data: disabledRules } = await client
      .from("notification_rules")
      .select("id")
      .eq("user_id", user.id)
      .eq("status", "disabled");

    expect(disabledRules?.length).toBeGreaterThan(0);

    const { data: inserted } = await client
      .from("notifications")
      .select("id, payload, body")
      .eq("user_id", user.id)
      .eq("notification_rule_id", activeRule!.id)
      .eq("channel", "in_app")
      .single();

    expect(inserted?.body).toContain("これは売買を推奨するものではありません。");
    expect(inserted?.payload).toMatchObject({
      basis: "before_tax_yield",
      operator: "gte"
    });
    notificationIds.push(inserted!.id);

    const { data: secondResult, error: secondError } = await client.rpc(
      "evaluate_notification_rules",
      {
        p_stock_id: stockId,
        p_user_id: user.id,
        p_dry_run: false
      }
    );

    expect(secondError).toBeNull();
    expect(secondResult).toMatchObject({
      evaluated: 1,
      matched: 0,
      inserted: 0,
      deduplicated: 1
    });
  });

  it("marks a single notification and all notifications as read", async () => {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("notifications")
      .insert([
        {
          user_id: user.id,
          stock_id: stockId,
          type: "yield_target",
          title: "目標利回りに到達",
          body: "テスト通知\nこれは売買を推奨するものではありません。",
          payload: {
            evaluatedYield: 3.7,
            targetYield: 3.5,
            basis: "before_tax_yield",
            operator: "gte",
            stockTicker: "TEST"
          },
          status: "unread",
          channel: "in_app"
        },
        {
          user_id: user.id,
          stock_id: stockId,
          type: "yield_target",
          title: "目標利回りに到達",
          body: "テスト通知",
          payload: {},
          status: "unread",
          channel: "in_app"
        }
      ])
      .select("id");

    expect(error).toBeNull();
    notificationIds.push(...(data ?? []).map((row) => row.id));

    const firstId = notificationIds[0];
    const { error: singleReadError } = await client
      .from("notifications")
      .update({ status: "read", read_at: new Date().toISOString() })
      .eq("id", firstId)
      .eq("user_id", user.id);

    expect(singleReadError).toBeNull();

    const { error: allReadError } = await client
      .from("notifications")
      .update({ status: "read", read_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .eq("status", "unread");

    expect(allReadError).toBeNull();

    const { data: notifications } = await client
      .from("notifications")
      .select("status")
      .eq("user_id", user.id)
      .eq("channel", "in_app");

    expect(notifications?.every((item) => item.status === "read")).toBe(true);
  });

  it("updates settings and reloads persisted preferences", async () => {
    const { error } = await client
      .from("user_settings")
      .update({
        email_notification_enabled: false,
        in_app_notification_enabled: true,
        default_amount_basis: "before_tax",
        monthly_dividend_goal_amount: 50000
      })
      .eq("user_id", user.id);

    expect(error).toBeNull();

    const { data: settings } = await client
      .from("user_settings")
      .select(
        "email_notification_enabled, in_app_notification_enabled, default_amount_basis, monthly_dividend_goal_amount, currency"
      )
      .eq("user_id", user.id)
      .single();

    expect(settings).toMatchObject({
      email_notification_enabled: false,
      in_app_notification_enabled: true,
      default_amount_basis: "before_tax",
      currency: "JPY"
    });
    expect(Number(settings?.monthly_dividend_goal_amount)).toBe(50000);
  });
});
