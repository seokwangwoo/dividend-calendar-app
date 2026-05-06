import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/supabase";

export type StockRow = Database["public"]["Tables"]["stocks"]["Row"];

export async function searchStocks(query: string): Promise<StockRow[]> {
  const supabase = await createClient();
  const trimmed = query.trim();

  if (!trimmed) {
    return [];
  }

  const { data, error } = await supabase
    .from("stocks")
    .select("*")
    .or(`ticker.ilike.%${trimmed}%,name.ilike.%${trimmed}%,name_en.ilike.%${trimmed}%`)
    .order("support_status", { ascending: true }) // supported first
    .order("ticker", { ascending: true })
    .limit(20);

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

export async function getStockById(stockId: string): Promise<StockRow | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("stocks")
    .select("*")
    .eq("id", stockId)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return null;
    }
    throw new Error(error.message);
  }

  return data;
}

export interface StockWithConsecutiveFailures {
  stock_id: string;
  ticker: string | null;
  name: string | null;
  failure_count: number;
}

export async function getStocksWithConsecutivePriceRefreshFailures(): Promise<
  StockWithConsecutiveFailures[]
> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_stocks_with_consecutive_price_refresh_failures");

  if (error) {
    throw new Error(error.message);
  }

  return (data as StockWithConsecutiveFailures[]) ?? [];
}
