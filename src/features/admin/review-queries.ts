import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/supabase";

export type DividendReviewWithRelations = {
  id: string;
  stock_id: string | null;
  disclosure_id: string | null;
  extracted_dividend_per_share: number | null;
  previous_dividend_per_share: number | null;
  extracted_payment_date: string | null;
  extracted_payment_month: number | null;
  confidence_score: number | null;
  fiscal_year: number | null;
  event_type: Database["public"]["Enums"]["dividend_event_type"] | null;
  extracted_record_date: string | null;
  extracted_ex_dividend_date: string | null;
  change_type: Database["public"]["Enums"]["dividend_change_type"] | null;
  evidence_text: string | null;
  warning_message: string | null;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  created_dividend_event_id: string | null;
  raw_payload: Database["public"]["Tables"]["dividend_reviews"]["Row"]["raw_payload"];
  created_at: string;
  updated_at: string;
  stocks: {
    id: string;
    ticker: string;
    name: string;
  } | null;
  disclosures: {
    id: string;
    title: string;
    disclosure_type: Database["public"]["Enums"]["disclosure_type"];
    review_priority: Database["public"]["Enums"]["disclosure_review_priority"];
    document_url: string | null;
    storage_path: string | null;
    published_at: string | null;
    parse_status: Database["public"]["Enums"]["disclosure_parse_status"];
    last_parse_error: string | null;
    source_type: string;
  } | null;
};

export type DividendReviewFilters = {
  status?: string;
  priority?: string;
  disclosureType?: string;
  ticker?: string;
  tickerFrom?: string;
  tickerTo?: string;
  changeType?: string;
  dateFrom?: string;
  dateTo?: string;
};

const REVIEW_SELECT = `
  id,
  stock_id,
  disclosure_id,
  extracted_dividend_per_share,
  previous_dividend_per_share,
  extracted_payment_date,
  extracted_payment_month,
  confidence_score,
  fiscal_year,
  event_type,
  extracted_record_date,
  extracted_ex_dividend_date,
  change_type,
  evidence_text,
  warning_message,
  status,
  reviewed_by,
  reviewed_at,
  rejection_reason,
  created_dividend_event_id,
  raw_payload,
  created_at,
  updated_at,
  stocks (
    id,
    ticker,
    name
  ),
  disclosures (
    id,
    title,
    disclosure_type,
    review_priority,
    document_url,
    storage_path,
    published_at,
    parse_status,
    last_parse_error,
    source_type
  )
`;

const PRIORITY_ORDER: Record<string, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3
};

export async function listDividendReviews(
  filters: DividendReviewFilters = {}
): Promise<DividendReviewWithRelations[]> {
  const supabase = await createClient();

  // Default to showing only actionable reviews
  const statusFilter = filters.status ?? "pending,needs_manual_check";

  let query = supabase
    .from("dividend_reviews")
    .select(REVIEW_SELECT)
    .order("created_at", { ascending: false });

  // Status filter: support comma-separated values for default two-status view
  if (statusFilter.includes(",")) {
    const statuses = statusFilter.split(",").map((s) => s.trim());
    query = query.in("status", statuses);
  } else if (statusFilter) {
    query = query.eq("status", statusFilter);
  }

  if (filters.changeType) {
    query = query.eq("change_type", filters.changeType);
  }

  if (filters.dateFrom) {
    query = query.gte("created_at", filters.dateFrom);
  }

  if (filters.dateTo) {
    query = query.lte("created_at", filters.dateTo);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  let results = (data ?? []) as unknown as DividendReviewWithRelations[];

  // Client-side filters requiring joined fields
  if (filters.ticker) {
    const t = filters.ticker.toLowerCase();
    results = results.filter((r) => r.stocks?.ticker.toLowerCase().includes(t));
  }

  if (filters.tickerFrom || filters.tickerTo) {
    results = results.filter((r) => {
      const ticker = r.stocks?.ticker ?? "";
      if (filters.tickerFrom && ticker < filters.tickerFrom) return false;
      if (filters.tickerTo && ticker > filters.tickerTo) return false;
      return true;
    });
  }

  if (filters.disclosureType) {
    results = results.filter(
      (r) => r.disclosures?.disclosure_type === filters.disclosureType
    );
  }

  if (filters.priority) {
    results = results.filter(
      (r) => r.disclosures?.review_priority === filters.priority
    );
  }

  // Sort: urgent/high priority first, then by created_at desc
  results.sort((a, b) => {
    const pA = PRIORITY_ORDER[a.disclosures?.review_priority ?? "normal"] ?? 2;
    const pB = PRIORITY_ORDER[b.disclosures?.review_priority ?? "normal"] ?? 2;
    if (pA !== pB) return pA - pB;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  return results;
}

export async function getDividendReviewById(
  id: string
): Promise<DividendReviewWithRelations | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("dividend_reviews")
    .select(REVIEW_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);

  return (data as DividendReviewWithRelations | null) ?? null;
}
