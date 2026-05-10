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
