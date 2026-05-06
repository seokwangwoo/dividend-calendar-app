import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

type TestUser = {
  id: string;
  email: string;
  password: string;
};

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required env var: ${key}`);
  return value;
}

export function createAdminClient(): SupabaseClient {
  return createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}@test.example.com`;
}

export async function createConfirmedUser(prefix: string): Promise<TestUser> {
  const admin = createAdminClient();
  const password = "Test1234!";
  const email = uniqueEmail(prefix);
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true
  });

  if (error || !data.user) {
    throw new Error(`createConfirmedUser(${email}): ${error?.message}`);
  }

  return { id: data.user.id, email, password };
}

export async function makeAdmin(userId: string): Promise<void> {
  const { error } = await createAdminClient()
    .from("profiles")
    .update({ role: "admin" })
    .eq("id", userId);

  if (error) throw new Error(`makeAdmin(${userId}): ${error.message}`);
}

export async function cleanupUser(userId: string): Promise<void> {
  const admin = createAdminClient();
  await admin.from("holdings").delete().eq("user_id", userId);
  await admin.from("notification_rules").delete().eq("user_id", userId);
  await admin.from("notifications").delete().eq("user_id", userId);
  await admin.auth.admin.deleteUser(userId);
}

export async function cleanupUserByEmail(email: string): Promise<void> {
  const admin = createAdminClient();
  const { data } = await admin.from("profiles").select("id").eq("email", email);

  for (const profile of data ?? []) {
    await cleanupUser(profile.id as string);
  }
}

export async function getStockByTicker(ticker: string): Promise<{
  id: string;
  name: string;
  ticker: string;
}> {
  const { data, error } = await createAdminClient()
    .from("stocks")
    .select("id, name, ticker")
    .eq("ticker", ticker)
    .single();

  if (error || !data) throw new Error(`getStockByTicker(${ticker}): ${error?.message}`);
  return data as { id: string; name: string; ticker: string };
}

export async function createApprovedDividendEvent(stockId: string): Promise<string> {
  const { data, error } = await createAdminClient()
    .from("dividend_events")
    .insert({
      stock_id: stockId,
      fiscal_year: new Date().getFullYear(),
      payment_year: new Date().getFullYear(),
      event_type: "year_end",
      dividend_per_share: 150,
      expected_payment_month: new Date().getMonth() + 1,
      expected_payment_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10),
      status: "confirmed",
      review_status: "approved",
      source_type: "e2e",
      source_url: "https://example.com/e2e-disclosure",
      source_published_at: new Date().toISOString()
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`createApprovedDividendEvent: ${error?.message}`);
  }

  return data.id as string;
}

export async function deleteDividendEvents(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await createAdminClient().from("dividend_events").delete().in("id", ids);
}

export async function createHolding(
  userId: string,
  stockId: string,
  quantity: number,
  averagePurchasePrice: number,
  accountType: "nisa" | "tokutei" | "general"
): Promise<string> {
  const { data, error } = await createAdminClient()
    .from("holdings")
    .insert({
      user_id: userId,
      stock_id: stockId,
      quantity,
      average_purchase_price: averagePurchasePrice,
      account_type: accountType
    })
    .select("id")
    .single();

  if (error || !data) throw new Error(`createHolding: ${error?.message}`);
  return data.id as string;
}

export async function createInAppNotification(
  userId: string,
  stockId: string | null,
  opts: {
    title: string;
    body: string;
    type:
      | "yield_target"
      | "dividend_increase"
      | "dividend_decrease"
      | "no_dividend"
      | "special_dividend"
      | "data_update";
  }
): Promise<string> {
  const { data, error } = await createAdminClient()
    .from("notifications")
    .insert({
      user_id: userId,
      stock_id: stockId,
      type: opts.type,
      title: opts.title,
      body: opts.body,
      channel: "in_app",
      status: "unread"
    })
    .select("id")
    .single();

  if (error || !data) throw new Error(`createInAppNotification: ${error?.message}`);
  return data.id as string;
}

export async function createDividendEventViaAdmin(
  stockId: string,
  overrides: Record<string, unknown> = {}
): Promise<string> {
  const year = new Date().getFullYear();
  const defaults = {
    stock_id: stockId,
    fiscal_year: year,
    payment_year: year,
    event_type: "year_end",
    dividend_per_share: 150,
    expected_payment_month: new Date().getMonth() + 1,
    expected_payment_date: null,
    record_date: null,
    ex_dividend_date: null,
    status: "estimated",
    review_status: "pending",
    source_type: "e2e",
    source_url: null,
    source_published_at: new Date().toISOString()
  };
  const { data, error } = await createAdminClient()
    .from("dividend_events")
    .insert({ ...defaults, ...overrides })
    .select("id")
    .single();

  if (error || !data) throw new Error(`createDividendEventViaAdmin: ${error?.message}`);
  return data.id as string;
}

export async function approveDividendEventViaAdmin(eventId: string): Promise<void> {
  const { error } = await createAdminClient()
    .from("dividend_events")
    .update({ review_status: "approved" })
    .eq("id", eventId);

  if (error) throw new Error(`approveDividendEventViaAdmin: ${error.message}`);
}

export async function createHoldingWithGoal(
  userId: string,
  stockId: string,
  quantity: number,
  averagePurchasePrice: number,
  accountType: "nisa" | "tokutei" | "general",
  annualGoal: number | null
): Promise<string> {
  const holdingId = await createHolding(userId, stockId, quantity, averagePurchasePrice, accountType);
  if (annualGoal != null) {
    await setUserSetting(userId, "annual_dividend_goal_amount", annualGoal);
  }
  return holdingId;
}

export async function setUserSetting(
  userId: string,
  key: string,
  value: unknown
): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("user_settings")
    .upsert({ user_id: userId, [key]: value }, { onConflict: "user_id" });

  if (error) throw new Error(`setUserSetting(${key}): ${error.message}`);
}

export async function getNotificationCount(userId: string): Promise<number> {
  const { count, error } = await createAdminClient()
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "unread");

  if (error) throw new Error(`getNotificationCount: ${error.message}`);
  return count ?? 0;
}
