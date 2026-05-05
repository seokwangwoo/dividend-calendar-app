import { createClient } from "@/lib/supabase/server";
import type {
  HomeSummary,
  CalendarMonth,
  MonthDetail,
  StockDetail
} from "@/features/dividends/types";

export async function getHomeSummary(year: number): Promise<HomeSummary | null> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_home_summary", {
    p_year: year
  });

  if (error) {
    throw new Error(error.message);
  }

  if (data == null) {
    return null;
  }

  return data as unknown as HomeSummary;
}

export async function getDividendCalendar(
  year: number,
  basis: string,
  accountType: string
): Promise<CalendarMonth[]> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_dividend_calendar", {
    p_year: year,
    p_basis: basis,
    p_account_type: accountType
  });

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    return [];
  }

  return data.map((row: { month: number; amount: number | null; event_count: number }) => ({
    month: row.month,
    amount: row.amount ?? null,
    eventCount: Number(row.event_count)
  }));
}

export async function getDividendMonthDetail(
  year: number,
  month: number,
  basis: string,
  accountType: string
): Promise<MonthDetail | null> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_dividend_month_detail", {
    p_year: year,
    p_month: month,
    p_basis: basis,
    p_account_type: accountType
  });

  if (error) {
    throw new Error(error.message);
  }

  if (data == null) {
    return null;
  }

  return data as unknown as MonthDetail;
}

export async function getStockDetail(stockId: string): Promise<StockDetail | null> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_stock_detail", {
    p_stock_id: stockId
  });

  if (error) {
    throw new Error(error.message);
  }

  if (data == null) {
    return null;
  }

  return data as unknown as StockDetail;
}
