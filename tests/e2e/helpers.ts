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
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;
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
  currentPrice: number | null;
}> {
  const { data, error } = await createAdminClient()
    .from("stocks")
    .select("id, name, ticker, current_price")
    .eq("ticker", ticker)
    .single();

  if (error || !data) throw new Error(`getStockByTicker(${ticker}): ${error?.message}`);
  return {
    id: data.id as string,
    name: data.name as string,
    ticker: data.ticker as string,
    currentPrice: data.current_price as number | null
  };
}

export async function createApprovedDividendEvent(stockId: string): Promise<string> {
  const now = new Date();
  const { data, error } = await createAdminClient()
    .from("dividend_events")
    .insert({
      stock_id: stockId,
      fiscal_year: now.getFullYear(),
      expected_payment_year: now.getFullYear(),
      fiscal_month: null,
      event_type: "year_end",
      dividend_per_share: 150,
      expected_payment_month: now.getMonth() + 1,
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
    expected_payment_year: year,
    fiscal_month: null,
    event_type: "year_end",
    dividend_per_share: 150,
    expected_payment_month: new Date().getMonth() + 1,
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

export async function createDisclosureWithReview(
  stockId: string,
  opts: {
    disclosureOverrides?: Record<string, unknown>;
    reviewOverrides?: Record<string, unknown>;
  } = {}
): Promise<{ disclosureId: string; reviewId: string }> {
  const admin = createAdminClient();
  const year = new Date().getFullYear();
  const externalId = `e2e-review-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const { data: disc, error: discErr } = await admin
    .from("disclosures")
    .insert({
      stock_id: stockId,
      external_id: externalId,
      source_type: "tdnet",
      title: "配当予想の修正 e2eテスト",
      document_url: `https://example.com/${externalId}`,
      published_at: new Date().toISOString(),
      disclosure_type: "dividend_forecast_revision",
      parse_status: "parsed",
      review_priority: "normal",
      ...(opts.disclosureOverrides ?? {})
    })
    .select("id")
    .single();

  if (discErr || !disc) throw new Error(`createDisclosureWithReview disclosure: ${discErr?.message}`);

  const { data: rev, error: revErr } = await admin
    .from("dividend_reviews")
    .insert({
      stock_id: stockId,
      disclosure_id: disc.id,
      extracted_dividend_per_share: 100,
      previous_dividend_per_share: 80,
      extracted_payment_year: year + 5,
      extracted_payment_month: 9,
      extracted_fiscal_month: 6,
      fiscal_year: year + 5,
      event_type: "year_end",
      change_type: "increase",
      confidence_score: 0.85,
      status: "pending",
      evidence_text: "配当予想修正による増配",
      raw_payload: { eventType: "year_end", fiscalYear: year + 5, eventStatus: "estimated" },
      ...(opts.reviewOverrides ?? {})
    })
    .select("id")
    .single();

  if (revErr || !rev) throw new Error(`createDisclosureWithReview review: ${revErr?.message}`);

  return { disclosureId: disc.id, reviewId: rev.id };
}

export async function cleanupDividendReviews(reviewIds: string[]): Promise<void> {
  if (reviewIds.length === 0) return;
  await createAdminClient().from("dividend_reviews").delete().in("id", reviewIds);
}

export async function cleanupDisclosures(disclosureIds: string[]): Promise<void> {
  if (disclosureIds.length === 0) return;
  await createAdminClient().from("disclosures").delete().in("id", disclosureIds);
}

export async function createDisclosure(opts: {
  stockId?: string;
  externalId?: string;
  sourceType?: string;
  title?: string;
  documentUrl?: string | null;
  publishedAt?: string;
  disclosureType?: string;
  parseStatus?: string;
  reviewPriority?: string;
  storagePath?: string | null;
} = {}) {
  const admin = createAdminClient();
  const externalId = opts.externalId ?? `e2e-disc-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const { data, error } = await admin
    .from("disclosures")
    .insert({
      stock_id: opts.stockId ?? null,
      external_id: externalId,
      source_type: opts.sourceType ?? "tdnet",
      title: opts.title ?? "E2E disclosure",
      document_url: opts.documentUrl ?? `https://example.com/${externalId}`,
      published_at: opts.publishedAt ?? new Date().toISOString(),
      disclosure_type: opts.disclosureType ?? "other",
      parse_status: opts.parseStatus ?? "pending",
      review_priority: opts.reviewPriority ?? "normal",
      storage_path: opts.storagePath ?? null
    })
    .select("id")
    .single();

  if (error || !data) throw new Error(`createDisclosure: ${error?.message}`);
  return data.id as string;
}

export async function createReview(opts: {
  stockId: string;
  disclosureId: string;
  extractedDividendPerShare?: number;
  previousDividendPerShare?: number;
  extractedPaymentYear?: number | null;
  extractedPaymentMonth?: number | null;
  extractedFiscalMonth?: number | null;
  extractedRecordDate?: string | null;
  extractedExDividendDate?: string | null;
  fiscalYear?: number | null;
  eventType?: string;
  changeType?: string;
  confidenceScore?: number;
  status?: string;
  evidenceText?: string;
  warningMessage?: string;
  rawPayload?: Record<string, unknown>;
}) {
  const admin = createAdminClient();
  const year = new Date().getFullYear();
  const { data, error } = await admin
    .from("dividend_reviews")
    .insert({
      stock_id: opts.stockId,
      disclosure_id: opts.disclosureId,
      extracted_dividend_per_share: opts.extractedDividendPerShare === undefined ? 100 : opts.extractedDividendPerShare,
      previous_dividend_per_share: opts.previousDividendPerShare === undefined ? 80 : opts.previousDividendPerShare,
      extracted_payment_year: opts.extractedPaymentYear === undefined ? year + 1 : opts.extractedPaymentYear,
      extracted_payment_month: opts.extractedPaymentMonth === undefined ? 9 : opts.extractedPaymentMonth,
      extracted_fiscal_month: opts.extractedFiscalMonth === undefined ? 6 : opts.extractedFiscalMonth,
      extracted_record_date: opts.extractedRecordDate === undefined ? null : opts.extractedRecordDate,
      extracted_ex_dividend_date: opts.extractedExDividendDate === undefined ? null : opts.extractedExDividendDate,
      fiscal_year: opts.fiscalYear === undefined ? year + 1 : opts.fiscalYear,
      event_type: opts.eventType === undefined ? "year_end" : opts.eventType,
      change_type: opts.changeType === undefined ? "increase" : opts.changeType,
      confidence_score: opts.confidenceScore === undefined ? 0.85 : opts.confidenceScore,
      status: opts.status === undefined ? "pending" : opts.status,
      evidence_text: opts.evidenceText === undefined ? "E2E evidence" : opts.evidenceText,
      warning_message: opts.warningMessage === undefined ? null : opts.warningMessage,
      raw_payload: opts.rawPayload === undefined ? { eventType: opts.eventType === undefined ? "year_end" : opts.eventType, fiscalYear: opts.fiscalYear === undefined ? year + 1 : opts.fiscalYear } : opts.rawPayload
    })
    .select("id")
    .single();

  if (error || !data) throw new Error(`createReview: ${error?.message}`);
  return data.id as string;
}

export async function approveReviewViaApi(
  reviewId: string,
  adminUserId: string,
  overrides?: Record<string, unknown>
): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.rpc("approve_dividend_review_for_reviewer", {
    p_review_id: reviewId,
    p_reviewer_id: adminUserId,
    p_override: overrides ?? {}
  });
  if (error) throw new Error(`approveReviewViaApi: ${error.message}`);
}

export async function rejectReviewViaApi(
  reviewId: string,
  adminUserId: string,
  reason: string
): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.rpc("reject_dividend_review_for_reviewer", {
    p_review_id: reviewId,
    p_reason: reason,
    p_reviewer_id: adminUserId
  });
  if (error) throw new Error(`rejectReviewViaApi: ${error.message}`);
}

export async function getNotificationsForUser(userId: string): Promise<
  Array<{
    id: string;
    type: string;
    title: string;
    body: string;
    status: string;
    payload: Record<string, unknown> | null;
  }>
> {
  const { data, error } = await createAdminClient()
    .from("notifications")
    .select("id, type, title, body, status, payload")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`getNotificationsForUser: ${error.message}`);
  return (data ?? []) as Array<{
    id: string;
    type: string;
    title: string;
    body: string;
    status: string;
    payload: Record<string, unknown> | null;
  }>;
}

export async function cleanupNotificationsForUser(userId: string): Promise<void> {
  await createAdminClient().from("notifications").delete().eq("user_id", userId);
}

export async function cleanupJobs(jobIds: string[]): Promise<void> {
  if (jobIds.length === 0) return;
  await createAdminClient().from("jobs").delete().in("id", jobIds);
}
