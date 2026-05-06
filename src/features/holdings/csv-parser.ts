export type CsvAccountType = "nisa" | "tokutei" | "general";

export interface ParsedCsvRow {
  ticker: string;
  quantity: number;
  averagePurchasePrice: number;
  accountType: CsvAccountType;
  memo?: string;
}

export interface CsvRowError {
  rowNumber: number;
  message: string;
}

export interface CsvParseResult {
  validRows: ParsedCsvRow[];
  errors: CsvRowError[];
}

const ACCOUNT_TYPE_ALIASES: Record<string, CsvAccountType> = {
  nisa: "nisa",
  NISA: "nisa",
  ニーサ: "nisa",
  tokutei: "tokutei",
  特定口座: "tokutei",
  general: "general",
  一般口座: "general"
};

export function normalizeAccountType(
  raw: string
): { value: CsvAccountType } | { error: string } {
  const trimmed = raw.trim();
  const normalized = ACCOUNT_TYPE_ALIASES[trimmed];
  if (normalized) {
    return { value: normalized };
  }
  return { error: `口座区分「${trimmed}」は未対応です。nisa, tokutei, general のいずれかを指定してください。` };
}

export async function parseCsvHoldings(
  csvBody: string,
  isTickerSupported: (ticker: string) => boolean | Promise<boolean>
): Promise<CsvParseResult> {
  const lines = csvBody.split(/\r?\n/);
  const validRows: ParsedCsvRow[] = [];
  const errors: CsvRowError[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    // Skip header and empty lines
    if (i === 0 && line.toLowerCase().includes("ticker")) {
      continue;
    }
    if (!line) {
      continue;
    }

    const parts = line.split(",");
    if (parts.length < 4) {
      errors.push({
        rowNumber: i + 1,
        message: "列数が不足しています。ticker, quantity, average_purchase_price, account_type が必要です。"
      });
      continue;
    }

    const [tickerRaw, quantityRaw, priceRaw, accountRaw, memoRaw] = parts;
    const ticker = tickerRaw.trim();
    const quantity = Number(quantityRaw.trim());
    const price = Number(priceRaw.trim());
    const accountResult = normalizeAccountType(accountRaw);

    if (!ticker) {
      errors.push({ rowNumber: i + 1, message: "ticker が空です。" });
      continue;
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      errors.push({
        rowNumber: i + 1,
        message: `数量は正の数値である必要があります。入力値: ${quantityRaw.trim()}`
      });
      continue;
    }

    if (!Number.isFinite(price) || price <= 0) {
      errors.push({
        rowNumber: i + 1,
        message: `平均取得単価は正の数値である必要があります。入力値: ${priceRaw.trim()}`
      });
      continue;
    }

    if ("error" in accountResult) {
      errors.push({ rowNumber: i + 1, message: accountResult.error });
      continue;
    }

    const supported = await isTickerSupported(ticker);
    if (!supported) {
      errors.push({
        rowNumber: i + 1,
        message: `ticker「${ticker}」は現在サポートされていません。`
      });
      continue;
    }

    validRows.push({
      ticker,
      quantity,
      averagePurchasePrice: price,
      accountType: accountResult.value,
      memo: memoRaw?.trim() || undefined
    });
  }

  return { validRows, errors };
}
