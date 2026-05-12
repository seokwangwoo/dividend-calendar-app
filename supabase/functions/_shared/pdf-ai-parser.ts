/**
 * Phase 04: AI PDF Parsing
 *
 * Parses downloaded TDnet PDFs into validated dividend review candidates.
 * Extracts text from PDFs first, then sends to OpenAI Responses API.
 * Falls back to direct PDF input only when text extraction is unusable.
 */

import { JobHandlerError, resolvePayloadString, type JobRow, type JsonRecord } from "./process-jobs.ts";
import { isPositionedTextItem, type PositionedTextItem, extractStructuredPageText } from "./pdf-table-extractor.ts";

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
  logAiParseCost(
    disclosureId: string,
    usage: { input_tokens: number; output_tokens: number; cost_usd: number }
  ): Promise<void>;
  /** OpenAI model name to use for text-only prompts. Required to avoid Deno.env in shared module. */
  openaiModel?: string;
  /** OpenAI model name to use when sending PDFs directly. */
  openaiPdfModel?: string;
};

export type DisclosureForParse = {
  id: string;
  stock_id: string | null;
  external_id: string | null;
  title: string;
  disclosure_type: string | null;
  source_type?: string | null;
  document_url?: string | null;
  storage_path: string | null;
  published_at: string | null;
  ai_parse_attempts: number;
  raw_payload: JsonRecord;
  stocks?: {
    ticker: string | null;
    name?: string | null;
    id: string | null;
  } | {
    ticker: string | null;
    name?: string | null;
    id: string | null;
  }[] | null;
};

export type OpenAIParseRequest = {
  disclosureTitle: string;
  disclosureType: string;
  prompt: string;
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
  extracted_payment_year: number | null;
  extracted_payment_month: number | null;
  extracted_fiscal_month: number | null;
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

export type AiChangeType =
  | "increase"
  | "decrease"
  | "no_dividend"
  | "resumed"
  | "special"
  | "commemorative"
  | "unchanged"
  | "forecast_revision"
  | "data_update"
  | "none"
  | "unknown";

export type AiEventType =
  | "interim"
  | "year_end"
  | "annual_total"
  | "special"
  | "commemorative"
  | "other";

export type AiFiscalPeriod =
  | "interim"
  | "year_end"
  | "q1"
  | "q2"
  | "q3"
  | "q4"
  | "annual"
  | "unknown";

export type AiDividendType =
  | "ordinary"
  | "special"
  | "commemorative"
  | "mixed"
  | "no_dividend"
  | "unknown";

export type AiEventStatus =
  | "estimated"
  | "forecast"
  | "revised_forecast"
  | "resolved"
  | "confirmed"
  | "paid"
  | "undecided"
  | "unknown";

export type AiDividendEvent = {
  event_type?: AiEventType;
  fiscal_year: number | null;
  fiscal_month: number | null;
  fiscal_period: AiFiscalPeriod;
  dividend_type: AiDividendType;
  status: AiEventStatus;
  change_type: AiChangeType;
  dividend_per_share: number | null;
  previous_dividend_per_share: number | null;
  currency: "JPY";
  record_date: string | null;
  ex_dividend_date: string | null;
  expected_payment_year: number | null;
  expected_payment_month: number | null;
  payment_date_text: string | null;
  reason: string | null;
  evidence_text: string;
  confidence_score: number;
  components?: {
    ordinary: number | null;
    special: number | null;
    commemorative: number | null;
  } | null;
};

export type AiParseOutput = {
  stock_ticker: string;
  stock_name: string | null;
  source: {
    source_type: "tdnet" | "edinet" | "company_ir" | "manual" | "unknown";
    source_url: string | null;
    source_published_at: string | null;
    disclosure_title: string | null;
  };
  events: AiDividendEvent[];
  warnings: string[];
  // Legacy fields retained for compatibility with older outputs during rollout.
  ticker?: string | null;
  company_name?: string | null;
  disclosure_title?: string;
  disclosure_type?: string;
  fiscal_year?: number | null;
  currency?: "JPY" | string;
  needs_manual_check?: boolean;
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
  "forecast_revision",
  "data_update",
  "none",
  "unknown"
]);

const VALID_STATUS_VALUES = new Set<string>([
  "estimated",
  "forecast",
  "revised_forecast",
  "resolved",
  "confirmed",
  "paid",
  "undecided",
  "unknown"
]);

const VALID_FISCAL_PERIODS = new Set<string>([
  "interim",
  "year_end",
  "q1",
  "q2",
  "q3",
  "q4",
  "annual",
  "unknown"
]);

const VALID_DIVIDEND_TYPES = new Set<string>([
  "ordinary",
  "special",
  "commemorative",
  "mixed",
  "no_dividend",
  "unknown"
]);

/**
 * Dividend amounts above this threshold (JPY per share) are flagged as suspicious
 * and trigger confidence reduction and high-priority routing.
 * 1000 JPY/share covers most real-world Japanese dividends with a comfortable margin.
 */
const SUSPICIOUS_DIVIDEND_THRESHOLD = 1000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ---------------------------------------------------------------------------
// Expected payment year/month inference
// ---------------------------------------------------------------------------

/**
 * Derives expected payment year and month from fiscal_year, fiscal_month, and event_type
 * when the AI could not extract them directly from the disclosure text.
 *
 * Rules are based on typical Japanese corporate dividend patterns:
 * - year_end: usually paid ~3 months after fiscal month end
 * - interim: usually paid ~3 months before fiscal month end (or during the fiscal year)
 */
export function deriveExpectedPaymentYearMonth(event: {
  fiscal_year: number | null;
  fiscal_month: number | null;
  event_type?: AiEventType;
  fiscal_period?: AiFiscalPeriod;
}): { year: number | null; month: number | null } {
  const fiscalYear = event.fiscal_year;
  const fiscalMonth = event.fiscal_month;
  const eventType = event.event_type ?? mapFiscalPeriodToEventType(event.fiscal_period ?? "unknown");

  if (fiscalYear == null || fiscalMonth == null) {
    return { year: null, month: null };
  }

  // Only infer for interim and year_end
  if (eventType !== "interim" && eventType !== "year_end") {
    return { year: null, month: null };
  }

  if (eventType === "year_end") {
    switch (fiscalMonth) {
      case 3:
        return { year: fiscalYear, month: 6 };
      case 9:
        return { year: fiscalYear, month: 12 };
      case 12:
        return { year: fiscalYear + 1, month: 3 };
      default: {
        let month = fiscalMonth + 3;
        let year = fiscalYear;
        if (month > 12) {
          month -= 12;
          year += 1;
        }
        return { year, month };
      }
    }
  }

  // interim
  switch (fiscalMonth) {
    case 3:
      return { year: fiscalYear - 1, month: 12 };
    case 9:
      return { year: fiscalYear, month: 6 };
    case 12:
      return { year: fiscalYear, month: 9 };
    default: {
      let month = fiscalMonth - 3;
      let year = fiscalYear;
      if (month <= 0) {
        month += 12;
        year -= 1;
      }
      return { year, month };
    }
  }
}

function mapFiscalPeriodToEventType(period: AiFiscalPeriod): AiEventType {
  switch (period) {
    case "interim":
    case "q2":
      return "interim";
    case "year_end":
      return "year_end";
    case "annual":
      return "annual_total";
    case "special":
    case "commemorative":
    case "other":
    case "q1":
    case "q3":
    case "q4":
    case "unknown":
      return "other";
  }
}

// ---------------------------------------------------------------------------
// Prompt templates
// ---------------------------------------------------------------------------

export type DisclosurePromptContext = {
  stockTicker: string | null;
  stockName: string | null;
  disclosureTitle: string | null;
  publishedAt: string | null;
  sourceUrl: string | null;
  sourceType: string | null;
};

function buildDividendExtractionPrompt(text: string, context: DisclosurePromptContext): string {
  const sourceType = context.sourceType ?? "unknown";
  const stockTicker = context.stockTicker ?? "unknown";
  const stockName = context.stockName ?? "null";
  const disclosureTitle = context.disclosureTitle ?? "null";
  const publishedAt = context.publishedAt ?? "null";
  const sourceUrl = context.sourceUrl ?? "null";

  return `당신은 일본 상장사 공시에서 배당 정보를 추출하는 전문 데이터 추출 AI입니다.

목표는 공시 원문에서 배당 관련 이벤트를 찾아, 앱 DB에 저장 가능한 JSON 형식으로 변환하는 것입니다.

중요 원칙:
1. 공시 1개에서 배당 이벤트가 여러 개 나올 수 있습니다.
2. 중간배당, 기말배당, 특별배당, 기념배당, 무배, 복배, 배당예상 수정 등을 각각 별도 이벤트로 분리해야 합니다.
3. "예상", "수정 예상", "확정", "결의", "지급 완료", "미정"을 반드시 구분해야 합니다.
4. 추정하지 말고, 공시 원문에 근거가 있는 값만 추출하세요.
5. 원문에 없는 값은 null로 둡니다.
6. 금액 단위는 반드시 1주당 배당금 기준으로 추출하세요.
7. 일본어 표현을 기준으로 판단하되, 최종 출력은 지정된 enum 값을 사용하세요.
8. 같은 공시 안에 "중間配当の決定"과 "期末配当予想の修正"이 함께 있으면 최소 2개의 이벤트로 분리하세요.
9. 표 안의 "当期実績", "前回予想", "今回予想", "修正予想", "前期実績"을 구분하세요.
10. 과거 실적과 미래 예상이 함께 있을 경우, 사용자 캘린더에 영향을 주는 미래/현재 이벤트를 우선 추출하되, 확정된 당기 배당도 이벤트로 추출하세요.

입력으로 제공되는 공시 정보:
- stock_ticker: ${stockTicker}
- stock_name: ${stockName}
- disclosure_title: ${disclosureTitle}
- published_at: ${publishedAt}
- source_url: ${sourceUrl}
- source_type: ${sourceType}
- disclosure_text:
${text}

추출해야 할 배당 이벤트 필드:

{
  "stock_ticker": string,
  "stock_name": string | null,
  "source": {
    "source_type": "tdnet" | "edinet" | "company_ir" | "manual" | "unknown",
    "source_url": string | null,
    "source_published_at": string | null,
    "disclosure_title": string | null
  },
  "events": [
    {
      "fiscal_year": number | null,
      "fiscal_month": number | null,
      "fiscal_period": "interim" | "year_end" | "q1" | "q2" | "q3" | "q4" | "annual" | "unknown",
      "dividend_type": "ordinary" | "special" | "commemorative" | "mixed" | "no_dividend" | "unknown",
      "status": "estimated" | "forecast" | "revised_forecast" | "resolved" | "confirmed" | "paid" | "undecided" | "unknown",
      "change_type": "increase" | "decrease" | "unchanged" | "no_dividend" | "resumed" | "special" | "commemorative" | "forecast_revision" | "data_update" | "none" | "unknown",
      "dividend_per_share": number | null,
      "previous_dividend_per_share": number | null,
      "currency": "JPY",
      "record_date": string | null,
      "ex_dividend_date": string | null,
      "expected_payment_year": number | null,
      "expected_payment_month": number | null,
      "payment_date_text": string | null,
      "reason": string | null,
      "evidence_text": string,
      "confidence_score": number
    }
  ],
  "warnings": string[]
}

판단 기준:

1. fiscal_period 판단
- "中間配当", "第2四半期末", "第2四半期" → "interim"
- "期末配当", "期末" → "year_end"
- "第1四半期末" → "q1"
- "第2四半期末" → "q2" 또는 앱 기준상 중간배당이면 "interim"
- "第3四半期末" → "q3"
- "第4四半期末" → "q4"
- "年間配当", "合計"만 있고 개별 기간이 없으면 "annual"
- 판단 불가 → "unknown"

2. dividend_type 판단
- 일반 배당만 있으면 "ordinary"
- "特別配当" → "special"
- "記念配当" → "commemorative"
- 보통배당과 특별/기념배당이 함께 있으면 "mixed"
- "無配" 또는 배당금 0원이 명시되면 "no_dividend"
- 판단 불가 → "unknown"

3. status 판단
- "配当予想", "予想" → "forecast"
- 앱 또는 데이터 제공자가 추정한 값이면 "estimated"
- "配当予想の修正", "修正予想", "前回予想から修正" → "revised_forecast"
- "剰余金の配当", "取締役会決議", "決定" → "resolved" 또는 "confirmed"
- "支払開始日"이 지났거나 "支払済"로 명시되면 "paid"
- "未定" → "undecided"
- 판단 불가 → "unknown"

4. change_type 판단
- previous_dividend_per_share와 dividend_per_share를 비교합니다.
- 새 금액 > 이전 금액 → "increase"
- 새 금액 < 이전 금액 → "decrease"
- 새 금액 = 이전 금액 → "unchanged"
- 새 금액이 0 또는 무배 전환 → "no_dividend"
- 이전이 0 또는 무배였고 새 금액이 0보다 크면 → "resumed"
- 특별배당 발생 → "special"
- 기념배당 발생 → "commemorative"
- 금액 비교가 불가능하지만 예상 수정 공시이면 → "forecast_revision"
- 날짜나 지급월만 변경되었으면 → "data_update"
- 변경 없음 → "none"
- 판단 불가 → "unknown"

5. 금액 추출 규칙
- 반드시 1주당 배당금만 추출하세요.
- "1株当たり配当金", "１株当たり配当金", "円銭" 등의 표를 우선 사용하세요.
- "15円00銭"은 15.00으로 변환하세요.
- "0円00銭"은 0으로 변환하세요.
- "未定"은 null로 두고 status를 "undecided"로 설정하세요.
- 연간 합계만 있는 경우 fiscal_period를 "annual"로 두세요.
- 중간/기말이 분리되어 있으면 각각 별도 이벤트로 추출하세요.

6. 날짜 추출 규칙
- "基準日" → record_date
- "権利落ち日" 또는 명확한 ex-dividend date → ex_dividend_date
- "支払開始予定日", "効力発生日", "支払開始日" → exact date가 있으면 expected_payment_year(YYYY)와 expected_payment_month(1~12)를 추출하세요.
- 정확한 날짜가 없고 "6月下旬", "12月予定"처럼 월만 있으면 expected_payment_month에 월 숫자를 넣고 payment_date_text에 원문을 넣으세요.
- 연도가 애매하면 fiscal_year, published_at, 원문 문맥을 보고 판단하되, 확실하지 않으면 expected_payment_year = null로 두고 warnings에 이유를 쓰세요.
- fiscal_month(決算月)는 공시 원문에서 명시되면 1~12 범위의 숫자로 추출하고, 없으면 null로 두세요.

7. evidence_text 규칙
- 각 이벤트마다 판단 근거가 되는 원문 일부를 반드시 넣으세요.
- 너무 길게 복사하지 말고 핵심 문장 또는 표 행만 넣으세요.
- evidence_text만 봐도 왜 해당 이벤트가 생성되었는지 알 수 있어야 합니다.

8. confidence_score 기준
- 0.90 이상: 표와 문구가 명확하고 금액/기간/상태가 모두 확실함
- 0.70 ~ 0.89: 대부분 확실하지만 일부 날짜나 기간이 애매함
- 0.50 ~ 0.69: 배당 관련 내용은 있으나 기간/상태 판단이 불완전함
- 0.50 미만: 배당 이벤트 가능성은 있으나 검수 필요성이 높음

출력 규칙:
- 반드시 JSON만 출력하세요.
- 설명 문장을 JSON 밖에 쓰지 마세요.
- Markdown 코드블록을 쓰지 마세요.
- events가 없으면 빈 배열을 반환하세요.
- 불확실한 내용은 warnings에 적으세요.
- enum에 없는 값을 만들지 마세요.`;
}

export function buildPromptForDisclosure(params: {
  context: DisclosurePromptContext;
  text: string;
}): string {
  return buildDividendExtractionPrompt(params.text, params.context);
}

function buildPromptForLegacyDisclosure(title: string, text: string): string {
  return buildDividendExtractionPrompt(text, {
    stockTicker: null,
    stockName: null,
    disclosureTitle: title,
    publishedAt: null,
    sourceUrl: null,
    sourceType: "unknown"
  });
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

/**
 * Keywords that mark the start of dividend-relevant content.
 * Includes earnings-release dividend table row labels (第2四半期末, 当期実績, etc.)
 * so that 決算短信 dividend tables are captured even when not under a named heading.
 */
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
  "支払予定日",
  // Earnings-release dividend table row labels
  "第2四半期末",
  "第1四半期末",
  "第3四半期末",
  "当期実績",
  "前期実績",
  "次期予想",
  "合計",
  "年間"
];

/**
 * Section-end markers for earnings releases — headings that signal the end
 * of the dividend section and start of unrelated financial metrics.
 * When we are inside a dividend section and hit one of these headings,
 * we stop collecting lines to avoid sending irrelevant P/L figures to AI.
 */
const EARNINGS_NON_DIVIDEND_HEADINGS = [
  "経営成績",
  "財務状態",
  "キャッシュ・フロー",
  "売上高",
  "営業利益",
  "経常利益",
  "当期純利益",
  "純資産",
  "総資産"
];

/** Minimum character count for text to be considered usable */
const MIN_USABLE_TEXT_LENGTH = 50;

type PdfTextExtractionResult = {
  text: string;
  method: "pdfjs" | "legacy" | "none";
};

type PdfJsModule = {
  getDocument: (params: { data: Uint8Array; useWorkerFetch: boolean }) => {
    promise: Promise<{
      numPages: number;
      getPage(pageNumber: number): Promise<{
        getTextContent(options: { disableCombineTextItems: boolean }): Promise<{
          items: unknown[];
        }>;
      }>;
    }>;
  };
};

let pdfJsModulePromise: Promise<PdfJsModule> | null = null;

/**
 * Extracts text from a PDF byte array.
 * Prefers PDF.js page text extraction so it can handle compressed streams and
 * object streams that the legacy raw regex extractor misses.
 */
export async function extractTextFromPdf(pdfBytes: Uint8Array): Promise<PdfTextExtractionResult> {
  const pdfjsText = await extractTextWithPdfjs(pdfBytes);
  if (pdfjsText.trim().length > 0) {
    return { text: pdfjsText, method: "pdfjs" };
  }

  const legacyText = extractTextFromPdfLegacy(pdfBytes);
  if (legacyText.trim().length > 0) {
    return { text: legacyText, method: "legacy" };
  }

  return { text: "", method: "none" };
}

async function extractTextWithPdfjs(pdfBytes: Uint8Array): Promise<string> {
  try {
    const pdfjsLib = await loadPdfJsModule();
    const loadingTask = pdfjsLib.getDocument({
      data: pdfBytes,
      useWorkerFetch: false
    });
    const pdf = await loadingTask.promise;
    const pageTexts: string[] = [];

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent({
        disableCombineTextItems: false
      });

      const positionedItems: PositionedTextItem[] = content.items
        .filter(isPositionedTextItem)
        .map((item) => ({
          str: item.str,
          x: item.transform?.[4] ?? 0,
          y: item.transform?.[5] ?? 0,
          width: item.width ?? 0,
          hasEOL: item.hasEOL ?? false,
        }));

      const pageText = extractStructuredPageText(positionedItems).trim();
      if (pageText.length > 0) {
        pageTexts.push(pageText);
      }
    }

    return pageTexts.join("\n\n").trim();
  } catch {
    return "";
  }
}

async function loadPdfJsModule(): Promise<PdfJsModule> {
  if (!pdfJsModulePromise) {
    pdfJsModulePromise = (async () => {
      const specifiers = typeof Deno !== "undefined"
        ? ["npm:pdfjs-dist/legacy/build/pdf.mjs", "pdfjs-dist/legacy/build/pdf.mjs"]
        : ["pdfjs-dist/legacy/build/pdf.mjs", "npm:pdfjs-dist/legacy/build/pdf.mjs"];

      let lastError: unknown;
      for (const specifier of specifiers) {
        try {
          return (await import(specifier)) as PdfJsModule;
        } catch (error) {
          lastError = error;
        }
      }

      throw lastError instanceof Error
        ? lastError
        : new Error("Failed to load pdfjs-dist");
    })();
  }

  return pdfJsModulePromise;
}

function extractTextFromPdfLegacy(pdfBytes: Uint8Array): string {
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
 *
 * For earnings releases (決算短信), the function focuses on the dividend table
 * section (配当の状況 / 1株当たり配当金) and stops when it encounters an
 * unrelated financial-metrics heading. This prevents irrelevant P/L figures
 * from being sent to the AI model.
 *
 * Returns the trimmed text and whether trimming occurred.
 */
export function trimToDividendSections(text: string, options: {
  /** Pass true when the disclosure type is earnings_release or earnings_revision */
  earningsRelease?: boolean;
} = {}): {
  trimmedText: string;
  sectionTrimmed: boolean;
} {
  const lines = text.split(/[\n\r]+/);
  const relevantLines: string[] = [];
  let inDividendSection = false;
  let sectionTrimmed = false;
  // Track how many consecutive non-dividend heading lines we see while inside a section
  // to detect when we've left the dividend table
  let consecutiveNonDividendLines = 0;
  const MAX_NON_DIVIDEND_LINES = options.earningsRelease ? 5 : 30;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const isDividendKeyword = DIVIDEND_SECTION_KEYWORDS.some((kw) =>
      trimmed.includes(kw)
    );

    if (isDividendKeyword) {
      inDividendSection = true;
      sectionTrimmed = true;
      consecutiveNonDividendLines = 0;
    }

    if (inDividendSection) {
      // For earnings releases: stop when we hit an unrelated financial section heading
      if (options.earningsRelease) {
        const isNonDividendHeading = EARNINGS_NON_DIVIDEND_HEADINGS.some((h) =>
          trimmed.includes(h)
        );
        if (isNonDividendHeading && !isDividendKeyword) {
          // If the same line mentions a dividend keyword too, keep going.
          // Otherwise, break to avoid sending unrelated financials to AI.
          break;
        }
      }

      relevantLines.push(trimmed);

      // Track lines without dividend keywords to detect section end
      if (!isDividendKeyword) {
        consecutiveNonDividendLines++;
        if (consecutiveNonDividendLines > MAX_NON_DIVIDEND_LINES) {
          // Likely left the dividend section
          break;
        }
      } else {
        consecutiveNonDividendLines = 0;
      }

      // Hard cap to avoid sending extremely long sections to AI
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
 * @param pdfBytes Raw PDF bytes.
 * @param disclosureType Optional disclosure type for smarter section trimming.
 */
export async function prepareTextForAI(pdfBytes: Uint8Array, disclosureType?: string): Promise<TextExtractionResult> {
  const { text: rawText } = await extractTextFromPdf(pdfBytes);
  const earningsRelease =
    disclosureType === "earnings_release" || disclosureType === "earnings_revision";
  const { trimmedText, sectionTrimmed } = trimToDividendSections(rawText, { earningsRelease });

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

function normalizeSourceType(value: unknown): AiParseOutput["source"]["source_type"] | null {
  if (
    value === "tdnet" ||
    value === "edinet" ||
    value === "company_ir" ||
    value === "manual" ||
    value === "unknown"
  ) {
    return value;
  }
  return null;
}

function normalizeString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function normalizeNullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : normalizeString(value);
}

function normalizeFiscalPeriod(value: unknown): AiFiscalPeriod | null {
  if (
    value === "interim" ||
    value === "year_end" ||
    value === "q1" ||
    value === "q2" ||
    value === "q3" ||
    value === "q4" ||
    value === "annual" ||
    value === "unknown"
  ) {
    return value;
  }
  return null;
}

function normalizeDividendType(value: unknown): AiDividendType | null {
  if (
    value === "ordinary" ||
    value === "special" ||
    value === "commemorative" ||
    value === "mixed" ||
    value === "no_dividend" ||
    value === "unknown"
  ) {
    return value;
  }
  return null;
}

function normalizeEventStatus(value: unknown): AiEventStatus | null {
  if (
    value === "estimated" ||
    value === "forecast" ||
    value === "revised_forecast" ||
    value === "resolved" ||
    value === "confirmed" ||
    value === "paid" ||
    value === "undecided" ||
    value === "unknown"
  ) {
    return value;
  }
  return null;
}

function mapLegacyEventTypeToFiscalPeriod(eventType: unknown): AiFiscalPeriod {
  switch (eventType) {
    case "interim":
      return "interim";
    case "year_end":
      return "year_end";
    case "annual_total":
      return "annual";
    case "special":
    case "commemorative":
    case "other":
      return "unknown";
    default:
      return "unknown";
  }
}

function mapLegacyEventTypeToDividendType(eventType: unknown): AiDividendType {
  switch (eventType) {
    case "special":
      return "special";
    case "commemorative":
      return "commemorative";
    case "no_dividend":
      return "no_dividend";
    case "interim":
    case "year_end":
    case "annual_total":
    case "other":
      return "ordinary";
    default:
      return "unknown";
  }
}

function normalizeEvent(rawEvent: unknown): AiDividendEvent | null {
  if (!isRecord(rawEvent)) return null;

  if (rawEvent.event_type !== undefined) {
    const legacyEventType = String(rawEvent.event_type);
    const legacyValidTypes = new Set([
      "interim",
      "year_end",
      "annual_total",
      "special",
      "commemorative",
      "other"
    ]);
    if (!legacyValidTypes.has(legacyEventType)) return null;
  }

  const fiscalPeriod =
    rawEvent.event_type !== undefined
      ? mapLegacyEventTypeToFiscalPeriod(rawEvent.event_type)
      : normalizeFiscalPeriod(rawEvent.fiscal_period) ??
        mapLegacyEventTypeToFiscalPeriod(rawEvent.event_type);
  const dividendType =
    rawEvent.event_type !== undefined
      ? mapLegacyEventTypeToDividendType(rawEvent.event_type)
      : normalizeDividendType(rawEvent.dividend_type) ??
        mapLegacyEventTypeToDividendType(rawEvent.event_type);
  const status = normalizeEventStatus(rawEvent.status);

  const currency = rawEvent.currency === "JPY" ? "JPY" : null;
  const confidenceScore = typeof rawEvent.confidence_score === "number" ? rawEvent.confidence_score : null;

  if (!fiscalPeriod || !dividendType || !status || !currency || confidenceScore === null) {
    return null;
  }

  const components = isRecord(rawEvent.components)
    ? {
        ordinary: typeof rawEvent.components.ordinary === "number" ? rawEvent.components.ordinary : null,
        special: typeof rawEvent.components.special === "number" ? rawEvent.components.special : null,
        commemorative:
          typeof rawEvent.components.commemorative === "number" ? rawEvent.components.commemorative : null
      }
    : undefined;

  return {
    fiscal_year:
      rawEvent.fiscal_year === null || rawEvent.fiscal_year === undefined
        ? null
        : typeof rawEvent.fiscal_year === "number" && Number.isInteger(rawEvent.fiscal_year)
          ? rawEvent.fiscal_year
          : null,
    fiscal_period: fiscalPeriod,
    dividend_type: dividendType,
    status,
    change_type: VALID_CHANGE_TYPES.has(String(rawEvent.change_type))
      ? (rawEvent.change_type as AiChangeType)
      : "unknown",
    dividend_per_share:
      rawEvent.dividend_per_share === null || rawEvent.dividend_per_share === undefined
        ? null
        : typeof rawEvent.dividend_per_share === "number" && rawEvent.dividend_per_share >= 0
          ? rawEvent.dividend_per_share
          : null,
    previous_dividend_per_share:
      rawEvent.previous_dividend_per_share === null ||
      rawEvent.previous_dividend_per_share === undefined
        ? null
        : typeof rawEvent.previous_dividend_per_share === "number" &&
            rawEvent.previous_dividend_per_share >= 0
          ? rawEvent.previous_dividend_per_share
          : null,
    currency,
    record_date: normalizeNullableString(rawEvent.record_date),
    ex_dividend_date: normalizeNullableString(rawEvent.ex_dividend_date),
    expected_payment_year:
      rawEvent.expected_payment_year === null || rawEvent.expected_payment_year === undefined
        ? null
        : typeof rawEvent.expected_payment_year === "number" &&
            Number.isInteger(rawEvent.expected_payment_year) &&
            rawEvent.expected_payment_year >= 2000 &&
            rawEvent.expected_payment_year <= 2100
          ? rawEvent.expected_payment_year
          : null,
    expected_payment_month:
      rawEvent.expected_payment_month === null || rawEvent.expected_payment_month === undefined
        ? null
        : typeof rawEvent.expected_payment_month === "number" &&
            Number.isInteger(rawEvent.expected_payment_month) &&
            rawEvent.expected_payment_month >= 1 &&
            rawEvent.expected_payment_month <= 12
          ? rawEvent.expected_payment_month
          : null,
    fiscal_month:
      rawEvent.fiscal_month === null || rawEvent.fiscal_month === undefined
        ? null
        : typeof rawEvent.fiscal_month === "number" &&
            Number.isInteger(rawEvent.fiscal_month) &&
            rawEvent.fiscal_month >= 1 &&
            rawEvent.fiscal_month <= 12
          ? rawEvent.fiscal_month
          : null,
    payment_date_text: normalizeNullableString(rawEvent.payment_date_text),
    reason: normalizeNullableString(rawEvent.reason),
    evidence_text: typeof rawEvent.evidence_text === "string" ? rawEvent.evidence_text : "",
    confidence_score: confidenceScore,
    components:
      components !== undefined
        ? components
        : rawEvent.components === null
          ? null
          : undefined
  };
}

function normalizeAiOutput(raw: Record<string, unknown>): AiParseOutput | null {
  const stockTicker =
    normalizeString(raw.stock_ticker) ??
    normalizeString(raw.ticker) ??
    null;
  if (!stockTicker) return null;

  const sourceRecord = isRecord(raw.source) ? raw.source : null;
  const source: AiParseOutput["source"] = {
    source_type:
      normalizeSourceType(sourceRecord?.source_type) ??
      normalizeSourceType(raw.source_type) ??
      "unknown",
    source_url:
      normalizeNullableString(sourceRecord?.source_url) ??
      normalizeNullableString(raw.source_url),
    source_published_at:
      normalizeNullableString(sourceRecord?.source_published_at) ??
      normalizeNullableString(raw.source_published_at) ??
      normalizeNullableString(raw.published_at),
    disclosure_title:
      normalizeNullableString(sourceRecord?.disclosure_title) ??
      normalizeNullableString(raw.disclosure_title)
  };

  const eventsRaw = Array.isArray(raw.events) ? raw.events : null;
  if (!eventsRaw) return null;
  const events: AiDividendEvent[] = [];
  for (const event of eventsRaw) {
    const normalized = normalizeEvent(event);
    if (!normalized) return null;
    events.push(normalized);
  }

  const warnings = Array.isArray(raw.warnings)
    ? raw.warnings.filter((item): item is string => typeof item === "string")
    : null;
  if (!warnings) return null;

  return {
    stock_ticker: stockTicker,
    stock_name:
      normalizeNullableString(raw.stock_name) ??
      normalizeNullableString(raw.company_name),
    source,
    events,
    warnings,
    ticker: normalizeNullableString(raw.ticker),
    company_name: normalizeNullableString(raw.company_name),
    disclosure_title: normalizeNullableString(raw.disclosure_title) ?? undefined,
    disclosure_type: normalizeNullableString(raw.disclosure_type) ?? undefined,
    fiscal_year:
      raw.fiscal_year === null || raw.fiscal_year === undefined
        ? undefined
        : typeof raw.fiscal_year === "number" && Number.isInteger(raw.fiscal_year)
          ? raw.fiscal_year
          : undefined,
    currency: normalizeNullableString(raw.currency) === "JPY" ? "JPY" : undefined,
    needs_manual_check:
      typeof raw.needs_manual_check === "boolean" ? raw.needs_manual_check : undefined
  };
}

function mapFiscalPeriodToReviewEventType(
  fiscalPeriod: AiFiscalPeriod,
  dividendType: AiDividendType
): "interim" | "year_end" | "annual_total" | "special" | "commemorative" | "other" {
  if (dividendType === "special") return "special";
  if (dividendType === "commemorative") return "commemorative";
  if (fiscalPeriod === "interim" || fiscalPeriod === "q2") return "interim";
  if (fiscalPeriod === "year_end") return "year_end";
  if (fiscalPeriod === "annual") return "annual_total";
  return "other";
}

export function validateAiOutput(
  raw: unknown,
  disclosureTicker: string | null
): ValidationResult {
  if (!isRecord(raw)) {
    return { valid: false, error: "ai_output_not_an_object" };
  }

  if (!Array.isArray(raw.events)) {
    return { valid: false, error: "ai_output_events_not_array" };
  }
  if (!Array.isArray(raw.warnings)) {
    return { valid: false, error: "ai_output_warnings_not_array" };
  }

  for (let i = 0; i < raw.events.length; i++) {
    const event = raw.events[i];
    if (!isRecord(event)) {
      return { valid: false, error: `ai_output_event_${i}_not_object` };
    }

    const hasLegacyEventType = event.event_type !== undefined;
    if (hasLegacyEventType) {
      const legacyEventType = String(event.event_type);
      const legacyValidTypes = new Set([
        "interim",
        "year_end",
        "annual_total",
        "special",
        "commemorative",
        "other"
      ]);
      if (!legacyValidTypes.has(legacyEventType)) {
        return {
          valid: false,
          error: `ai_output_event_${i}_invalid_event_type:${event.event_type}`
        };
      }
    }

    const currency = event.currency;
    if (currency !== "JPY") {
      return {
        valid: false,
        error: `ai_output_event_${i}_invalid_currency:${currency ?? "missing"}`
      };
    }

    if (
      event.status !== "estimated" &&
      event.status !== "forecast" &&
      event.status !== "revised_forecast" &&
      event.status !== "resolved" &&
      event.status !== "confirmed" &&
      event.status !== "paid" &&
      event.status !== "undecided" &&
      event.status !== "unknown"
    ) {
      return {
        valid: false,
        error: `ai_output_event_${i}_invalid_status:${event.status}`
      };
    }

    if (
      event.change_type !== "increase" &&
      event.change_type !== "decrease" &&
      event.change_type !== "no_dividend" &&
      event.change_type !== "resumed" &&
      event.change_type !== "special" &&
      event.change_type !== "commemorative" &&
      event.change_type !== "unchanged" &&
      event.change_type !== "forecast_revision" &&
      event.change_type !== "data_update" &&
      event.change_type !== "none" &&
      event.change_type !== "unknown"
    ) {
      return {
        valid: false,
        error: `ai_output_event_${i}_invalid_change_type:${event.change_type}`
      };
    }

    if (
      event.dividend_per_share !== null &&
      (typeof event.dividend_per_share !== "number" || event.dividend_per_share < 0)
    ) {
      return {
        valid: false,
        error: `ai_output_event_${i}_invalid_dividend_per_share`
      };
    }
    if (
      event.previous_dividend_per_share !== null &&
      (typeof event.previous_dividend_per_share !== "number" ||
        event.previous_dividend_per_share < 0)
    ) {
      return {
        valid: false,
        error: `ai_output_event_${i}_invalid_previous_dividend_per_share`
      };
    }
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
    for (const dateField of ["record_date", "ex_dividend_date"] as const) {
      const val = event[dateField];
      if (val !== null && val !== undefined && !DATE_RE.test(val)) {
        return {
          valid: false,
          error: `ai_output_event_${i}_invalid_${dateField}:${val}`
        };
      }
    }
    if (
      event.expected_payment_year !== null &&
      event.expected_payment_year !== undefined &&
      (typeof event.expected_payment_year !== "number" ||
        !Number.isInteger(event.expected_payment_year) ||
        event.expected_payment_year < 2000 ||
        event.expected_payment_year > 2100)
    ) {
      return {
        valid: false,
        error: `ai_output_event_${i}_invalid_expected_payment_year:${event.expected_payment_year}`
      };
    }
    if (
      event.expected_payment_month !== null &&
      event.expected_payment_month !== undefined &&
      (typeof event.expected_payment_month !== "number" ||
        !Number.isInteger(event.expected_payment_month) ||
        event.expected_payment_month < 1 ||
        event.expected_payment_month > 12)
    ) {
      return {
        valid: false,
        error: `ai_output_event_${i}_invalid_expected_payment_month:${event.expected_payment_month}`
      };
    }
    if (
      event.fiscal_month !== null &&
      event.fiscal_month !== undefined &&
      (typeof event.fiscal_month !== "number" ||
        !Number.isInteger(event.fiscal_month) ||
        event.fiscal_month < 1 ||
        event.fiscal_month > 12)
    ) {
      return {
        valid: false,
        error: `ai_output_event_${i}_invalid_fiscal_month:${event.fiscal_month}`
      };
    }
    if (typeof event.evidence_text !== "string" || event.evidence_text.trim().length === 0) {
      return {
        valid: false,
        error: `ai_output_event_${i}_missing_evidence_text`
      };
    }
  }

  const normalized = normalizeAiOutput(raw);
  if (!normalized) {
    return { valid: false, error: "ai_output_missing_required_fields" };
  }

  const validationWarnings: string[] = [];

  // Check ticker mismatch (warning, not failure)
  if (disclosureTicker) {
    const candidateTickers = new Set<string>();
    if (typeof raw.stock_ticker === "string") candidateTickers.add(raw.stock_ticker);
    if (typeof raw.ticker === "string") candidateTickers.add(raw.ticker);
    if (candidateTickers.size === 0 && normalized.stock_ticker) {
      candidateTickers.add(normalized.stock_ticker);
    }
    for (const candidate of candidateTickers) {
      if (candidate !== disclosureTicker) {
        validationWarnings.push(
          `ticker_mismatch:ai_said_${candidate}_disclosure_is_${disclosureTicker}`
        );
        break;
      }
    }
  }

  // Validate each event
  for (let i = 0; i < normalized.events.length; i++) {
    const event = normalized.events[i];
    if (!VALID_FISCAL_PERIODS.has(String(event.fiscal_period))) {
      return {
        valid: false,
        error: `ai_output_event_${i}_invalid_fiscal_period:${event.fiscal_period}`
      };
    }
    if (!VALID_DIVIDEND_TYPES.has(String(event.dividend_type))) {
      return {
        valid: false,
        error: `ai_output_event_${i}_invalid_dividend_type:${event.dividend_type}`
      };
    }
    if (!VALID_CHANGE_TYPES.has(String(event.change_type))) {
      return {
        valid: false,
        error: `ai_output_event_${i}_invalid_change_type:${event.change_type}`
      };
    }
    if (!VALID_STATUS_VALUES.has(String(event.status))) {
      return {
        valid: false,
        error: `ai_output_event_${i}_invalid_status:${event.status}`
      };
    }
    if (!VALID_EVENT_TYPES.has(mapFiscalPeriodToReviewEventType(event.fiscal_period, event.dividend_type))) {
      return {
        valid: false,
        error: `ai_output_event_${i}_invalid_review_event_type`
      };
    }
    if (event.dividend_per_share !== null && typeof event.dividend_per_share !== "number") {
      return {
        valid: false,
        error: `ai_output_event_${i}_invalid_dividend_per_share`
      };
    }
    if (event.previous_dividend_per_share !== null && typeof event.previous_dividend_per_share !== "number") {
      return {
        valid: false,
        error: `ai_output_event_${i}_invalid_previous_dividend_per_share`
      };
    }
    if (typeof event.confidence_score !== "number" || event.confidence_score < 0 || event.confidence_score > 1) {
      return {
        valid: false,
        error: `ai_output_event_${i}_invalid_confidence_score:${event.confidence_score}`
      };
    }
    for (const dateField of ["record_date", "ex_dividend_date"] as const) {
      const val = event[dateField];
      if (val !== null && val !== undefined && !DATE_RE.test(val)) {
        return {
          valid: false,
          error: `ai_output_event_${i}_invalid_${dateField}:${val}`
        };
      }
    }
    if (
      event.expected_payment_year !== null &&
      event.expected_payment_year !== undefined &&
      (typeof event.expected_payment_year !== "number" ||
        !Number.isInteger(event.expected_payment_year) ||
        event.expected_payment_year < 2000 ||
        event.expected_payment_year > 2100)
    ) {
      return {
        valid: false,
        error: `ai_output_event_${i}_invalid_expected_payment_year:${event.expected_payment_year}`
      };
    }
    if (
      event.expected_payment_month !== null &&
      event.expected_payment_month !== undefined &&
      (typeof event.expected_payment_month !== "number" ||
        !Number.isInteger(event.expected_payment_month) ||
        event.expected_payment_month < 1 ||
        event.expected_payment_month > 12)
    ) {
      return {
        valid: false,
        error: `ai_output_event_${i}_invalid_expected_payment_month:${event.expected_payment_month}`
      };
    }
    if (
      event.fiscal_month !== null &&
      event.fiscal_month !== undefined &&
      (typeof event.fiscal_month !== "number" ||
        !Number.isInteger(event.fiscal_month) ||
        event.fiscal_month < 1 ||
        event.fiscal_month > 12)
    ) {
      return {
        valid: false,
        error: `ai_output_event_${i}_invalid_fiscal_month:${event.fiscal_month}`
      };
    }
    if (typeof event.evidence_text !== "string" || event.evidence_text.trim().length === 0) {
      return {
        valid: false,
        error: `ai_output_event_${i}_missing_evidence_text`
      };
    }
  }

  return {
    valid: true,
    output: normalized,
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
  if (event.change_type === "no_dividend" || event.dividend_type === "no_dividend") {
    priority = "urgent";
  }

  // Decrease: high priority
  if (event.change_type === "decrease") {
    if (priority !== "urgent") priority = "high";
  }

  // Special or commemorative breakdowns need review
  if (event.dividend_type === "special" || event.dividend_type === "commemorative" || event.dividend_type === "mixed") {
    if (priority === "normal" || priority === "low") priority = "high";
  }
  if (
    event.components &&
    (event.components.special !== null || event.components.commemorative !== null)
  ) {
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

  // Missing payment year/month reduces confidence
  if (event.expected_payment_year === null && event.expected_payment_month === null) {
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

function deriveReviewEventType(event: AiDividendEvent): "interim" | "year_end" | "annual_total" | "special" | "commemorative" | "other" {
  return mapFiscalPeriodToReviewEventType(event.fiscal_period, event.dividend_type);
}

function resolveStockId(disclosure: DisclosureForParse): string | null {
  if (disclosure.stock_id) return disclosure.stock_id;
  const stock = Array.isArray(disclosure.stocks) ? disclosure.stocks[0] : disclosure.stocks;
  return stock?.id ?? null;
}

function resolveDisclosureStockName(disclosure: DisclosureForParse): string | null {
  const stock = Array.isArray(disclosure.stocks) ? disclosure.stocks[0] : disclosure.stocks;
  const stockName = stock?.name;
  if (typeof stockName === "string" && stockName.trim()) return stockName.trim();
  const raw = disclosure.raw_payload?.stock_name ?? disclosure.raw_payload?.company_name;
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
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
    source: AiParseOutput["source"];
    fiscalYear: number | null;
    disclosureType: string;
    needsManualCheck: boolean;
    totalEventsInResponse: number;
    textExtractionMethod: string;
    sectionTrimmed: boolean;
    fallbackReason: string | null;
    openaiUsage?: { input_tokens?: number; output_tokens?: number };
    isCorrection?: boolean;
    disclosureTitle?: string;
  };
  isPayable: boolean;
}): JsonRecord {
  const { event, eventIndex, adjustedConfidence, reviewPriority, warnings, disclosureLevel, isPayable } =
    params;

  return {
    event_index: eventIndex,
    event_type: deriveReviewEventType(event),
    fiscal_period: event.fiscal_period,
    dividend_type: event.dividend_type,
    status: event.status,
    change_type: event.change_type,
    raw_confidence_score: event.confidence_score,
    adjusted_confidence_score: adjustedConfidence,
    review_priority: reviewPriority,
    warnings,
    is_payable: isPayable,
    components: event.components ?? null,
    payment_date_text: event.payment_date_text,
    reason: event.reason,
    record_date: event.record_date ?? null,
    ex_dividend_date: event.ex_dividend_date ?? null,
    expected_payment_year: event.expected_payment_year ?? null,
    expected_payment_month: event.expected_payment_month ?? null,
    fiscal_month: event.fiscal_month ?? null,
    evidence_text: event.evidence_text,
    // Correction context: preserved for admin triage
    ...(disclosureLevel.isCorrection ? {
      correction_context: {
        is_correction: true,
        disclosure_title: disclosureLevel.disclosureTitle ?? null,
        disclosure_type: disclosureLevel.disclosureType,
        note: "This review originated from a correction disclosure. Verify against the original announcement."
      }
    } : {}),
    disclosure_ai_summary: {
      ticker: disclosureLevel.ticker,
      company_name: disclosureLevel.companyName,
      source: disclosureLevel.source,
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

  const disclosureType = disclosure.disclosure_type ?? aiOutput.disclosure_type ?? "other";
  const isCorrection = isCorrectionDisclosure(disclosure.title, disclosureType);
  const reviewDisclosureTitle = aiOutput.source.disclosure_title ?? disclosure.title;

  const disclosureLevelMeta = {
    ticker: aiOutput.stock_ticker ?? aiOutput.ticker ?? resolveDisclosureTicker(disclosure),
    companyName: aiOutput.stock_name ?? aiOutput.company_name ?? resolveDisclosureStockName(disclosure),
    source: aiOutput.source,
    fiscalYear: aiOutput.fiscal_year ?? null,
    disclosureType,
    needsManualCheck: aiOutput.needs_manual_check ?? false,
    totalEventsInResponse: aiOutput.events.length,
    textExtractionMethod: textExtraction.method,
    sectionTrimmed: textExtraction.sectionTrimmed,
    fallbackReason: textExtraction.fallbackReason,
    openaiUsage,
    isCorrection,
    disclosureTitle: reviewDisclosureTitle
  };

  const combinedWarnings = [
    ...validationWarnings,
    ...aiOutput.warnings,
    ...(isCorrection ? ["correction_disclosure:review_against_original"] : [])
  ];

  for (let i = 0; i < aiOutput.events.length; i++) {
    const event = aiOutput.events[i];
    const adjusted = adjustEventConfidenceAndPriority(event, combinedWarnings);
    const reviewEventType = deriveReviewEventType(event);
    const isPayable = isPayableEventType(reviewEventType) && event.dividend_type !== "no_dividend";

    // Correction disclosures always route to at least high priority
    let effectivePriority = adjusted.reviewPriority;
    if (isCorrection && (effectivePriority === "normal" || effectivePriority === "low")) {
      effectivePriority = "high";
    }

    const reviewStatus =
      effectivePriority === "urgent" || aiOutput.needs_manual_check
        ? "needs_manual_check"
        : "pending";

    const rawPayload = buildReviewRawPayload({
      eventIndex: i,
      event,
      adjustedConfidence: adjusted.adjustedConfidence,
      reviewPriority: effectivePriority,
      warnings: adjusted.warnings,
      disclosureLevel: disclosureLevelMeta,
      isPayable
    });

    // Apply inference if AI did not provide expected_payment_year/month
    let paymentYear = event.expected_payment_year;
    let paymentMonth = event.expected_payment_month;
    if (paymentYear == null && paymentMonth == null && event.fiscal_month != null) {
      const inferred = deriveExpectedPaymentYearMonth(event);
      paymentYear = inferred.year;
      paymentMonth = inferred.month;
    }

    rows.push({
      stock_id: stockId,
      disclosure_id: disclosure.id,
      fiscal_year: event.fiscal_year ?? aiOutput.fiscal_year ?? null,
      event_type: reviewEventType,
      extracted_dividend_per_share: event.dividend_per_share ?? null,
      previous_dividend_per_share: event.previous_dividend_per_share ?? null,
      extracted_payment_year: paymentYear,
      extracted_payment_month: paymentMonth,
      extracted_fiscal_month: event.fiscal_month ?? null,
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
    fiscal_year: aiOutput.fiscal_year ?? null,
    event_type: null,
    extracted_dividend_per_share: null,
    previous_dividend_per_share: null,
    extracted_payment_year: null,
    extracted_payment_month: null,
    extracted_fiscal_month: null,
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
      disclosure_type: disclosure.disclosure_type ?? aiOutput.disclosure_type ?? null,
      needs_manual_check: aiOutput.needs_manual_check ?? false,
      source: aiOutput.source
    }
  };
}

// ---------------------------------------------------------------------------
// Strong disclosure detection and correction handling
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

const CORRECTION_TITLE_KEYWORDS = ["訂正", "一部訂正"];

/**
 * Returns true when the disclosure is a correction announcement.
 * Correction disclosures are always routed to high priority and
 * their raw context is preserved in the review payload.
 */
export function isCorrectionDisclosure(title: string, disclosureType: string): boolean {
  if (disclosureType === "correction") return true;
  return CORRECTION_TITLE_KEYWORDS.some((kw) => title.includes(kw));
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

  // Build prompt
  const disclosureType = disclosure.disclosure_type ?? "other";
  const stockTicker = resolveDisclosureTicker(disclosure);
  const stockName = resolveDisclosureStockName(disclosure);
  const sourceType =
    normalizeSourceType(disclosure.source_type) ?? normalizeSourceType(disclosure.raw_payload?.source_type) ?? "unknown";

  // Extract text / determine input method, passing disclosure type for smarter section trimming
  const textExtraction = await prepareTextForAI(pdfBytes, disclosureType);
  const prompt = buildPromptForDisclosure({
    context: {
      stockTicker,
      stockName,
      disclosureTitle: disclosure.title,
      publishedAt: disclosure.published_at,
      sourceUrl: disclosure.document_url ?? null,
      sourceType
    },
    text:
      textExtraction.method === "extracted_text"
        ? textExtraction.text
        : "[PDF bytes will be passed directly]"
  });

  // Estimate input tokens before calling (conservative: 1 token per 2 chars for Japanese)
  const estimatedInputTokens = Math.ceil(prompt.length / 2);
  if (estimatedInputTokens > 50000) {
    throw new JobHandlerError(
      `excessive_tokens:estimated_${estimatedInputTokens}_tokens`,
      { retryable: false }
    );
  }

  // Call OpenAI
  let aiResponse: OpenAIParseResponse;
  try {
    const model =
      textExtraction.method === "direct_pdf_fallback"
        ? deps.openaiPdfModel ?? "gpt-4o-mini"
        : deps.openaiModel ?? "gpt-4o";

    aiResponse = await deps.callOpenAI({
      prompt,
      disclosureTitle: disclosure.title,
      disclosureType,
      extractedText: textExtraction.method === "extracted_text" ? textExtraction.text : null,
      pdfBytes: textExtraction.method === "direct_pdf_fallback" ? pdfBytes : null,
      textExtractionMethod: textExtraction.method,
      model
    });
  } catch (error) {
    throw new JobHandlerError(
      `openai_call_failed:${error instanceof Error ? error.message : String(error)}`,
      { cause: error }
    );
  }

  // Log tokens and cost
  const inputTokens = aiResponse.usage?.input_tokens ?? 0;
  const outputTokens = aiResponse.usage?.output_tokens ?? 0;
  const modelUsed =
    textExtraction.method === "direct_pdf_fallback"
      ? deps.openaiPdfModel ?? "gpt-4o-mini"
      : deps.openaiModel ?? "gpt-4o";

  // Approximate cost per 1M tokens (OpenAI pricing as of 2025-05)
  const costPerMInput = modelUsed.includes("gpt-4o-mini") ? 0.15 : 2.5;
  const costPerMOutput = modelUsed.includes("gpt-4o-mini") ? 0.6 : 10.0;
  const costUsd = (inputTokens * costPerMInput + outputTokens * costPerMOutput) / 1_000_000;

  await deps.logAiParseCost(disclosureId, {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cost_usd: costUsd
  });

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
