import { createAdminClient } from "../helpers/supabase";
import type { Database } from "@/types/supabase";

type DividendEventType = Database["public"]["Enums"]["dividend_event_type"];
type DividendEventStatus =
  Database["public"]["Tables"]["dividend_events"]["Insert"]["status"];
type DividendChangeType = Database["public"]["Enums"]["dividend_change_type"];
type ReviewStatus = Database["public"]["Enums"]["review_status"];

export interface CreateDividendEventParams {
  stockId: string;
  fiscalYear: number;
  paymentYear?: number;
  eventType?: DividendEventType;
  dividendPerShare?: number | null;
  expectedPaymentMonth?: number | null;
  expectedPaymentDate?: string | null;
  recordDate?: string | null;
  exDividendDate?: string | null;
  status?: DividendEventStatus;
  changeType?: DividendChangeType | null;
  reviewStatus?: ReviewStatus;
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
      record_date: params.recordDate ?? null,
      ex_dividend_date: params.exDividendDate ?? null,
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
