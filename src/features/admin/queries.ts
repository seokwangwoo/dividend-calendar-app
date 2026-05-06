import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/supabase";

export type StockOption = Pick<
  Database["public"]["Tables"]["stocks"]["Row"],
  "id" | "ticker" | "name"
>;

export type DividendEventWithStock = {
  id: string;
  stock_id: string;
  fiscal_year: number;
  payment_year: number | null;
  event_type: string;
  dividend_per_share: number | null;
  previous_dividend_per_share: number | null;
  expected_payment_month: number | null;
  expected_payment_date: string | null;
  status: string;
  change_type: string | null;
  source_type: string | null;
  source_url: string | null;
  review_status: "pending" | "approved" | "rejected";
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
  stocks: {
    id: string;
    ticker: string;
    name: string;
  } | null;
};

export type DividendEventFilters = {
  reviewStatus?: string;
  ticker?: string;
  paymentYear?: number;
  status?: string;
};

export async function listDividendEvents(
  filters: DividendEventFilters = {}
): Promise<DividendEventWithStock[]> {
  const supabase = await createClient();

  let query = supabase
    .from("dividend_events")
    .select(
      `
      id,
      stock_id,
      fiscal_year,
      payment_year,
      event_type,
      dividend_per_share,
      previous_dividend_per_share,
      expected_payment_month,
      expected_payment_date,
      status,
      change_type,
      source_type,
      source_url,
      review_status,
      rejection_reason,
      created_at,
      updated_at,
      stocks (
        id,
        ticker,
        name
      )
    `
    )
    .order("created_at", { ascending: false });

  if (filters.reviewStatus) {
    query = query.eq("review_status", filters.reviewStatus);
  }

  if (filters.paymentYear) {
    query = query.eq("payment_year", filters.paymentYear);
  }

  if (filters.status) {
    query = query.eq("status", filters.status);
  }

  const { data, error } = await query;

  if (error) throw new Error(error.message);

  let results = (data ?? []) as unknown as DividendEventWithStock[];

  if (filters.ticker) {
    const t = filters.ticker.toLowerCase();
    results = results.filter((e) => e.stocks?.ticker.toLowerCase().includes(t));
  }

  return results;
}

export async function getDividendEventById(
  id: string
): Promise<DividendEventWithStock | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("dividend_events")
    .select(
      `
      id,
      stock_id,
      fiscal_year,
      payment_year,
      event_type,
      dividend_per_share,
      previous_dividend_per_share,
      expected_payment_month,
      expected_payment_date,
      status,
      change_type,
      source_type,
      source_url,
      review_status,
      rejection_reason,
      created_at,
      updated_at,
      stocks (
        id,
        ticker,
        name
      )
    `
    )
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);

  return (data as DividendEventWithStock | null) ?? null;
}

export async function listAllStocks(): Promise<StockOption[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("stocks")
    .select("id, ticker, name")
    .order("ticker", { ascending: true });

  if (error) throw new Error(error.message);

  return data ?? [];
}
