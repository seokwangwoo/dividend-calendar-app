export type YanoshinFormat = "json2" | "json";

export type YanoshinConditionInput = {
  mode?: string | null;
  date?: string | null;
  condition?: string | null;
};

export type NormalizedDisclosureCandidate = {
  externalId: string;
  sourceType: "tdnet";
  ticker: string | null;
  companyName: string | null;
  title: string;
  documentUrl: string | null;
  publishedAt: string | null;
  rawPayload: Record<string, unknown>;
};

export type ClassifiedDisclosureCandidate = NormalizedDisclosureCandidate & {
  disclosureType: DisclosureType;
  reviewPriority: ReviewPriority;
  accepted: boolean;
  skipReason: "keyword" | null;
};

export type DisclosureType =
  | "dividend_forecast_revision"
  | "dividend_decision"
  | "earnings_release"
  | "earnings_revision"
  | "correction"
  | "other";

export type ReviewPriority = "low" | "normal" | "high" | "urgent";

export const STRONG_DIVIDEND_KEYWORDS = [
  "配当予想",
  "配当予想の修正",
  "剰余金の配当",
  "期末配当",
  "中間配当",
  "増配",
  "減配",
  "無配",
  "復配",
  "特別配当",
  "記念配当"
] as const;

export const EARNINGS_KEYWORDS = ["決算短信", "四半期決算短信", "通期決算短信"] as const;
export const CORRECTION_KEYWORDS = ["訂正", "一部訂正", "修正"] as const;

const YANOSHIN_LIST_BASE_URL = "https://webapi.yanoshin.jp/webapi/tdnet/list";

function hasAnyKeyword(title: string, keywords: readonly string[]): boolean {
  return keywords.some((keyword) => title.includes(keyword));
}

function compactString(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function normalizePublishedAt(value: unknown): string | null {
  const text = compactString(value);
  if (!text) return null;
  const normalized = text.includes(" ") && !text.includes("T") ? text.replace(" ", "T") : text;
  const withZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(normalized) ? normalized : `${normalized}+09:00`;
  const date = new Date(withZone);
  return Number.isNaN(date.getTime()) ? text : date.toISOString();
}

function compactTicker(value: unknown): string | null {
  const text = compactString(value);
  return text ? text.toUpperCase() : null;
}

export function resolveYanoshinCondition(input: YanoshinConditionInput): string {
  const override = compactString(input.condition);
  if (override) return override;

  if (input.mode === "recent") return "recent";

  const date = compactString(input.date);
  if (date) return date.replaceAll("-", "");

  const mode = compactString(input.mode);
  return mode ?? "recent";
}

export function buildYanoshinListUrl(params: {
  condition: string;
  format?: YanoshinFormat;
  limit?: number | string | null;
}): string {
  const format = params.format ?? "json2";
  const limit = Number(params.limit ?? 300);
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.trunc(limit) : 300;
  const url = new URL(
    `${YANOSHIN_LIST_BASE_URL}/${encodeURIComponent(params.condition)}.${format}`
  );
  url.searchParams.set("limit", String(safeLimit));
  url.searchParams.set("hasXBRL", "0");
  return url.toString();
}

export function classifyDisclosureTitle(title: string): {
  accepted: boolean;
  disclosureType: DisclosureType;
  reviewPriority: ReviewPriority;
  skipReason: "keyword" | null;
} {
  const hasDividend = hasAnyKeyword(title, STRONG_DIVIDEND_KEYWORDS);
  const hasEarnings = hasAnyKeyword(title, EARNINGS_KEYWORDS);
  const hasCorrection = hasAnyKeyword(title, CORRECTION_KEYWORDS);
  const accepted = hasDividend || hasEarnings || (hasCorrection && hasDividend);

  if (!accepted) {
    return {
      accepted: false,
      disclosureType: "other",
      reviewPriority: "low",
      skipReason: "keyword"
    };
  }

  let disclosureType: DisclosureType = "other";
  if (title.includes("配当予想の修正")) {
    disclosureType = "dividend_forecast_revision";
  } else if (title.includes("剰余金の配当")) {
    disclosureType = "dividend_decision";
  } else if (hasEarnings) {
    disclosureType = "earnings_release";
  } else if (hasCorrection) {
    disclosureType = "correction";
  }

  let reviewPriority: ReviewPriority = "normal";
  if (hasCorrection && hasDividend) {
    reviewPriority = "high";
  } else if (
    title.includes("減配") ||
    title.includes("無配") ||
    title.includes("復配") ||
    title.includes("特別配当") ||
    title.includes("記念配当")
  ) {
    reviewPriority = "high";
  } else if (hasEarnings && !hasDividend) {
    reviewPriority = "low";
  }

  return { accepted, disclosureType, reviewPriority, skipReason: null };
}

function unwrapTdnetItem(item: unknown): unknown {
  if (!isRecord(item)) return item;
  // Yanoshin uses "TDnet" or "Tdnet" depending on response size
  if (isRecord(item.TDnet)) return item.TDnet;
  if (isRecord(item.Tdnet)) return item.Tdnet;
  return item;
}

export function extractYanoshinRows(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload.map(unwrapTdnetItem).filter(isRecord);
  }
  if (!isRecord(payload)) return [];

  if (Array.isArray(payload.items)) {
    return payload.items.map(unwrapTdnetItem).filter(isRecord);
  }

  if (Array.isArray(payload.TDnet)) return (payload.TDnet as unknown[]).filter(isRecord);
  if (isRecord(payload.TDnet)) return [payload.TDnet];
  if (Array.isArray(payload.Tdnet)) return (payload.Tdnet as unknown[]).filter(isRecord);
  if (isRecord(payload.Tdnet)) return [payload.Tdnet as Record<string, unknown>];
  return [];
}

export function normalizeYanoshinRow(row: Record<string, unknown>): NormalizedDisclosureCandidate {
  const ticker =
    compactTicker(row.code) ??
    compactTicker(row.company_code) ??
    compactTicker(row.companyCode) ??
    compactTicker(row.secCode) ??
    compactTicker(row.security_code);
  const publishedAt =
    normalizePublishedAt(row.pubdate) ??
    normalizePublishedAt(row.published_at) ??
    normalizePublishedAt(row.publishedAt) ??
    normalizePublishedAt(row.datetime) ??
    normalizePublishedAt(row.date);
  const documentUrl =
    compactString(row.document_url) ??
    compactString(row.documentUrl) ??
    compactString(row.url) ??
    compactString(row.pdf_url) ??
    compactString(row.pdfUrl);
  const title = compactString(row.title) ?? "Untitled disclosure";
  const companyName =
    compactString(row.company_name) ??
    compactString(row.companyName) ??
    compactString(row.name) ??
    compactString(row.company);
  const sourceId =
    compactString(row.id) ??
    compactString(row.disclosure_id) ??
    compactString(row.disclosureId) ??
    compactString(row.tdnet_id) ??
    compactString(row.tdnetId);

  return {
    externalId:
      sourceId ?? `tdnet:${publishedAt ?? "unknown"}:${ticker ?? "unknown"}:${documentUrl ?? title}`,
    sourceType: "tdnet",
    ticker,
    companyName,
    title,
    documentUrl,
    publishedAt,
    rawPayload: row
  };
}

export function normalizeCandidateInput(
  input: Record<string, unknown>
): NormalizedDisclosureCandidate {
  const ticker = compactTicker(input.ticker) ?? compactTicker(input.code);
  const publishedAt = normalizePublishedAt(input.publishedAt ?? input.published_at);
  const documentUrl = compactString(input.documentUrl ?? input.document_url);
  const title = compactString(input.title) ?? "Untitled disclosure";
  const externalId =
    compactString(input.externalId ?? input.external_id) ??
    `tdnet:${publishedAt ?? "unknown"}:${ticker ?? "unknown"}:${documentUrl ?? title}`;

  return {
    externalId,
    sourceType: "tdnet",
    ticker,
    companyName: compactString(input.companyName ?? input.company_name),
    title,
    documentUrl,
    publishedAt,
    rawPayload: input
  };
}

export function classifyCandidate(
  candidate: NormalizedDisclosureCandidate
): ClassifiedDisclosureCandidate {
  return {
    ...candidate,
    ...classifyDisclosureTitle(candidate.title)
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
