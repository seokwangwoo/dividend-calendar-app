/**
 * Phase 08: Admin-visible parser diagnostics.
 *
 * Lightweight queries based on existing tables (disclosures + dividend_reviews).
 * Surfaced on the admin disclosures page to help identify repeated failure modes.
 *
 * No new tables or migrations are required.
 */

import { createClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ParserDiagnosticSummary = {
  /** Disclosures with parse_status = 'failed', ordered by most recent */
  parseErrorCount: number;
  /** Reviews with confidence_score below the low-confidence threshold */
  lowConfidenceReviewCount: number;
  /** Disclosures with parse_status = 'parsed' but no associated reviews (AI found nothing) */
  noDividendInfoCount: number;
};

/** Threshold below which a review is considered low-confidence */
export const LOW_CONFIDENCE_THRESHOLD = 0.5;

// ---------------------------------------------------------------------------
// Diagnostics query
// ---------------------------------------------------------------------------

/**
 * Returns lightweight counts for repeated failure modes visible to admins.
 * Uses COUNT aggregates to avoid loading large result sets.
 */
export async function getParserDiagnosticSummary(): Promise<ParserDiagnosticSummary> {
  const supabase = await createClient();

  const [parseErrorResult, lowConfidenceResult, noDividendInfoResult] = await Promise.all([
    // Count disclosures that have failed parsing
    supabase
      .from("disclosures")
      .select("id", { count: "exact", head: true })
      .eq("parse_status", "failed"),

    // Count reviews with confidence below threshold (status = pending or needs_manual_check)
    supabase
      .from("dividend_reviews")
      .select("id", { count: "exact", head: true })
      .in("status", ["pending", "needs_manual_check"])
      .lt("confidence_score", LOW_CONFIDENCE_THRESHOLD),

    // Count disclosures marked as parsed but with no dividend reviews created
    // (AI found no relevant information)
    supabase
      .from("disclosures")
      .select("id", { count: "exact", head: true })
      .eq("parse_status", "parsed")
      .not("id", "in", supabase.from("dividend_reviews").select("disclosure_id"))
  ]);

  // Non-throwing: return 0 counts on error so the page still loads
  const parseErrorCount = parseErrorResult.count ?? 0;
  const lowConfidenceReviewCount = lowConfidenceResult.count ?? 0;
  const noDividendInfoCount = noDividendInfoResult.count ?? 0;

  return {
    parseErrorCount,
    lowConfidenceReviewCount,
    noDividendInfoCount
  };
}

// ---------------------------------------------------------------------------
// Phase 06: Operational monitoring
// ---------------------------------------------------------------------------

export type AdminDisclosureSummaryRow = {
  day: string;
  collected_count: number;
  parsed_count: number;
  failed_count: number;
  skipped_count: number;
  total_ai_cost_usd: number;
  total_input_tokens: number;
  total_output_tokens: number;
  pending_reviews: number;
  approved_reviews: number;
  rejected_reviews: number;
};

/**
 * Returns daily disclosure and review summary for the last N days.
 */
export async function getAdminDisclosureSummary(
  days = 7
): Promise<AdminDisclosureSummaryRow[]> {
  const supabase = await createClient();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const { data, error } = await supabase.rpc("get_admin_disclosure_summary", {
    p_start_date: startDate.toISOString().split("T")[0],
    p_end_date: new Date().toISOString().split("T")[0],
  });

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as AdminDisclosureSummaryRow[];
}

export type AdminPriceRefreshSummaryRow = {
  day: string;
  total_attempts: number;
  success_count: number;
  failure_count: number;
  failure_rate: number;
  unique_stocks: number;
  avg_new_price: number | null;
};

/**
 * Returns daily price refresh batch summary for the last N days.
 */
export async function getAdminPriceRefreshSummary(
  days = 7
): Promise<AdminPriceRefreshSummaryRow[]> {
  const supabase = await createClient();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const { data, error } = await supabase.rpc("get_admin_price_refresh_summary", {
    p_start_date: startDate.toISOString().split("T")[0],
    p_end_date: new Date().toISOString().split("T")[0],
  });

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as AdminPriceRefreshSummaryRow[];
}

export type AdminJobQueueDepthRow = {
  job_type: string;
  status: string;
  count: number;
  oldest_pending: string | null;
  newest_pending: string | null;
};

/**
 * Returns current job queue depth snapshot by type and status.
 */
export async function getAdminJobQueueDepth(): Promise<AdminJobQueueDepthRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_admin_job_queue_depth");

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as AdminJobQueueDepthRow[];
}

export type ReviewBacklog = {
  pending: number;
  needs_manual_check: number;
  total: number;
};

/**
 * Returns the current review backlog snapshot (pending + needs_manual_check).
 */
export async function getAdminReviewBacklog(): Promise<ReviewBacklog> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("dividend_reviews")
    .select("id", { count: "exact", head: true })
    .in("status", ["pending", "needs_manual_check"]);

  if (error) throw new Error(error.message);

  // Query separately for each status because count() with in() returns total only
  const [pendingResult, needsManualResult] = await Promise.all([
    supabase
      .from("dividend_reviews")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    supabase
      .from("dividend_reviews")
      .select("id", { count: "exact", head: true })
      .eq("status", "needs_manual_check"),
  ]);

  return {
    pending: pendingResult.count ?? 0,
    needs_manual_check: needsManualResult.count ?? 0,
    total: (pendingResult.count ?? 0) + (needsManualResult.count ?? 0),
  };
}
