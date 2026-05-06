import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/supabase";
import type { StockRow } from "@/features/stocks/queries";

export type HoldingRow = Database["public"]["Tables"]["holdings"]["Row"];

export interface HoldingWithStock extends HoldingRow {
  stock: StockRow & {
    dividend_events?: Array<{
      payment_year: number | null;
      dividend_per_share: number | null;
      review_status: "pending" | "approved" | "rejected";
    }>;
  };
}

export interface PortfolioSummary {
  holdingCount: number;
  annualBeforeTaxAmount: number | null;
  annualEstimatedTaxAmount: number | null;
  annualAfterTaxAmount: number | null;
  averageAfterTaxYield: number | null;
  currency: string;
}

export async function getHoldings(
  accountType?: string
): Promise<HoldingWithStock[]> {
  const supabase = await createClient();

  let query = supabase
    .from("holdings")
    .select(
      "*, stock:stocks(*, dividend_events(payment_year, dividend_per_share, review_status))"
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (accountType && accountType !== "all") {
    query = query.eq("account_type", accountType);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as unknown as HoldingWithStock[];
}

export async function getHoldingById(
  holdingId: string
): Promise<HoldingWithStock | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("holdings")
    .select(
      "*, stock:stocks(*, dividend_events(payment_year, dividend_per_share, review_status))"
    )
    .eq("id", holdingId)
    .is("deleted_at", null)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return null;
    }
    throw new Error(error.message);
  }

  return data as unknown as HoldingWithStock;
}

export async function getPortfolioSummary(
  accountType?: string,
  year = new Date().getFullYear()
): Promise<PortfolioSummary> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_portfolio_summary", {
    p_account_type:
      accountType && accountType !== "all" ? accountType : null,
    p_year: year
  });

  if (error) {
    throw new Error(error.message);
  }

  const row = data?.[0];

  return {
    holdingCount: Number(row?.holding_count ?? 0),
    annualBeforeTaxAmount: row?.annual_before_tax_amount ?? null,
    annualEstimatedTaxAmount: row?.annual_estimated_tax_amount ?? null,
    annualAfterTaxAmount: row?.annual_after_tax_amount ?? null,
    averageAfterTaxYield: row?.average_after_tax_yield ?? null,
    currency: row?.currency ?? "JPY"
  };
}
