/**
 * Phase 08: Parser fixture test set for TDnet disclosure patterns.
 *
 * These fixtures cover representative real-world TDnet disclosure categories:
 * - 配当予想の修正 (dividend forecast revision)
 * - 剰余金の配当 (dividend decision)
 * - 決算短信 (earnings release)
 * - 訂正 (correction)
 * - 無配 (no dividend)
 * - 復配 (resumed dividend)
 * - 特別配当 (special dividend)
 * - 記念配当 (commemorative dividend)
 * - Ex-dividend date explicitly disclosed (rare case)
 *
 * Tests use mocked AI responses so no live OpenAI calls are made.
 * Expected normalized outputs are validated against the review-row builder.
 */

import { describe, expect, it } from "vitest";
import {
  validateAiOutput,
  buildReviewRows,
  adjustEventConfidenceAndPriority,
  isCorrectionDisclosure,
  isStrongDividendDisclosure,
  trimToDividendSections,
  type AiParseOutput,
  type AiDividendEvent,
  type DisclosureForParse,
  type TextExtractionResult
} from "../../../supabase/functions/_shared/pdf-ai-parser";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function makeDisclosure(overrides: Partial<DisclosureForParse> = {}): DisclosureForParse {
  return {
    id: "disclosure-test",
    stock_id: "stock-1",
    external_id: "ext-test",
    title: "配当予想の修正に関するお知らせ",
    disclosure_type: "dividend_forecast_revision",
    storage_path: "disclosures/9433/2026-05-10/ext-test.pdf",
    published_at: "2026-05-10T06:30:00.000Z",
    ai_parse_attempts: 0,
    raw_payload: { ticker: "9433" },
    stocks: { id: "stock-1", ticker: "9433" },
    ...overrides
  };
}

const DEFAULT_TEXT_EXTRACTION: TextExtractionResult = {
  text: "配当予想の修正テキスト",
  method: "extracted_text",
  sectionTrimmed: true,
  fallbackReason: null
};

function makeAiEvent(overrides: Partial<AiDividendEvent> = {}): AiDividendEvent {
  return {
    event_type: "year_end",
    status: "confirmed",
    dividend_per_share: 50,
    previous_dividend_per_share: 40,
    change_type: "increase",
    record_date: "2026-03-31",
    ex_dividend_date: null,
    expected_payment_date: "2026-06-25",
    expected_payment_month: 6,
    evidence_text: "期末配当予想を修正いたします。",
    confidence_score: 0.88,
    components: null,
    ...overrides
  };
}

function makeAiOutput(overrides: Partial<AiParseOutput> = {}): AiParseOutput {
  return {
    ticker: "9433",
    company_name: "株式会社テスト",
    disclosure_title: "配当予想の修正に関するお知らせ",
    disclosure_type: "dividend_forecast_revision",
    fiscal_year: 2026,
    currency: "JPY",
    events: [makeAiEvent()],
    warnings: [],
    needs_manual_check: false,
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// Fixture 1: 配当予想の修正 (Dividend Forecast Revision)
// ---------------------------------------------------------------------------

describe("Fixture: 配当予想の修正 (dividend_forecast_revision)", () => {
  const FIXTURE_TEXT = `
配当予想の修正に関するお知らせ
株式会社テスト（証券コード：9433）
2026年3月期 期末配当予想の修正
修正後の配当金額：1株当たり50円
修正前の配当金額：1株当たり40円
基準日：2026年3月31日
支払予定日：2026年6月25日
  `.trim();

  const MOCKED_AI_RESPONSE: AiParseOutput = makeAiOutput({
    events: [
      makeAiEvent({
        event_type: "year_end",
        dividend_per_share: 50,
        previous_dividend_per_share: 40,
        change_type: "increase",
        evidence_text: "期末配当予想を1株当たり50円に修正（修正前40円）。基準日2026年3月31日。"
      })
    ]
  });

  it("validates AI output without errors", () => {
    const result = validateAiOutput(MOCKED_AI_RESPONSE, "9433");
    expect(result.valid).toBe(true);
  });

  it("classifies as strong disclosure", () => {
    expect(isStrongDividendDisclosure("配当予想の修正に関するお知らせ", "dividend_forecast_revision")).toBe(true);
  });

  it("trims text to dividend section", () => {
    const { sectionTrimmed } = trimToDividendSections(FIXTURE_TEXT);
    expect(sectionTrimmed).toBe(true);
  });

  it("produces one year_end review row with increase change_type", () => {
    const disclosure = makeDisclosure({
      title: "配当予想の修正に関するお知らせ",
      disclosure_type: "dividend_forecast_revision"
    });
    const rows = buildReviewRows({
      disclosure,
      aiOutput: MOCKED_AI_RESPONSE,
      validationWarnings: [],
      textExtraction: DEFAULT_TEXT_EXTRACTION
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].event_type).toBe("year_end");
    expect(rows[0].change_type).toBe("increase");
    expect(rows[0].extracted_dividend_per_share).toBe(50);
    expect(rows[0].previous_dividend_per_share).toBe(40);
  });

  it("does not set status to approved (must remain pending or needs_manual_check)", () => {
    const disclosure = makeDisclosure();
    const rows = buildReviewRows({
      disclosure,
      aiOutput: MOCKED_AI_RESPONSE,
      validationWarnings: [],
      textExtraction: DEFAULT_TEXT_EXTRACTION
    });
    for (const row of rows) {
      expect(row.status).not.toBe("approved");
    }
  });
});

// ---------------------------------------------------------------------------
// Fixture 2: 剰余金の配当 (Dividend Decision)
// ---------------------------------------------------------------------------

describe("Fixture: 剰余金の配当 (dividend_decision)", () => {
  const MOCKED_AI_RESPONSE: AiParseOutput = makeAiOutput({
    disclosure_title: "剰余金の配当に関するお知らせ",
    disclosure_type: "dividend_decision",
    events: [
      makeAiEvent({
        event_type: "year_end",
        status: "confirmed",
        dividend_per_share: 80,
        previous_dividend_per_share: 80,
        change_type: "unchanged",
        evidence_text: "剰余金の配当：1株当たり80円を決議いたしました。"
      })
    ]
  });

  it("validates AI output without errors", () => {
    const result = validateAiOutput(MOCKED_AI_RESPONSE, "9433");
    expect(result.valid).toBe(true);
  });

  it("produces one confirmed year_end row", () => {
    const disclosure = makeDisclosure({
      title: "剰余金の配当に関するお知らせ",
      disclosure_type: "dividend_decision"
    });
    const rows = buildReviewRows({
      disclosure,
      aiOutput: MOCKED_AI_RESPONSE,
      validationWarnings: [],
      textExtraction: DEFAULT_TEXT_EXTRACTION
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].event_type).toBe("year_end");
    expect(rows[0].change_type).toBe("unchanged");
  });
});

// ---------------------------------------------------------------------------
// Fixture 3: 決算短信 (Earnings Release) — dividend table only
// ---------------------------------------------------------------------------

describe("Fixture: 決算短信 (earnings_release)", () => {
  const FIXTURE_TEXT = `
2026年3月期 決算短信〔日本基準〕
経営成績
売上高：200億円
営業利益：30億円
経常利益：28億円
当期純利益：20億円
配当の状況
第2四半期末：25円
期末：25円
合計：50円
当期実績：50円
次期予想：55円
  `.trim();

  const MOCKED_AI_RESPONSE: AiParseOutput = makeAiOutput({
    disclosure_title: "2026年3月期 決算短信",
    disclosure_type: "earnings_release",
    events: [
      makeAiEvent({
        event_type: "interim",
        status: "confirmed",
        dividend_per_share: 25,
        previous_dividend_per_share: 20,
        change_type: "increase",
        evidence_text: "第2四半期末配当：25円"
      }),
      makeAiEvent({
        event_type: "year_end",
        status: "confirmed",
        dividend_per_share: 25,
        previous_dividend_per_share: 20,
        change_type: "increase",
        evidence_text: "期末配当：25円"
      }),
      makeAiEvent({
        event_type: "annual_total",
        status: "confirmed",
        dividend_per_share: 50,
        previous_dividend_per_share: 40,
        change_type: "increase",
        evidence_text: "年間合計：50円"
      })
    ]
  });

  it("trims earnings-release text to dividend section", () => {
    const { sectionTrimmed, trimmedText } = trimToDividendSections(FIXTURE_TEXT, { earningsRelease: true });
    expect(sectionTrimmed).toBe(true);
    // Should include dividend section
    expect(trimmedText).toContain("配当の状況");
    // Should NOT include unrelated financial metrics before dividend section
    // (earnings P/L lines come before dividend section in this fixture,
    //  so they should be excluded)
    expect(trimmedText).not.toContain("売上高");
  });

  it("validates AI output for earnings release", () => {
    const result = validateAiOutput(MOCKED_AI_RESPONSE, "9433");
    expect(result.valid).toBe(true);
  });

  it("produces three review rows: interim, year_end, annual_total", () => {
    const disclosure = makeDisclosure({
      title: "2026年3月期 決算短信",
      disclosure_type: "earnings_release"
    });
    const rows = buildReviewRows({
      disclosure,
      aiOutput: MOCKED_AI_RESPONSE,
      validationWarnings: [],
      textExtraction: DEFAULT_TEXT_EXTRACTION
    });
    expect(rows).toHaveLength(3);
    const types = rows.map((r) => r.event_type);
    expect(types).toContain("interim");
    expect(types).toContain("year_end");
    expect(types).toContain("annual_total");
  });

  it("marks annual_total as not payable", () => {
    const disclosure = makeDisclosure({ disclosure_type: "earnings_release" });
    const rows = buildReviewRows({
      disclosure,
      aiOutput: MOCKED_AI_RESPONSE,
      validationWarnings: [],
      textExtraction: DEFAULT_TEXT_EXTRACTION
    });
    const annualTotalRow = rows.find((r) => r.event_type === "annual_total");
    expect(annualTotalRow).toBeDefined();
    expect((annualTotalRow!.raw_payload as Record<string, unknown>).is_payable).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Fixture 4: 訂正 (Correction Disclosure)
// ---------------------------------------------------------------------------

describe("Fixture: 訂正 (correction)", () => {
  const MOCKED_AI_RESPONSE: AiParseOutput = makeAiOutput({
    disclosure_title: "（訂正）配当予想の修正に関するお知らせ",
    disclosure_type: "correction",
    events: [
      makeAiEvent({
        event_type: "year_end",
        dividend_per_share: 45,
        previous_dividend_per_share: 50,
        change_type: "decrease",
        evidence_text: "前回発表の配当金額に誤りがありました。正しくは45円です。"
      })
    ]
  });

  it("detects correction disclosure", () => {
    expect(isCorrectionDisclosure("（訂正）配当予想の修正に関するお知らせ", "correction")).toBe(true);
    expect(isCorrectionDisclosure("（一部訂正）配当予想の修正", "dividend_forecast_revision")).toBe(true);
  });

  it("non-correction disclosure is not flagged as correction", () => {
    expect(isCorrectionDisclosure("配当予想の修正に関するお知らせ", "dividend_forecast_revision")).toBe(false);
  });

  it("routes correction disclosures to at least high priority", () => {
    const disclosure = makeDisclosure({
      title: "（訂正）配当予想の修正に関するお知らせ",
      disclosure_type: "correction"
    });
    const rows = buildReviewRows({
      disclosure,
      aiOutput: MOCKED_AI_RESPONSE,
      validationWarnings: [],
      textExtraction: DEFAULT_TEXT_EXTRACTION
    });
    for (const row of rows) {
      const priority = (row.raw_payload as Record<string, unknown>).review_priority;
      expect(["high", "urgent"]).toContain(priority);
    }
  });

  it("includes correction_context in raw_payload", () => {
    const disclosure = makeDisclosure({
      title: "（訂正）配当予想の修正に関するお知らせ",
      disclosure_type: "correction"
    });
    const rows = buildReviewRows({
      disclosure,
      aiOutput: MOCKED_AI_RESPONSE,
      validationWarnings: [],
      textExtraction: DEFAULT_TEXT_EXTRACTION
    });
    expect(rows).toHaveLength(1);
    const payload = rows[0].raw_payload as Record<string, unknown>;
    expect(payload.correction_context).toBeDefined();
    const ctx = payload.correction_context as Record<string, unknown>;
    expect(ctx.is_correction).toBe(true);
    expect(typeof ctx.note).toBe("string");
  });

  it("adds correction_disclosure warning to review", () => {
    const disclosure = makeDisclosure({
      title: "（訂正）配当予想の修正に関するお知らせ",
      disclosure_type: "correction"
    });
    const rows = buildReviewRows({
      disclosure,
      aiOutput: MOCKED_AI_RESPONSE,
      validationWarnings: [],
      textExtraction: DEFAULT_TEXT_EXTRACTION
    });
    expect(rows[0].warning_message).toContain("correction_disclosure");
  });
});

// ---------------------------------------------------------------------------
// Fixture 5: 無配 (No Dividend)
// ---------------------------------------------------------------------------

describe("Fixture: 無配 (no_dividend)", () => {
  const MOCKED_AI_RESPONSE: AiParseOutput = makeAiOutput({
    disclosure_title: "無配に関するお知らせ",
    disclosure_type: "dividend_forecast_revision",
    events: [
      makeAiEvent({
        event_type: "year_end",
        status: "confirmed",
        dividend_per_share: 0,
        previous_dividend_per_share: 30,
        change_type: "no_dividend",
        evidence_text: "業績悪化のため、今期の期末配当を見送ることにいたしました。"
      })
    ],
    needs_manual_check: true
  });

  it("validates no-dividend AI output", () => {
    const result = validateAiOutput(MOCKED_AI_RESPONSE, "9433");
    expect(result.valid).toBe(true);
  });

  it("routes no_dividend to urgent priority and needs_manual_check status", () => {
    const event = makeAiEvent({
      change_type: "no_dividend",
      dividend_per_share: 0,
      confidence_score: 0.85
    });
    const adjusted = adjustEventConfidenceAndPriority(event, []);
    expect(adjusted.reviewPriority).toBe("urgent");
  });

  it("produces needs_manual_check status row for no-dividend", () => {
    const disclosure = makeDisclosure({ title: "無配に関するお知らせ" });
    const rows = buildReviewRows({
      disclosure,
      aiOutput: MOCKED_AI_RESPONSE,
      validationWarnings: [],
      textExtraction: DEFAULT_TEXT_EXTRACTION
    });
    expect(rows[0].status).toBe("needs_manual_check");
  });

  it("classifies 無配 title as strong disclosure", () => {
    expect(isStrongDividendDisclosure("無配に関するお知らせ", "other")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Fixture 6: 復配 (Resumed Dividend)
// ---------------------------------------------------------------------------

describe("Fixture: 復配 (resumed dividend)", () => {
  const MOCKED_AI_RESPONSE: AiParseOutput = makeAiOutput({
    disclosure_title: "配当予想の修正（復配）に関するお知らせ",
    disclosure_type: "dividend_forecast_revision",
    events: [
      makeAiEvent({
        event_type: "year_end",
        status: "confirmed",
        dividend_per_share: 25,
        previous_dividend_per_share: 0,
        change_type: "resumed",
        evidence_text: "業績回復に伴い配当を再開いたします。期末配当25円。"
      })
    ]
  });

  it("validates resumed-dividend AI output", () => {
    const result = validateAiOutput(MOCKED_AI_RESPONSE, "9433");
    expect(result.valid).toBe(true);
  });

  it("classifies 復配 title as strong disclosure", () => {
    expect(isStrongDividendDisclosure("配当予想の修正（復配）に関するお知らせ", "other")).toBe(true);
  });

  it("produces a year_end row with resumed change_type", () => {
    const disclosure = makeDisclosure({ title: "配当予想の修正（復配）に関するお知らせ" });
    const rows = buildReviewRows({
      disclosure,
      aiOutput: MOCKED_AI_RESPONSE,
      validationWarnings: [],
      textExtraction: DEFAULT_TEXT_EXTRACTION
    });
    expect(rows[0].change_type).toBe("resumed");
  });
});

// ---------------------------------------------------------------------------
// Fixture 7: 特別配当 (Special Dividend) — as component breakdown
// ---------------------------------------------------------------------------

describe("Fixture: 特別配当 (special dividend as component)", () => {
  const MOCKED_AI_RESPONSE: AiParseOutput = makeAiOutput({
    disclosure_title: "剰余金の配当（特別配当）に関するお知らせ",
    disclosure_type: "dividend_decision",
    events: [
      makeAiEvent({
        event_type: "year_end",
        status: "confirmed",
        dividend_per_share: 80,
        previous_dividend_per_share: 50,
        change_type: "special",
        components: { ordinary: 50, special: 30, commemorative: null },
        evidence_text: "期末配当：普通配当50円＋特別配当30円＝合計80円"
      })
    ]
  });

  it("validates AI output with component breakdown", () => {
    const result = validateAiOutput(MOCKED_AI_RESPONSE, "9433");
    expect(result.valid).toBe(true);
  });

  it("produces one year_end row with components in raw_payload", () => {
    const disclosure = makeDisclosure({ title: "剰余金の配当（特別配当）に関するお知らせ" });
    const rows = buildReviewRows({
      disclosure,
      aiOutput: MOCKED_AI_RESPONSE,
      validationWarnings: [],
      textExtraction: DEFAULT_TEXT_EXTRACTION
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].event_type).toBe("year_end");
    const components = (rows[0].raw_payload as Record<string, unknown>).components as Record<string, unknown>;
    expect(components).toMatchObject({ ordinary: 50, special: 30, commemorative: null });
  });

  it("routes special dividend component to high priority", () => {
    const event = makeAiEvent({
      components: { ordinary: 50, special: 30, commemorative: null },
      confidence_score: 0.85
    });
    const result = adjustEventConfidenceAndPriority(event, []);
    expect(result.reviewPriority).toBe("high");
  });
});

// ---------------------------------------------------------------------------
// Fixture 8: 記念配当 (Commemorative Dividend) — as component breakdown
// ---------------------------------------------------------------------------

describe("Fixture: 記念配当 (commemorative dividend as component)", () => {
  const MOCKED_AI_RESPONSE: AiParseOutput = makeAiOutput({
    disclosure_title: "剰余金の配当（記念配当）に関するお知らせ",
    disclosure_type: "dividend_decision",
    events: [
      makeAiEvent({
        event_type: "interim",
        status: "confirmed",
        dividend_per_share: 120,
        previous_dividend_per_share: 50,
        change_type: "commemorative",
        components: { ordinary: 50, special: null, commemorative: 70 },
        evidence_text: "創業100周年記念配当：普通配当50円＋記念配当70円＝合計120円"
      })
    ]
  });

  it("validates AI output with commemorative component", () => {
    const result = validateAiOutput(MOCKED_AI_RESPONSE, "9433");
    expect(result.valid).toBe(true);
  });

  it("produces one interim row with commemorative component in raw_payload", () => {
    const disclosure = makeDisclosure({
      title: "剰余金の配当（記念配当）に関するお知らせ",
      disclosure_type: "dividend_decision"
    });
    const rows = buildReviewRows({
      disclosure,
      aiOutput: MOCKED_AI_RESPONSE,
      validationWarnings: [],
      textExtraction: DEFAULT_TEXT_EXTRACTION
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].event_type).toBe("interim");
    const components = (rows[0].raw_payload as Record<string, unknown>).components as Record<string, unknown>;
    expect(components.commemorative).toBe(70);
    expect(components.ordinary).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// Fixture 9: Ex-dividend date explicitly disclosed (rare case)
// ---------------------------------------------------------------------------

describe("Fixture: explicit ex_dividend_date in disclosure", () => {
  const MOCKED_AI_RESPONSE: AiParseOutput = makeAiOutput({
    events: [
      makeAiEvent({
        ex_dividend_date: "2026-03-27",
        record_date: "2026-03-31",
        evidence_text: "権利確定日：2026年3月31日、権利落ち日：2026年3月27日が開示に明記されています。"
      })
    ]
  });

  it("validates AI output with explicit ex_dividend_date", () => {
    const result = validateAiOutput(MOCKED_AI_RESPONSE, "9433");
    expect(result.valid).toBe(true);
  });

  it("stores the explicit ex_dividend_date in review row", () => {
    const disclosure = makeDisclosure();
    const rows = buildReviewRows({
      disclosure,
      aiOutput: MOCKED_AI_RESPONSE,
      validationWarnings: [],
      textExtraction: DEFAULT_TEXT_EXTRACTION
    });
    expect(rows[0].extracted_ex_dividend_date).toBe("2026-03-27");
  });

  it("does not create a row with a calculated ex_dividend_date when absent", () => {
    const responseMissingExDiv: AiParseOutput = makeAiOutput({
      events: [makeAiEvent({ ex_dividend_date: null })]
    });
    const disclosure = makeDisclosure();
    const rows = buildReviewRows({
      disclosure,
      aiOutput: responseMissingExDiv,
      validationWarnings: [],
      textExtraction: DEFAULT_TEXT_EXTRACTION
    });
    expect(rows[0].extracted_ex_dividend_date).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Fixture 10: Suspicious large dividend (confidence tuning)
// ---------------------------------------------------------------------------

describe("Fixture: suspicious large dividend (above 1000 JPY/share)", () => {
  it("flags 1001 JPY/share as suspicious and reduces confidence", () => {
    const event = makeAiEvent({ dividend_per_share: 1001, confidence_score: 0.9 });
    const result = adjustEventConfidenceAndPriority(event, []);
    expect(result.adjustedConfidence).toBeLessThan(0.9);
    expect(result.reviewPriority).toBe("high");
    expect(result.warnings.some((w) => w.startsWith("suspicious_large_dividend"))).toBe(true);
  });

  it("does not flag 999 JPY/share as suspicious", () => {
    const event = makeAiEvent({ dividend_per_share: 999, confidence_score: 0.9 });
    const result = adjustEventConfidenceAndPriority(event, []);
    expect(result.warnings.some((w) => w.startsWith("suspicious_large_dividend"))).toBe(false);
  });

  it("does not flag exactly 1000 JPY/share as suspicious (boundary: > not >=)", () => {
    const event = makeAiEvent({ dividend_per_share: 1000, confidence_score: 0.9 });
    const result = adjustEventConfidenceAndPriority(event, []);
    expect(result.warnings.some((w) => w.startsWith("suspicious_large_dividend"))).toBe(false);
  });

  it("validates suspicious-amount output (AI can report it, but confidence is adjusted)", () => {
    const largeAmountOutput: AiParseOutput = makeAiOutput({
      events: [makeAiEvent({ dividend_per_share: 5000, confidence_score: 0.7 })]
    });
    const result = validateAiOutput(largeAmountOutput, "9433");
    // Validation itself accepts any non-negative amount; confidence adjustment happens separately
    expect(result.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Fixture 11: Missing evidence text (confidence tuning)
// ---------------------------------------------------------------------------

describe("Fixture: missing or short evidence text (confidence tuning)", () => {
  it("reduces confidence when evidence_text is missing or very short", () => {
    const event = makeAiEvent({ evidence_text: "x", confidence_score: 0.8 });
    const result = adjustEventConfidenceAndPriority(event, []);
    expect(result.adjustedConfidence).toBeLessThan(0.8);
    expect(result.warnings.some((w) => w.includes("missing_or_short_evidence_text"))).toBe(true);
  });

  it("does not penalize evidence_text that meets minimum length", () => {
    const event = makeAiEvent({
      evidence_text: "この配当予想の修正は1株当たり50円です。",
      confidence_score: 0.8
    });
    const result = adjustEventConfidenceAndPriority(event, []);
    expect(result.warnings.some((w) => w.includes("missing_or_short_evidence_text"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Fixture 12: Missing payment date (confidence tuning)
// ---------------------------------------------------------------------------

describe("Fixture: missing payment date (confidence tuning)", () => {
  it("reduces confidence when both payment date and payment month are null", () => {
    const event = makeAiEvent({
      expected_payment_date: null,
      expected_payment_month: null,
      confidence_score: 0.85
    });
    const result = adjustEventConfidenceAndPriority(event, []);
    expect(result.adjustedConfidence).toBeLessThan(0.85);
  });

  it("does not penalize when only payment month is known (no full date)", () => {
    const event = makeAiEvent({
      expected_payment_date: null,
      expected_payment_month: 6,
      confidence_score: 0.85
    });
    const result = adjustEventConfidenceAndPriority(event, []);
    // Has month, so no penalty for missing payment date
    const baseline = makeAiEvent({
      expected_payment_date: "2026-06-25",
      expected_payment_month: 6,
      confidence_score: 0.85
    });
    const baselineResult = adjustEventConfidenceAndPriority(baseline, []);
    // Both should have same adjusted confidence since payment_month is present
    expect(result.adjustedConfidence).toBe(baselineResult.adjustedConfidence);
  });
});

// ---------------------------------------------------------------------------
// Fixture 13: One-review-per-event enforcement
// ---------------------------------------------------------------------------

describe("Fixture: one review row per AI event", () => {
  it("creates exactly one row per AI event, never merging events", () => {
    const disclosure = makeDisclosure();
    const aiOutput = makeAiOutput({
      events: [
        makeAiEvent({ event_type: "interim", dividend_per_share: 25 }),
        makeAiEvent({ event_type: "year_end", dividend_per_share: 25 }),
        makeAiEvent({ event_type: "annual_total", dividend_per_share: 50 })
      ]
    });
    const rows = buildReviewRows({
      disclosure,
      aiOutput,
      validationWarnings: [],
      textExtraction: DEFAULT_TEXT_EXTRACTION
    });
    expect(rows).toHaveLength(3);
    // Each row should have a unique event_index
    const indices = rows.map((r) => (r.raw_payload as Record<string, unknown>).event_index);
    expect(new Set(indices).size).toBe(3);
  });

  it("never produces an approved status from the AI parsing pathway", () => {
    const disclosure = makeDisclosure();
    const aiOutput = makeAiOutput({
      events: Array.from({ length: 5 }, (_, i) =>
        makeAiEvent({ event_type: i % 2 === 0 ? "interim" : "year_end" })
      )
    });
    const rows = buildReviewRows({
      disclosure,
      aiOutput,
      validationWarnings: [],
      textExtraction: DEFAULT_TEXT_EXTRACTION
    });
    for (const row of rows) {
      expect(["pending", "needs_manual_check"]).toContain(row.status);
    }
  });
});
