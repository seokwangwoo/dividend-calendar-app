import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildPromptForDisclosure,
  buildReviewRows,
  validateAiOutput,
  type AiDividendEvent,
  type AiParseOutput,
  type DisclosureForParse
} from "../../supabase/functions/_shared/pdf-ai-parser";

function makeDisclosure(overrides: Partial<DisclosureForParse> = {}): DisclosureForParse {
  return {
    id: "disclosure-1",
    stock_id: "stock-1",
    external_id: "ext-1",
    title: "配当予想の修正に関するお知らせ",
    disclosure_type: "dividend_forecast_revision",
    storage_path: "disclosures/9433/2026-05-10/ext-1.pdf",
    published_at: "2026-05-10T06:30:00.000Z",
    ai_parse_attempts: 0,
    raw_payload: { ticker: "9433" },
    stocks: { id: "stock-1", ticker: "9433" },
    ...overrides
  };
}

function makeAiEvent(overrides: Partial<AiDividendEvent> = {}): AiDividendEvent {
  return {
    fiscal_year: 2026,
    fiscal_month: 3,
    fiscal_period: "year_end",
    dividend_type: "ordinary",
    status: "confirmed",
    dividend_per_share: 120,
    previous_dividend_per_share: 100,
    currency: "JPY",
    record_date: "2026-03-31",
    ex_dividend_date: null,
    expected_payment_year: 2026,
    expected_payment_month: 6,
    payment_date_text: null,
    reason: null,
    evidence_text: "期末配当予想を1株当たり120円に修正いたします。",
    confidence_score: 0.9,
    ...overrides
  };
}

function makeAiOutput(overrides: Partial<AiParseOutput> = {}): AiParseOutput {
  return {
    stock_ticker: "9433",
    stock_name: "株式会社テスト",
    source: {
      source_type: "tdnet",
      source_url: "https://example.com/disclosure.pdf",
      source_published_at: "2026-05-10T06:30:00.000Z",
      disclosure_title: "配当予想の修正に関するお知らせ"
    },
    events: [makeAiEvent()],
    warnings: [],
    ...overrides
  };
}

describe("20260514 ai parser change type and required period fields", () => {
  it("does not ask the AI to output change_type", () => {
    const prompt = buildPromptForDisclosure({
      context: {
        stockTicker: "9433",
        stockName: "株式会社テスト",
        disclosureTitle: "配当予想の修正に関するお知らせ",
        publishedAt: "2026-05-10T06:30:00.000Z",
        sourceUrl: "https://example.com/disclosure.pdf",
        sourceType: "tdnet"
      },
      text: "配当予想の修正に関するお知らせ\n期末配当 120円"
    });

    expect(prompt).not.toContain('"change_type"');
    expect(prompt).not.toContain("change_type 판단");
  });

  it("rejects AI output when fiscal month is missing", () => {
    const result = validateAiOutput(
      makeAiOutput({
        events: [makeAiEvent({ fiscal_month: null })]
      }),
      "9433"
    );

    expect(result.valid).toBe(false);
    expect((result as { valid: false; error: string }).error).toMatch(/missing_fiscal_month/);
  });

  it("fills missing expected payment year from fiscal period inference and keeps review change_type null", () => {
    const rows = buildReviewRows({
      disclosure: makeDisclosure(),
      aiOutput: makeAiOutput({
        events: [
          makeAiEvent({
            expected_payment_year: null,
            expected_payment_month: 6
          })
        ]
      }),
      validationWarnings: [],
      textExtraction: {
        text: "配当予想の修正テキスト",
        method: "extracted_text",
        sectionTrimmed: true,
        fallbackReason: null
      }
    });

    expect(rows[0].extracted_payment_year).toBe(2026);
    expect(rows[0].extracted_payment_month).toBe(6);
    expect(rows[0].change_type).toBeNull();
  });

  it("approval migration derives change_type from prior-year same event type instead of trusting review.change_type", () => {
    const migrationPath = resolve(
      process.cwd(),
      "supabase/migrations/20260514013000_ai_parser_change_type_required_period_fields.sql"
    );
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toContain("de.fiscal_year = v_fiscal_year - 1");
    expect(sql).toContain("de.event_type = v_event_type");
    expect(sql).not.toContain("elsif v_review.change_type is not null then");
    expect(sql).toContain("v_change_type := 'none'::public.dividend_change_type;");
  });
});
