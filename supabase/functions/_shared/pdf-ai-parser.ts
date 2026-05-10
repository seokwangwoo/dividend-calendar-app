/**
 * Phase 04: AI PDF Parsing
 *
 * Parses downloaded TDnet PDFs into validated dividend review candidates.
 * Extracts text from PDFs first, then sends to OpenAI Responses API.
 * Falls back to direct PDF input only when text extraction is unusable.
 */

import { JobHandlerError, resolvePayloadString, type JobRow, type JsonRecord } from "./process-jobs.ts";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type AiParseDependencies = {
  fetchDisclosureForParse(disclosureId: string): Promise<DisclosureForParse>;
  downloadPdf(storagePath: string): Promise<Uint8Array>;
  callOpenAI(request: OpenAIParseRequest): Promise<OpenAIParseResponse>;
  upsertDividendReviews(rows: DividendReviewInsert[]): Promise<void>;
  updateDisclosureParsed(disclosureId: string): Promise<void>;
  updateDisclosureParseAttempt(
    disclosureId: string,
    attempt: number,
    lastError: string
  ): Promise<void>;
  updateDisclosureFailedParse(
    disclosureId: string,
    lastError: string
  ): Promise<void>;
  /** OpenAI model name to use (e.g. "gpt-4o"). Required to avoid Deno.env in shared module. */
  openaiModel?: string;
};

export type DisclosureForParse = {
  id: string;
  stock_id: string | null;
  external_id: string | null;
  title: string;
  disclosure_type: string | null;
  storage_path: string | null;
  published_at: string | null;
  ai_parse_attempts: number;
  raw_payload: JsonRecord;
  stocks?: { ticker: string | null; id: string | null } | { ticker: string | null; id: string | null }[] | null;
};

export type OpenAIParseRequest = {
  disclosureTitle: string;
  disclosureType: string;
  extractedText: string | null;
  pdfBytes: Uint8Array | null;
  textExtractionMethod: "extracted_text" | "direct_pdf_fallback";
  model: string;
};

export type OpenAIParseResponse = {
  rawText: string;
  usage?: { input_tokens?: number; output_tokens?: number };
};

export type DividendReviewInsert = {
  stock_id: string | null;
  disclosure_id: string;
  fiscal_year: number | null;
  event_type: string | null;
  extracted_dividend_per_share: number | null;
  previous_dividend_per_share: number | null;
  extracted_payment_date: string | null;
  extracted_payment_month: number | null;
  extracted_record_date: string | null;
  extracted_ex_dividend_date: string | null;
  change_type: string | null;
  evidence_text: string | null;
  warning_message: string | null;
  status: string;
  confidence_score: number | null;
  raw_payload: JsonRecord;
};

// ---------------------------------------------------------------------------
// AI response schema types
// ---------------------------------------------------------------------------

export type AiEventType =
  | "interim"
  | "year_end"
  | "annual_total"
  | "special"
  | "commemorative"
  | "other";

export type AiChangeType =
  | "increase"
  | "decrease"
  | "no_dividend"
  | "resumed"
  | "special"
  | "commemorative"
  | "unchanged"
  | "unknown";

export type AiDividendEvent = {
  event_type: AiEventType;
  status: "confirmed" | "estimated" | "undecided";
  dividend_per_share: number | null;
  previous_dividend_per_share: number | null;
  change_type: AiChangeType;
  record_date: string | null;
  ex_dividend_date: string | null;
  expected_payment_date: string | null;
  expected_payment_month: number | null;
  evidence_text: string;
  confidence_score: number;
  components?: {
    ordinary: number | null;
    special: number | null;
    commemorative: number | null;
  } | null;
};

export type AiParseOutput = {
  ticker: string | null;
  company_name: string | null;
  disclosure_title: string;
  disclosure_type: string;
  fiscal_year: number | null;
  currency: "JPY" | string;
  events: AiDividendEvent[];
  warnings: string[];
  needs_manual_check: boolean;
};

// ---------------------------------------------------------------------------
// Validation constants
// ---------------------------------------------------------------------------

const VALID_EVENT_TYPES = new Set<string>([
  "interim",
  "year_end",
  "annual_total",
  "special",
  "commemorative",
  "other"
]);

const VALID_CHANGE_TYPES = new Set<string>([
  "increase",
  "decrease",
  "no_dividend",
  "resumed",
  "special",
  "commemorative",
  "unchanged",
  "unknown"
]);

const VALID_STATUS_VALUES = new Set<string>([
  "confirmed",
  "estimated",
  "undecided"
]);

const SUSPICIOUS_DIVIDEND_THRESHOLD = 10000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ---------------------------------------------------------------------------
// Prompt templates
// ---------------------------------------------------------------------------

function buildDividendDisclosurePrompt(title: string, text: string): string {
  return `You are a specialized Japanese corporate disclosure analyst. Extract dividend information from the following Japanese corporate announcement.

Disclosure title: ${title}

Announcement text:
${text}

Extract all dividend-related events. Focus on:
- 配当予想の修正 (dividend forecast revisions)
- 剰余金の配当 (dividend decisions)
- 記念配当 (commemorative dividends)
- 特別配当 (special dividends)
- 増配/減配/無配/復配 (increases, decreases, no-dividend, resumed dividends)
- 基準日 (record date)
- 支払予定日 (expected payment date)
- 特別配当・記念配当のある場合は普通配当との内訳も記録すること

Important rules:
- Do NOT calculate ex_dividend_date from record_date. Only include ex_dividend_date if it is explicitly stated in the text.
- Use explicit null for unknown values.
- Accept only JPY currency.
- Report confidence_score between 0.0 and 1.0.
- When special or commemorative dividends are part of the same declared event, include them as components of the payable interim or year_end event rather than as separate events.

Return JSON matching this schema exactly:
{
  "ticker": string | null,
  "company_name": string | null,
  "disclosure_title": string,
  "disclosure_type": string,
  "fiscal_year": number | null,
  "currency": "JPY",
  "events": [
    {
      "event_type": "interim" | "year_end" | "annual_total" | "special" | "commemorative" | "other",
      "status": "confirmed" | "estimated" | "undecided",
      "dividend_per_share": number | null,
      "previous_dividend_per_share": number | null,
      "change_type": "increase" | "decrease" | "no_dividend" | "resumed" | "special" | "commemorative" | "unchanged" | "unknown",
      "record_date": "YYYY-MM-DD" | null,
      "ex_dividend_date": "YYYY-MM-DD" | null,
      "expected_payment_date": "YYYY-MM-DD" | null,
      "expected_payment_month": number | null,
      "evidence_text": string,
      "confidence_score": number,
      "components": {
        "ordinary": number | null,
        "special": number | null,
        "commemorative": number | null
      } | null
    }
  ],
  "warnings": string[],
  "needs_manual_check": boolean
}`;
}

function buildEarningsReleasePrompt(title: string, text: string): string {
  return `You are a specialized Japanese corporate disclosure analyst. Extract dividend information from the following Japanese earnings release (決算短信).

Disclosure title: ${title}

Earnings release text:
${text}

Extract ONLY dividend-related information. Focus specifically on:
- 配当の状況 (dividend summary section)
- 1株当たり配当金 (dividend per share table)
- 年間配当金 (annual dividend total)
- 中間配当 (interim dividend)
- 期末配当 (year-end dividend)

IGNORE all other financial metrics (revenue, profit, etc.).

Important rules:
- Do NOT calculate ex_dividend_date from record_date. Only include ex_dividend_date if it is explicitly stated in the text.
- annual_total rows are reference-only and should still be included.
- Use explicit null for unknown values.
- Accept only JPY currency.
- Report confidence_score between 0.0 and 1.0.

Return JSON matching this schema exactly:
{
  "ticker": string | null,
  "company_name": string | null,
  "disclosure_title": string,
  "disclosure_type": "earnings_release",
  "fiscal_year": number | null,
  "currency": "JPY",
  "events": [
    {
      "event_type": "interim" | "year_end" | "annual_total" | "special" | "commemorative" | "other",
      "status": "confirmed" | "estimated" | "undecided",
      "dividend_per_share": number | null,
      "previous_dividend_per_share": number | null,
      "change_type": "increase" | "decrease" | "no_dividend" | "resumed" | "special" | "commemorative" | "unchanged" | "unknown",
      "record_date": "YYYY-MM-DD" | null,
      "ex_dividend_date": "YYYY-MM-DD" | null,
      "expected_payment_date": "YYYY-MM-DD" | null,
      "expected_payment_month": number | null,
      "evidence_text": string,
      "confidence_score": number,
      "components": null
    }
  ],
  "warnings": string[],
  "needs_manual_check": boolean
}`;
}

export function buildPromptForDisclosure(
  disclosureType: string,
  title: string,
  text: string
): string {
  if (disclosureType === "earnings_release" || disclosureType === "earnings_revision") {
    return buildEarningsReleasePrompt(title, text);
  }
  return buildDividendDisclosurePrompt(title, text);
}

// ---------------------------------------------------------------------------
// PDF text extraction
// ---------------------------------------------------------------------------

export type TextExtractionResult = {
  text: string;
  method: "extracted_text" | "direct_pdf_fallback";
  sectionTrimmed: boolean;
  fallbackReason: string | null;
};

const DIVIDEND_SECTION_KEYWORDS = [
  "配当の状況",
  "1株当たり配当金",
  "年間配当金",
  "中間配当",
  "期末配当",
  "配当予想",
  "配当に関する",
  "剰余金の配当",
  "増配",
  "減配",
  "無配",
  "復配",
  "記念配当",
  "特別配当",
  "基準日",
  "支払予定日"
];

/** Minimum character count for text to be considered usable */
const MIN_USABLE_TEXT_LENGTH = 50;

/**
 * Extracts text from a PDF byte array.
 * Uses a lightweight approach: scans the raw PDF stream for BT/ET (text object)
 * markers and extracts string literals. This is a minimal implementation suitable
 * for Japanese TDnet PDFs that embed text streams.
 */
export function extractTextFromPdf(pdfBytes: Uint8Array): string {
  try {
    // Decode the raw PDF bytes as Latin-1 to preserve byte values
    const raw = new TextDecoder("latin1").decode(pdfBytes);
    const parts: string[] = [];

    // Extract text from BT...ET blocks (PDF text objects)
    const btEtRe = /BT[\s\S]*?ET/g;
    let btMatch: RegExpExecArray | null;
    while ((btMatch = btEtRe.exec(raw)) !== null) {
      const block = btMatch[0];
      // Extract parenthetical string literals: (text)Tj or (text)TJ
      const strRe = /\(([^)]*)\)\s*T[jJ]/g;
      let strMatch: RegExpExecArray | null;
      while ((strMatch = strRe.exec(block)) !== null) {
        const decoded = decodePdfString(strMatch[1]);
        if (decoded.trim().length > 0) {
          parts.push(decoded);
        }
      }
    }

    // Also try to extract Unicode text from hex strings in BT blocks
    const hexRe = /BT[\s\S]*?ET/g;
    let hexBlock: RegExpExecArray | null;
    while ((hexBlock = hexRe.exec(raw)) !== null) {
      const block = hexBlock[0];
      const hexStrRe = /<([0-9A-Fa-f]+)>\s*T[jJ]/g;
      let hexMatch: RegExpExecArray | null;
      while ((hexMatch = hexStrRe.exec(block)) !== null) {
        const decoded = decodeHexPdfString(hexMatch[1]);
        if (decoded.trim().length > 0) {
          parts.push(decoded);
        }
      }
    }

    return parts.join(" ").replace(/\s+/g, " ").trim();
  } catch {
    return "";
  }
}

function decodePdfString(raw: string): string {
  // Handle escape sequences in PDF strings
  return raw
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\\\/g, "\\");
}

function decodeHexPdfString(hex: string): string {
  try {
    const bytes: number[] = [];
    for (let i = 0; i < hex.length - 1; i += 2) {
      bytes.push(parseInt(hex.slice(i, i + 2), 16));
    }
    // Try UTF-16BE first (common for CIDFont encoded Japanese PDFs)
    if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
      return new TextDecoder("utf-16be").decode(new Uint8Array(bytes.slice(2)));
    }
    // Fall back to UTF-16BE without BOM
    if (bytes.length >= 2 && (bytes[0] > 0 || bytes[1] > 127)) {
      try {
        return new TextDecoder("utf-16be").decode(new Uint8Array(bytes));
      } catch {
        // continue to latin-1
      }
    }
    return new TextDecoder("latin1").decode(new Uint8Array(bytes));
  } catch {
    return "";
  }
}

/**
 * Trims extracted text to focus on dividend-relevant sections.
 * Returns the trimmed text and whether trimming occurred.
 */
export function trimToDividendSections(text: string): {
  trimmedText: string;
  sectionTrimmed: boolean;
} {
  const lines = text.split(/[\n\r]+/);
  const relevantLines: string[] = [];
  let inDividendSection = false;
  let sectionTrimmed = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const isDividendKeyword = DIVIDEND_SECTION_KEYWORDS.some((kw) =>
      trimmed.includes(kw)
    );

    if (isDividendKeyword) {
      inDividendSection = true;
      sectionTrimmed = true;
    }

    if (inDividendSection) {
      relevantLines.push(trimmed);
      // Stop after capturing a large enough section
      if (relevantLines.length > 200) break;
    }
  }

  // If no dividend sections found, return the full text
  if (!sectionTrimmed) {
    return { trimmedText: text, sectionTrimmed: false };
  }

  return { trimmedText: relevantLines.join("\n"), sectionTrimmed: true };
}

/**
 * Determines whether extracted text meets minimum quality for AI input.
 */
export function isTextUsable(text: string): boolean {
  const japaneseCharRe = /[぀-ヿ一-鿿]/;
  return text.length >= MIN_USABLE_TEXT_LENGTH && japaneseCharRe.test(text);
}

/**
 * Prepares the text or fallback payload to send to OpenAI.
 */
export function prepareTextForAI(pdfBytes: Uint8Array): TextExtractionResult {
  const rawText = extractTextFromPdf(pdfBytes);
  const { trimmedText, sectionTrimmed } = trimToDividendSections(rawText);

  if (isTextUsable(trimmedText)) {
    return {
      text: trimmedText,
      method: "extracted_text",
      sectionTrimmed,
      fallbackReason: null
    };
  }

  // Check if full raw text is usable
  if (isTextUsable(rawText)) {
    return {
      text: rawText,
      method: "extracted_text",
      sectionTrimmed: false,
      fallbackReason: null
    };
  }

  // Text extraction failed quality check - use direct PDF fallback
  const reason =
    rawText.length === 0
      ? "empty_text_extraction"
      : "text_below_minimum_quality_threshold";

  return {
    text: "",
    method: "direct_pdf_fallback",
    sectionTrimmed: false,
    fallbackReason: reason
  };
}

// ---------------------------------------------------------------------------
// AI response validation
// ---------------------------------------------------------------------------

export type ValidationResult =
  | { valid: true; output: AiParseOutput; warnings: string[] }
  | { valid: false; error: string };

export function validateAiOutput(
  raw: unknown,
  disclosureTicker: string | null
): ValidationResult {
  if (!isRecord(raw)) {
    return { valid: false, error: "ai_output_not_an_object" };
  }

  // Validate currency - only JPY for MVP
  if (raw.currency !== "JPY") {
    return {
      valid: false,
      error: `ai_output_invalid_currency:${raw.currency ?? "missing"}`
    };
  }

  // Validate required top-level fields
  if (typeof raw.disclosure_title !== "string") {
    return { valid: false, error: "ai_output_missing_disclosure_title" };
  }
  if (typeof raw.disclosure_type !== "string") {
    return { valid: false, error: "ai_output_missing_disclosure_type" };
  }
  if (!Array.isArray(raw.events)) {
    return { valid: false, error: "ai_output_events_not_array" };
  }
  if (!Array.isArray(raw.warnings)) {
    return { valid: false, error: "ai_output_warnings_not_array" };
  }
  if (typeof raw.needs_manual_check !== "boolean") {
    return { valid: false, error: "ai_output_missing_needs_manual_check" };
  }

  const validationWarnings: string[] = [];

  // Check ticker mismatch (warning, not failure)
  if (disclosureTicker && typeof raw.ticker === "string" && raw.ticker !== disclosureTicker) {
    validationWarnings.push(
      `ticker_mismatch:ai_said_${raw.ticker}_disclosure_is_${disclosureTicker}`
    );
  }

  // Validate fiscal_year
  if (raw.fiscal_year !== null && raw.fiscal_year !== undefined) {
    if (typeof raw.fiscal_year !== "number" || !Number.isInteger(raw.fiscal_year)) {
      return { valid: false, error: "ai_output_invalid_fiscal_year" };
    }
  }

  // Validate each event
  for (let i = 0; i < raw.events.length; i++) {
    const event = raw.events[i];
    if (!isRecord(event)) {
      return { valid: false, error: `ai_output_event_${i}_not_object` };
    }

    if (!VALID_EVENT_TYPES.has(String(event.event_type))) {
      return {
        valid: false,
        error: `ai_output_event_${i}_invalid_event_type:${event.event_type}`
      };
    }

    if (!VALID_STATUS_VALUES.has(String(event.status))) {
      return {
        valid: false,
        error: `ai_output_event_${i}_invalid_status:${event.status}`
      };
    }

    if (!VALID_CHANGE_TYPES.has(String(event.change_type))) {
      return {
        valid: false,
        error: `ai_output_event_${i}_invalid_change_type:${event.change_type}`
      };
    }

    // Validate dividend amounts (must be non-negative or null)
    if (event.dividend_per_share !== null && event.dividend_per_share !== undefined) {
      if (typeof event.dividend_per_share !== "number" || event.dividend_per_share < 0) {
        return {
          valid: false,
          error: `ai_output_event_${i}_invalid_dividend_per_share`
        };
      }
    }
    if (
      event.previous_dividend_per_share !== null &&
      event.previous_dividend_per_share !== undefined
    ) {
      if (
        typeof event.previous_dividend_per_share !== "number" ||
        event.previous_dividend_per_share < 0
      ) {
        return {
          valid: false,
          error: `ai_output_event_${i}_invalid_previous_dividend_per_share`
        };
      }
    }

    // Validate confidence score
    if (typeof event.confidence_score !== "number") {
      return {
        valid: false,
        error: `ai_output_event_${i}_missing_confidence_score`
      };
    }
    if (event.confidence_score < 0 || event.confidence_score > 1) {
      return {
        valid: false,
        error: `ai_output_event_${i}_confidence_out_of_range:${event.confidence_score}`
      };
    }

    // Validate date formats
    for (const dateField of ["record_date", "ex_dividend_date", "expected_payment_date"] as const) {
      const val = event[dateField];
      if (val !== null && val !== undefined) {
        if (typeof val !== "string" || !DATE_RE.test(val)) {
          return {
            valid: false,
            error: `ai_output_event_${i}_invalid_${dateField}:${val}`
          };
        }
      }
    }

    // Validate expected_payment_month
    if (event.expected_payment_month !== null && event.expected_payment_month !== undefined) {
      if (
        typeof event.expected_payment_month !== "number" ||
        !Number.isInteger(event.expected_payment_month) ||
        event.expected_payment_month < 1 ||
        event.expected_payment_month > 12
      ) {
        return {
          valid: false,
          error: `ai_output_event_${i}_invalid_expected_payment_month:${event.expected_payment_month}`
        };
      }
    }

    // Validate evidence_text
    if (typeof event.evidence_text !== "string") {
      return {
        valid: false,
        error: `ai_output_event_${i}_missing_evidence_text`
      };
    }
  }

  return {
    valid: true,
    output: raw as unknown as AiParseOutput,
    warnings: validationWarnings
  };
}

// ---------------------------------------------------------------------------
// Confidence adjustment and priority routing
// ---------------------------------------------------------------------------

export type ReviewPriority = "low" | "normal" | "high" | "urgent";

export type AdjustedEvent = {
  event: AiDividendEvent;
  adjustedConfidence: number;
  reviewPriority: ReviewPriority;
  warnings: string[];
};

/**
 * Adjusts confidence and priority deterministically based on event properties.
 */
export function adjustEventConfidenceAndPriority(
  event: AiDividendEvent,
  globalWarnings: string[]
): AdjustedEvent {
  let confidence = event.confidence_score;
  let priority: ReviewPriority = "normal";
  const warnings = [...globalWarnings];

  // Suspicious large dividend amounts
  if (
    event.dividend_per_share !== null &&
    event.dividend_per_share > SUSPICIOUS_DIVIDEND_THRESHOLD
  ) {
    confidence = Math.max(0, confidence - 0.3);
    priority = "high";
    warnings.push(`suspicious_large_dividend:${event.dividend_per_share}`);
  }

  // No evidence text reduces confidence
  if (!event.evidence_text || event.evidence_text.trim().length < 10) {
    confidence = Math.max(0, confidence - 0.2);
    warnings.push("missing_or_short_evidence_text");
  }

  // No-dividend: always urgent
  if (event.change_type === "no_dividend") {
    priority = "urgent";
  }

  // Decrease: high priority
  if (event.change_type === "decrease") {
    if (priority !== "urgent") priority = "high";
  }

  // Special or commemorative breakdowns need review
  if (event.components && (event.components.special !== null || event.components.commemorative !== null)) {
    if (priority === "normal" || priority === "low") priority = "high";
  }

  // Low confidence: high priority
  if (confidence < 0.6) {
    if (priority === "normal" || priority === "low") priority = "high";
  }

  // Missing amount reduces confidence
  if (event.dividend_per_share === null) {
    confidence = Math.max(0, confidence - 0.15);
  }

  // Missing payment date reduces confidence
  if (event.expected_payment_date === null && event.expected_payment_month === null) {
    confidence = Math.max(0, confidence - 0.1);
  }

  // Global warnings (e.g. ticker mismatch) reduce confidence
  const tickerMismatch = warnings.some((w) => w.startsWith("ticker_mismatch"));
  if (tickerMismatch) {
    confidence = Math.max(0, confidence - 0.15);
    if (priority === "normal" || priority === "low") priority = "high";
  }

  // Clamp confidence
  confidence = Math.min(1, Math.max(0, confidence));
  // Re-check after adjustments
  if (confidence < 0.6 && priority === "normal") priority = "high";

  return { event, adjustedConfidence: confidence, reviewPriority: priority, warnings };
}

// ---------------------------------------------------------------------------
// Review row creation
// ---------------------------------------------------------------------------

function isPayableEventType(eventType: string): boolean {
  return eventType === "interim" || eventType === "year_end" || eventType === "other";
}

function resolveStockId(disclosure: DisclosureForParse): string | null {
  if (disclosure.stock_id) return disclosure.stock_id;
  const stock = Array.isArray(disclosure.stocks) ? disclosure.stocks[0] : disclosure.stocks;
  return stock?.id ?? null;
}

function buildReviewRawPayload(params: {
  eventIndex: number;
  event: AiDividendEvent;
  adjustedConfidence: number;
  reviewPriority: ReviewPriority;
  warnings: string[];
  disclosureLevel: {
    ticker: string | null;
    companyName: string | null;
    fiscalYear: number | null;
    disclosureType: string;
    needsManualCheck: boolean;
    totalEventsInResponse: number;
    textExtractionMethod: string;
    sectionTrimmed: boolean;
    fallbackReason: string | null;
    openaiUsage?: { input_tokens?: number; output_tokens?: number };
  };
  isPayable: boolean;
}): JsonRecord {
  const { event, eventIndex, adjustedConfidence, reviewPriority, warnings, disclosureLevel, isPayable } =
    params;

  return {
    event_index: eventIndex,
    event_type: event.event_type,
    status: event.status,
    change_type: event.change_type,
    raw_confidence_score: event.confidence_score,
    adjusted_confidence_score: adjustedConfidence,
    review_priority: reviewPriority,
    warnings,
    is_payable: isPayable,
    components: event.components ?? null,
    record_date: event.record_date ?? null,
    ex_dividend_date: event.ex_dividend_date ?? null,
    expected_payment_date: event.expected_payment_date ?? null,
    expected_payment_month: event.expected_payment_month ?? null,
    evidence_text: event.evidence_text,
    disclosure_ai_summary: {
      ticker: disclosureLevel.ticker,
      company_name: disclosureLevel.companyName,
      fiscal_year: disclosureLevel.fiscalYear,
      disclosure_type: disclosureLevel.disclosureType,
      needs_manual_check: disclosureLevel.needsManualCheck,
      total_events_in_response: disclosureLevel.totalEventsInResponse,
      text_extraction_method: disclosureLevel.textExtractionMethod,
      section_trimmed: disclosureLevel.sectionTrimmed,
      fallback_reason: disclosureLevel.fallbackReason,
      openai_usage: disclosureLevel.openaiUsage ?? null
    }
  };
}

/**
 * Builds the list of review rows to upsert for a validated AI output.
 */
export function buildReviewRows(params: {
  disclosure: DisclosureForParse;
  aiOutput: AiParseOutput;
  validationWarnings: string[];
  textExtraction: TextExtractionResult;
  openaiUsage?: { input_tokens?: number; output_tokens?: number };
}): DividendReviewInsert[] {
  const { disclosure, aiOutput, validationWarnings, textExtraction, openaiUsage } = params;
  const stockId = resolveStockId(disclosure);
  const rows: DividendReviewInsert[] = [];

  const disclosureLevelMeta = {
    ticker: aiOutput.ticker,
    companyName: aiOutput.company_name,
    fiscalYear: aiOutput.fiscal_year,
    disclosureType: aiOutput.disclosure_type,
    needsManualCheck: aiOutput.needs_manual_check,
    totalEventsInResponse: aiOutput.events.length,
    textExtractionMethod: textExtraction.method,
    sectionTrimmed: textExtraction.sectionTrimmed,
    fallbackReason: textExtraction.fallbackReason,
    openaiUsage
  };

  const combinedWarnings = [...validationWarnings, ...aiOutput.warnings];

  for (let i = 0; i < aiOutput.events.length; i++) {
    const event = aiOutput.events[i];
    const adjusted = adjustEventConfidenceAndPriority(event, combinedWarnings);
    const isPayable = isPayableEventType(event.event_type);

    const reviewStatus =
      adjusted.reviewPriority === "urgent" || aiOutput.needs_manual_check
        ? "needs_manual_check"
        : "pending";

    const rawPayload = buildReviewRawPayload({
      eventIndex: i,
      event,
      adjustedConfidence: adjusted.adjustedConfidence,
      reviewPriority: adjusted.reviewPriority,
      warnings: adjusted.warnings,
      disclosureLevel: disclosureLevelMeta,
      isPayable
    });

    rows.push({
      stock_id: stockId,
      disclosure_id: disclosure.id,
      fiscal_year: aiOutput.fiscal_year,
      event_type: event.event_type,
      extracted_dividend_per_share: event.dividend_per_share ?? null,
      previous_dividend_per_share: event.previous_dividend_per_share ?? null,
      extracted_payment_date: event.expected_payment_date ?? null,
      extracted_payment_month: event.expected_payment_month ?? null,
      extracted_record_date: event.record_date ?? null,
      extracted_ex_dividend_date: event.ex_dividend_date ?? null,
      change_type: event.change_type,
      evidence_text: event.evidence_text,
      warning_message:
        adjusted.warnings.length > 0 ? adjusted.warnings.join("; ") : null,
      status: reviewStatus,
      confidence_score: adjusted.adjustedConfidence,
      raw_payload: rawPayload
    });
  }

  return rows;
}

/**
 * Builds a single manual-check review row for a strong dividend disclosure
 * where AI found no events.
 */
export function buildNoEventsManualCheckRow(params: {
  disclosure: DisclosureForParse;
  aiOutput: AiParseOutput;
  validationWarnings: string[];
  textExtraction: TextExtractionResult;
  openaiUsage?: { input_tokens?: number; output_tokens?: number };
}): DividendReviewInsert {
  const { disclosure, aiOutput, validationWarnings, textExtraction, openaiUsage } = params;
  const stockId = resolveStockId(disclosure);

  return {
    stock_id: stockId,
    disclosure_id: disclosure.id,
    fiscal_year: aiOutput.fiscal_year,
    event_type: null,
    extracted_dividend_per_share: null,
    previous_dividend_per_share: null,
    extracted_payment_date: null,
    extracted_payment_month: null,
    extracted_record_date: null,
    extracted_ex_dividend_date: null,
    change_type: null,
    evidence_text: null,
    warning_message: "ai_found_no_events_in_strong_dividend_disclosure",
    status: "needs_manual_check",
    confidence_score: 0,
    raw_payload: {
      event_index: 0,
      no_events_found: true,
      ai_warnings: aiOutput.warnings,
      validation_warnings: validationWarnings,
      text_extraction_method: textExtraction.method,
      section_trimmed: textExtraction.sectionTrimmed,
      fallback_reason: textExtraction.fallbackReason,
      openai_usage: openaiUsage ?? null,
      disclosure_type: aiOutput.disclosure_type,
      needs_manual_check: aiOutput.needs_manual_check
    }
  };
}

// ---------------------------------------------------------------------------
// Strong disclosure detection
// ---------------------------------------------------------------------------

const STRONG_DIVIDEND_KEYWORDS = [
  "配当予想の修正",
  "剰余金の配当",
  "増配",
  "減配",
  "無配",
  "復配"
];

export function isStrongDividendDisclosure(title: string, disclosureType: string): boolean {
  const strongTypes = new Set([
    "dividend_forecast_revision",
    "dividend_decision",
    "correction"
  ]);
  if (strongTypes.has(disclosureType)) return true;
  return STRONG_DIVIDEND_KEYWORDS.some((kw) => title.includes(kw));
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

/**
 * Executes the parse_disclosure_pdf_ai handler for a single job.
 * This is the core logic, injectable via dependencies for testing.
 */
export async function executeParseDisclosurePdfAi(
  job: JobRow,
  deps: AiParseDependencies
): Promise<void> {
  const disclosureId = resolvePayloadString(
    job.payload,
    "disclosureId",
    "disclosure_id"
  );
  if (!disclosureId) {
    throw new JobHandlerError("invalid_payload:missing_disclosure_id", {
      retryable: false
    });
  }

  // Fetch disclosure
  const disclosure = await deps.fetchDisclosureForParse(disclosureId);

  // Invalid dependency state: no storage_path means PDF was never downloaded
  if (!disclosure.storage_path) {
    throw new JobHandlerError(
      "invalid_dependency_state:missing_storage_path",
      { retryable: false }
    );
  }

  // Update attempt counter
  await deps.updateDisclosureParseAttempt(
    disclosureId,
    disclosure.ai_parse_attempts + 1,
    ""
  );

  // Download PDF bytes from storage
  let pdfBytes: Uint8Array;
  try {
    pdfBytes = await deps.downloadPdf(disclosure.storage_path);
  } catch (error) {
    throw new JobHandlerError(
      `pdf_download_failed:${error instanceof Error ? error.message : String(error)}`,
      { cause: error }
    );
  }

  // Extract text / determine input method
  const textExtraction = prepareTextForAI(pdfBytes);

  // Build prompt
  const disclosureType = disclosure.disclosure_type ?? "other";
  const promptText =
    textExtraction.method === "extracted_text"
      ? textExtraction.text
      : "[PDF bytes will be passed directly]";
  const prompt = buildPromptForDisclosure(
    disclosureType,
    disclosure.title,
    promptText
  );

  // Call OpenAI
  let aiResponse: OpenAIParseResponse;
  try {
    aiResponse = await deps.callOpenAI({
      disclosureTitle: disclosure.title,
      disclosureType,
      extractedText: textExtraction.method === "extracted_text" ? textExtraction.text : null,
      pdfBytes: textExtraction.method === "direct_pdf_fallback" ? pdfBytes : null,
      textExtractionMethod: textExtraction.method,
      model: deps.openaiModel ?? "gpt-4o"
    });
  } catch (error) {
    throw new JobHandlerError(
      `openai_call_failed:${error instanceof Error ? error.message : String(error)}`,
      { cause: error }
    );
  }

  // Parse JSON from AI response
  let parsedOutput: unknown;
  try {
    // Extract JSON from the response text (may be wrapped in markdown code blocks)
    const jsonText = extractJsonFromText(aiResponse.rawText);
    parsedOutput = JSON.parse(jsonText);
  } catch {
    throw new JobHandlerError(
      "ai_output_invalid_json:failed_to_parse_response",
      { retryable: false }
    );
  }

  // Validate the parsed output
  const disclosureTicker = resolveDisclosureTicker(disclosure);
  const validation = validateAiOutput(parsedOutput, disclosureTicker);
  if (!validation.valid) {
    throw new JobHandlerError(
      `ai_output_validation_failed:${validation.error}`,
      { retryable: false }
    );
  }

  const { output: aiOutput, warnings: validationWarnings } = validation;
  const strongDisclosure = isStrongDividendDisclosure(disclosure.title, disclosureType);

  if (aiOutput.events.length === 0) {
    if (strongDisclosure || aiOutput.needs_manual_check) {
      // Create a manual-check row for strong disclosures with no events
      const manualCheckRow = buildNoEventsManualCheckRow({
        disclosure,
        aiOutput,
        validationWarnings,
        textExtraction,
        openaiUsage: aiResponse.usage
      });
      await deps.upsertDividendReviews([manualCheckRow]);
    }
    // Non-strong disclosures with no events: no review created
    // raw_payload.no_dividend_info_found = true is handled by marking no review rows
  } else {
    // Build and upsert one review row per event
    const reviewRows = buildReviewRows({
      disclosure,
      aiOutput,
      validationWarnings,
      textExtraction,
      openaiUsage: aiResponse.usage
    });
    await deps.upsertDividendReviews(reviewRows);
  }

  // Mark disclosure as parsed
  await deps.updateDisclosureParsed(disclosureId);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractJsonFromText(text: string): string {
  // Strip markdown code blocks if present
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) return codeBlockMatch[1].trim();
  // Look for the first { ... } block
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    return text.slice(start, end + 1);
  }
  return text.trim();
}

function resolveDisclosureTicker(disclosure: DisclosureForParse): string | null {
  const stock = Array.isArray(disclosure.stocks)
    ? disclosure.stocks[0]
    : disclosure.stocks;
  if (stock?.ticker) return stock.ticker;
  const raw = disclosure.raw_payload?.ticker;
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Re-export the prompt building for use in tests (avoids _unused_ warning)
export { buildDividendDisclosurePrompt, buildEarningsReleasePrompt };
