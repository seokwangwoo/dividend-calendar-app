export interface StooqPriceRow {
  ticker: string;
  price: number;
  updatedAt: Date;
}

export function normalizeStooqTicker(stooqSymbol: string): string | null {
  // Stooq Japanese stock symbols are formatted as "<ticker>.JP"
  // e.g., "9433.JP" -> "9433"
  const match = stooqSymbol.trim().match(/^(\d{4})\.JP$/i);
  if (!match) {
    return null;
  }
  return match[1];
}

export function parseStooqCsvRow(
  line: string,
  expectedDate: string
): StooqPriceRow | null {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }

  // Stooq CSV format: Symbol,Date,Open,High,Low,Close,Volume
  const parts = trimmed.split(",");
  if (parts.length < 6) {
    return null;
  }

  const symbol = parts[0].trim();
  const date = parts[1].trim();
  const closeStr = parts[5].trim();

  const ticker = normalizeStooqTicker(symbol);
  if (!ticker) {
    return null;
  }

  if (date !== expectedDate) {
    return null;
  }

  const closePrice = Number(closeStr);
  if (!Number.isFinite(closePrice) || closePrice <= 0) {
    return null;
  }

  return {
    ticker,
    price: closePrice,
    updatedAt: new Date(date + "T00:00:00+09:00")
  };
}

export function parseStooqCsv(
  csvBody: string,
  expectedDate: string
): { rows: StooqPriceRow[]; skipped: number } {
  const lines = csvBody.split(/\r?\n/);
  const rows: StooqPriceRow[] = [];
  let skipped = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip header
    if (i === 0 && line.toLowerCase().includes("symbol")) {
      continue;
    }
    const parsed = parseStooqCsvRow(line, expectedDate);
    if (parsed) {
      rows.push(parsed);
    } else if (line.trim()) {
      skipped++;
    }
  }

  return { rows, skipped };
}
