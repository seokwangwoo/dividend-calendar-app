import { createAdminClient } from "../helpers/supabase";

export interface CreateDividendEventParams {
  stockId: string;
  fiscalYear: number;
  paymentYear?: number;
  eventType?: string;
  dividendPerShare?: number | null;
  expectedPaymentMonth?: number | null;
  expectedPaymentDate?: string | null;
  status?: string;
  changeType?: string | null;
  reviewStatus?: "pending" | "approved" | "rejected";
  sourceType?: string | null;
  sourceUrl?: string | null;
  sourcePublishedAt?: string | null;
}

export async function createTestDividendEvent(
  params: CreateDividendEventParams
): Promise<string> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("dividend_events")
    .insert({
      stock_id: params.stockId,
      fiscal_year: params.fiscalYear,
      payment_year: params.paymentYear ?? params.fiscalYear,
      event_type: params.eventType ?? "year_end",
      dividend_per_share: params.dividendPerShare ?? 100,
      expected_payment_month: params.expectedPaymentMonth ?? null,
      expected_payment_date: params.expectedPaymentDate ?? null,
      status: params.status ?? "estimated",
      change_type: params.changeType ?? null,
      review_status: params.reviewStatus ?? "pending",
      source_type: params.sourceType ?? null,
      source_url: params.sourceUrl ?? null,
      source_published_at: params.sourcePublishedAt ?? null,
    })
    .select("id")
    .single();
  if (error) throw new Error(`createTestDividendEvent: ${error.message}`);
  return data.id;
}

export async function deleteTestDividendEvents(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const admin = createAdminClient();
  await admin.from("dividend_events").delete().in("id", ids);
}

export function isoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
