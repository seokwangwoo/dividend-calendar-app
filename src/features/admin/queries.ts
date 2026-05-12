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
  expected_payment_year: number | null;
  expected_payment_month: number | null;
  fiscal_month: number | null;
  event_type: string;
  dividend_per_share: number | null;
  previous_dividend_per_share: number | null;
  status: string;
  change_type: string | null;
  source_type: string | null;
  source_url: string | null;
  review_status: Database["public"]["Enums"]["review_status"];
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
  expectedPaymentYear?: number;
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
      expected_payment_year,
      expected_payment_month,
      fiscal_month,
      event_type,
      dividend_per_share,
      previous_dividend_per_share,
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

  if (filters.expectedPaymentYear) {
    query = query.eq("expected_payment_year", filters.expectedPaymentYear);
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
      expected_payment_year,
      expected_payment_month,
      fiscal_month,
      event_type,
      dividend_per_share,
      previous_dividend_per_share,
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
  const PAGE_SIZE = 1000;
  const results: StockOption[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("stocks")
      .select("id, ticker, name")
      .order("ticker", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw new Error(error.message);

    results.push(...((data ?? []) as StockOption[]));

    if (!data || data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return results;
}
