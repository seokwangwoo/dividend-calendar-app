/**
 * Phase 08: Existing-event comparison for AI dividend review candidates.
 *
 * Compares AI-extracted dividend candidates against existing approved
 * dividend_events for the same stock/fiscal year/event type.
 * Results are provided as admin triage metadata (warnings + priority hints).
 * Auto-approval and auto-rejection are explicitly excluded.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ExistingApprovedEvent = {
  stock_id: string;
  fiscal_year: number | null;
  event_type: string;
  dividend_per_share: number | null;
};

export type CandidateEvent = {
  stock_id: string | null;
  fiscal_year: number | null;
  event_type: string | null;
  extracted_dividend_per_share: number | null;
};

export type ComparisonResult = {
  matched: boolean;
  existingAmount: number | null;
  candidateAmount: number | null;
  /** Absolute difference in JPY per share, or null when either amount is missing */
  difference: number | null;
  /** Percentage difference relative to the existing amount, or null when existing is 0 or missing */
  differencePercent: number | null;
  /** True when the difference exceeds the documented threshold */
  largeDiscrepancy: boolean;
  warnings: string[];
};

export type AnnualTotalValidation = {
  /** Sum of the interim + year_end candidates (payable events) */
  candidatePayableSum: number | null;
  /** The annual_total candidate value */
  annualTotalCandidate: number | null;
  /** Absolute difference between candidatePayableSum and annualTotalCandidate */
  difference: number | null;
  /** True when both are present and difference exceeds the threshold */
  inconsistent: boolean;
  warnings: string[];
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Differences above this JPY-per-share threshold are flagged as large
 * discrepancies requiring heightened admin attention.
 * Based on typical Japanese dividend revision ranges: revisions of > 5 JPY/share
 * are notable; > 20 JPY/share are almost always material changes requiring scrutiny.
 */
export const LARGE_DISCREPANCY_THRESHOLD_JPY = 20;

/** Percentage threshold: flag when difference exceeds 30% of the existing value */
export const LARGE_DISCREPANCY_THRESHOLD_PCT = 30;

// ---------------------------------------------------------------------------
// Per-event comparison
// ---------------------------------------------------------------------------

/**
 * Compares a single AI candidate event against existing approved events
 * for the same stock, fiscal year, and event type.
 *
 * Returns admin-triage metadata. Does NOT auto-approve or auto-reject.
 */
export function compareWithExistingEvents(
  candidate: CandidateEvent,
  existingEvents: ExistingApprovedEvent[]
): ComparisonResult {
  const warnings: string[] = [];

  // Cannot compare without stock_id, fiscal_year, or event_type
  if (!candidate.stock_id || !candidate.fiscal_year || !candidate.event_type) {
    return {
      matched: false,
      existingAmount: null,
      candidateAmount: candidate.extracted_dividend_per_share,
      difference: null,
      differencePercent: null,
      largeDiscrepancy: false,
      warnings
    };
  }

  // Skip annual_total — validated separately via validateAnnualTotalConsistency
  if (candidate.event_type === "annual_total") {
    return {
      matched: false,
      existingAmount: null,
      candidateAmount: candidate.extracted_dividend_per_share,
      difference: null,
      differencePercent: null,
      largeDiscrepancy: false,
      warnings: ["annual_total_comparison_skipped:use_annual_total_validation_instead"]
    };
  }

  const match = existingEvents.find(
    (e) =>
      e.stock_id === candidate.stock_id &&
      e.fiscal_year === candidate.fiscal_year &&
      e.event_type === candidate.event_type
  );

  if (!match) {
    return {
      matched: false,
      existingAmount: null,
      candidateAmount: candidate.extracted_dividend_per_share,
      difference: null,
      differencePercent: null,
      largeDiscrepancy: false,
      warnings
    };
  }

  const existingAmount = match.dividend_per_share;
  const candidateAmount = candidate.extracted_dividend_per_share;

  if (existingAmount === null || candidateAmount === null) {
    return {
      matched: true,
      existingAmount,
      candidateAmount,
      difference: null,
      differencePercent: null,
      largeDiscrepancy: false,
      warnings: ["comparison_skipped:one_or_both_amounts_null"]
    };
  }

  const difference = Math.abs(candidateAmount - existingAmount);
  const differencePercent =
    existingAmount !== 0
      ? Math.round((difference / Math.abs(existingAmount)) * 100)
      : null;

  const largeDiscrepancy =
    difference > LARGE_DISCREPANCY_THRESHOLD_JPY ||
    (differencePercent !== null && differencePercent > LARGE_DISCREPANCY_THRESHOLD_PCT);

  if (largeDiscrepancy) {
    warnings.push(
      `large_discrepancy_vs_approved_event:existing=${existingAmount}_candidate=${candidateAmount}_diff=${difference}`
    );
  }

  return {
    matched: true,
    existingAmount,
    candidateAmount,
    difference,
    differencePercent,
    largeDiscrepancy,
    warnings
  };
}

// ---------------------------------------------------------------------------
// Annual-total consistency check
// ---------------------------------------------------------------------------

/**
 * When both payable (interim + year_end) candidates and an annual_total candidate
 * are present for the same stock/fiscal year, validates that the sum of payable
 * events is consistent with the annual_total.
 *
 * Returns admin-triage metadata. Does NOT auto-approve or auto-reject.
 */
export function validateAnnualTotalConsistency(
  candidates: CandidateEvent[]
): AnnualTotalValidation {
  const warnings: string[] = [];

  const annualTotalCandidate = candidates.find(
    (c) => c.event_type === "annual_total"
  );
  const payableCandidates = candidates.filter(
    (c) => c.event_type === "interim" || c.event_type === "year_end"
  );

  if (!annualTotalCandidate || payableCandidates.length === 0) {
    return {
      candidatePayableSum: null,
      annualTotalCandidate: null,
      difference: null,
      inconsistent: false,
      warnings
    };
  }

  const annualAmount = annualTotalCandidate.extracted_dividend_per_share;

  // Check if all payable candidates have amounts
  const allHaveAmounts = payableCandidates.every(
    (c) => c.extracted_dividend_per_share !== null
  );

  if (!allHaveAmounts || annualAmount === null) {
    return {
      candidatePayableSum: null,
      annualTotalCandidate: annualAmount,
      difference: null,
      inconsistent: false,
      warnings: ["annual_total_check_skipped:some_amounts_null"]
    };
  }

  const payableSum = payableCandidates.reduce(
    (sum, c) => sum + (c.extracted_dividend_per_share ?? 0),
    0
  );

  const difference = Math.abs(payableSum - annualAmount);
  const inconsistent = difference > LARGE_DISCREPANCY_THRESHOLD_JPY;

  if (inconsistent) {
    warnings.push(
      `annual_total_inconsistent:payable_sum=${payableSum}_annual_total=${annualAmount}_diff=${difference}`
    );
  }

  return {
    candidatePayableSum: payableSum,
    annualTotalCandidate: annualAmount,
    difference,
    inconsistent,
    warnings
  };
}
