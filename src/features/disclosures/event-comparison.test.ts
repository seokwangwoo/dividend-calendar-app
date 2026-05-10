/**
 * Phase 08: Tests for existing-event comparison module.
 *
 * Tests:
 * - Per-event comparison against existing approved events
 * - Large discrepancy detection (JPY threshold and percentage threshold)
 * - Annual-total consistency validation
 * - Edge cases: null amounts, missing fields, annual_total skip
 */

import { describe, expect, it } from "vitest";
import {
  compareWithExistingEvents,
  validateAnnualTotalConsistency,
  LARGE_DISCREPANCY_THRESHOLD_JPY,
  LARGE_DISCREPANCY_THRESHOLD_PCT,
  type CandidateEvent,
  type ExistingApprovedEvent
} from "./event-comparison";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCandidate(overrides: Partial<CandidateEvent> = {}): CandidateEvent {
  return {
    stock_id: "stock-1",
    fiscal_year: 2026,
    event_type: "year_end",
    extracted_dividend_per_share: 120,
    ...overrides
  };
}

function makeExistingEvent(overrides: Partial<ExistingApprovedEvent> = {}): ExistingApprovedEvent {
  return {
    stock_id: "stock-1",
    fiscal_year: 2026,
    event_type: "year_end",
    dividend_per_share: 100,
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// compareWithExistingEvents
// ---------------------------------------------------------------------------

describe("compareWithExistingEvents", () => {
  it("returns matched=false and no warnings when no existing events found", () => {
    const candidate = makeCandidate({ extracted_dividend_per_share: 120 });
    const result = compareWithExistingEvents(candidate, []);
    expect(result.matched).toBe(false);
    expect(result.existingAmount).toBeNull();
    expect(result.largeDiscrepancy).toBe(false);
    expect(result.warnings).toHaveLength(0);
  });

  it("returns matched=true with no discrepancy when amounts are identical", () => {
    const candidate = makeCandidate({ extracted_dividend_per_share: 100 });
    const existing = [makeExistingEvent({ dividend_per_share: 100 })];
    const result = compareWithExistingEvents(candidate, existing);
    expect(result.matched).toBe(true);
    expect(result.difference).toBe(0);
    expect(result.largeDiscrepancy).toBe(false);
    expect(result.warnings).toHaveLength(0);
  });

  it("detects large discrepancy when difference exceeds JPY threshold", () => {
    const candidate = makeCandidate({
      extracted_dividend_per_share: 100 + LARGE_DISCREPANCY_THRESHOLD_JPY + 1
    });
    const existing = [makeExistingEvent({ dividend_per_share: 100 })];
    const result = compareWithExistingEvents(candidate, existing);
    expect(result.matched).toBe(true);
    expect(result.largeDiscrepancy).toBe(true);
    expect(result.warnings.some((w) => w.includes("large_discrepancy_vs_approved_event"))).toBe(true);
  });

  it("does not flag as large discrepancy when difference is at or below JPY threshold", () => {
    const candidate = makeCandidate({
      extracted_dividend_per_share: 100 + LARGE_DISCREPANCY_THRESHOLD_JPY
    });
    const existing = [makeExistingEvent({ dividend_per_share: 100 })];
    const result = compareWithExistingEvents(candidate, existing);
    expect(result.largeDiscrepancy).toBe(false);
  });

  it("detects large discrepancy when percentage difference exceeds threshold", () => {
    // existing=10, candidate=10*(1 + PCT/100 + 0.01) to exceed percentage threshold
    const existingAmount = 10;
    const candidateAmount = Math.ceil(existingAmount * (1 + LARGE_DISCREPANCY_THRESHOLD_PCT / 100 + 0.01));
    const candidate = makeCandidate({ extracted_dividend_per_share: candidateAmount });
    const existing = [makeExistingEvent({ dividend_per_share: existingAmount })];
    const result = compareWithExistingEvents(candidate, existing);
    expect(result.largeDiscrepancy).toBe(true);
    expect(result.warnings.some((w) => w.includes("large_discrepancy"))).toBe(true);
  });

  it("matches only on same stock_id, fiscal_year, and event_type", () => {
    const candidate = makeCandidate({
      stock_id: "stock-1",
      fiscal_year: 2026,
      event_type: "year_end",
      extracted_dividend_per_share: 50
    });
    const existingOtherStock = makeExistingEvent({ stock_id: "stock-2", dividend_per_share: 100 });
    const existingOtherYear = makeExistingEvent({ fiscal_year: 2025, dividend_per_share: 100 });
    const existingOtherType = makeExistingEvent({ event_type: "interim", dividend_per_share: 100 });
    const correct = makeExistingEvent({ dividend_per_share: 60 });

    const result = compareWithExistingEvents(candidate, [
      existingOtherStock,
      existingOtherYear,
      existingOtherType,
      correct
    ]);

    expect(result.matched).toBe(true);
    expect(result.existingAmount).toBe(60);
  });

  it("skips comparison and returns no warnings when candidate has null amount", () => {
    const candidate = makeCandidate({ extracted_dividend_per_share: null });
    const existing = [makeExistingEvent({ dividend_per_share: 100 })];
    const result = compareWithExistingEvents(candidate, existing);
    expect(result.matched).toBe(true);
    expect(result.difference).toBeNull();
    expect(result.largeDiscrepancy).toBe(false);
    expect(result.warnings.some((w) => w.includes("null"))).toBe(true);
  });

  it("skips comparison when existing event has null dividend_per_share", () => {
    const candidate = makeCandidate({ extracted_dividend_per_share: 100 });
    const existing = [makeExistingEvent({ dividend_per_share: null })];
    const result = compareWithExistingEvents(candidate, existing);
    expect(result.matched).toBe(true);
    expect(result.difference).toBeNull();
    expect(result.largeDiscrepancy).toBe(false);
  });

  it("skips comparison when candidate has no stock_id", () => {
    const candidate = makeCandidate({ stock_id: null });
    const result = compareWithExistingEvents(candidate, [makeExistingEvent()]);
    expect(result.matched).toBe(false);
  });

  it("skips comparison when candidate has no fiscal_year", () => {
    const candidate = makeCandidate({ fiscal_year: null });
    const result = compareWithExistingEvents(candidate, [makeExistingEvent()]);
    expect(result.matched).toBe(false);
  });

  it("skips per-event comparison for annual_total (handled separately)", () => {
    const candidate = makeCandidate({
      event_type: "annual_total",
      extracted_dividend_per_share: 200
    });
    const existing = [makeExistingEvent({ event_type: "annual_total", dividend_per_share: 100 })];
    const result = compareWithExistingEvents(candidate, existing);
    expect(result.matched).toBe(false);
    expect(result.warnings.some((w) => w.includes("annual_total_comparison_skipped"))).toBe(true);
  });

  it("includes difference and differencePercent in result", () => {
    const candidate = makeCandidate({ extracted_dividend_per_share: 130 });
    const existing = [makeExistingEvent({ dividend_per_share: 100 })];
    const result = compareWithExistingEvents(candidate, existing);
    expect(result.difference).toBe(30);
    expect(result.differencePercent).toBe(30);
  });

  it("handles differencePercent null when existing amount is 0", () => {
    const candidate = makeCandidate({ extracted_dividend_per_share: 10 });
    const existing = [makeExistingEvent({ dividend_per_share: 0 })];
    const result = compareWithExistingEvents(candidate, existing);
    expect(result.differencePercent).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// validateAnnualTotalConsistency
// ---------------------------------------------------------------------------

describe("validateAnnualTotalConsistency", () => {
  it("returns not inconsistent when no annual_total candidate present", () => {
    const candidates: CandidateEvent[] = [
      makeCandidate({ event_type: "interim", extracted_dividend_per_share: 60 }),
      makeCandidate({ event_type: "year_end", extracted_dividend_per_share: 60 })
    ];
    const result = validateAnnualTotalConsistency(candidates);
    expect(result.inconsistent).toBe(false);
    expect(result.candidatePayableSum).toBeNull();
  });

  it("returns not inconsistent when no payable candidates present", () => {
    const candidates: CandidateEvent[] = [
      makeCandidate({ event_type: "annual_total", extracted_dividend_per_share: 120 })
    ];
    const result = validateAnnualTotalConsistency(candidates);
    expect(result.inconsistent).toBe(false);
  });

  it("returns consistent when payable sum matches annual_total within threshold", () => {
    const candidates: CandidateEvent[] = [
      makeCandidate({ event_type: "interim", extracted_dividend_per_share: 60 }),
      makeCandidate({ event_type: "year_end", extracted_dividend_per_share: 60 }),
      makeCandidate({ event_type: "annual_total", extracted_dividend_per_share: 120 })
    ];
    const result = validateAnnualTotalConsistency(candidates);
    expect(result.inconsistent).toBe(false);
    expect(result.candidatePayableSum).toBe(120);
    expect(result.annualTotalCandidate).toBe(120);
    expect(result.difference).toBe(0);
    expect(result.warnings).toHaveLength(0);
  });

  it("flags inconsistency when payable sum differs from annual_total by more than threshold", () => {
    const candidates: CandidateEvent[] = [
      makeCandidate({ event_type: "interim", extracted_dividend_per_share: 60 }),
      makeCandidate({ event_type: "year_end", extracted_dividend_per_share: 60 }),
      makeCandidate({
        event_type: "annual_total",
        extracted_dividend_per_share: 60 + 60 + LARGE_DISCREPANCY_THRESHOLD_JPY + 1
      })
    ];
    const result = validateAnnualTotalConsistency(candidates);
    expect(result.inconsistent).toBe(true);
    expect(result.warnings.some((w) => w.includes("annual_total_inconsistent"))).toBe(true);
  });

  it("skips check when any payable candidate has null amount", () => {
    const candidates: CandidateEvent[] = [
      makeCandidate({ event_type: "interim", extracted_dividend_per_share: null }),
      makeCandidate({ event_type: "year_end", extracted_dividend_per_share: 60 }),
      makeCandidate({ event_type: "annual_total", extracted_dividend_per_share: 120 })
    ];
    const result = validateAnnualTotalConsistency(candidates);
    expect(result.inconsistent).toBe(false);
    expect(result.candidatePayableSum).toBeNull();
    expect(result.warnings.some((w) => w.includes("some_amounts_null"))).toBe(true);
  });

  it("skips check when annual_total candidate has null amount", () => {
    const candidates: CandidateEvent[] = [
      makeCandidate({ event_type: "interim", extracted_dividend_per_share: 60 }),
      makeCandidate({ event_type: "year_end", extracted_dividend_per_share: 60 }),
      makeCandidate({ event_type: "annual_total", extracted_dividend_per_share: null })
    ];
    const result = validateAnnualTotalConsistency(candidates);
    expect(result.inconsistent).toBe(false);
    expect(result.warnings.some((w) => w.includes("some_amounts_null"))).toBe(true);
  });

  it("sums only interim and year_end (not special or other) for payable sum", () => {
    const candidates: CandidateEvent[] = [
      makeCandidate({ event_type: "interim", extracted_dividend_per_share: 60 }),
      makeCandidate({ event_type: "year_end", extracted_dividend_per_share: 60 }),
      makeCandidate({ event_type: "special", extracted_dividend_per_share: 10 }), // not counted
      makeCandidate({ event_type: "annual_total", extracted_dividend_per_share: 120 })
    ];
    const result = validateAnnualTotalConsistency(candidates);
    // payable sum = 60 + 60 = 120, matches annual_total = 120 → consistent
    expect(result.inconsistent).toBe(false);
    expect(result.candidatePayableSum).toBe(120);
  });
});
