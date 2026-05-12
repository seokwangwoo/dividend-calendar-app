#!/usr/bin/env node
/**
 * refresh-stock-prices-local.js
 * 로컬에서 Stooq API를 호출하여 주식 가격을 갱신합니다.
 * Edge Function이 아닌 로컬 Node.js에서 실행합니다.
 *
 * 사용법:
 *   node scripts/refresh-stock-prices-local.js
 */

const { createClient } = require("@supabase/supabase-js");
const https = require("https");

// --- 설정 ---
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("ERROR: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in environment");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const BATCH_SIZE = 40;

// --- 유틸리티 ---
function formatJstDate(d) {
  return d
    .toLocaleDateString("ja-JP", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
    .replace(/\//g, "-");
}

function normalizeStooqTicker(stooqSymbol) {
  const match = stooqSymbol.trim().match(/^(\d{4})\.JP$/i);
  return match ? match[1] : null;
}

function parseStooqCsvRow(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(",");
  if (parts.length < 6) return null;

  const symbol = parts[0].trim();
  const date = parts[1].trim();
  const closeStr = parts[5].trim();

  const ticker = normalizeStooqTicker(symbol);
  if (!ticker) return null;

  const closePrice = Number(closeStr);
  if (!Number.isFinite(closePrice) || closePrice <= 0) return null;

  return { ticker, price: closePrice, date };
}

function parseStooqCsv(csvBody) {
  const lines = csvBody.split(/\r?\n/);
  const rows = [];
  let skipped = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (i === 0 && line.toLowerCase().includes("symbol")) continue;
    const parsed = parseStooqCsvRow(line);
    if (parsed) {
      rows.push(parsed);
    } else if (line.trim()) {
      skipped++;
    }
  }

  return { rows, skipped };
}

function fetchStooq(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; DividendCalendarBot/1.0)" } }, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve({ status: res.statusCode, body: data }));
      })
      .on("error", reject)
      .setTimeout(15000, function () {
        this.destroy();
        reject(new Error("Request timeout"));
      });
  });
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- 메인 로직 ---
async function main() {
  const now = new Date().toISOString();

  console.log(`Fetching latest stock prices from Stooq...\n`);

  // 지원 종목 전체 조회
  const { data: stocks, error: stocksError } = await supabase
    .from("stocks")
    .select("id, ticker")
    .in("support_status", ["supported", "unsupported"]);

  if (stocksError) {
    console.error("Failed to fetch stocks:", stocksError.message);
    process.exit(1);
  }

  const symbolMap = new Map();
  const symbols = [];
  for (const stock of stocks ?? []) {
    if (!stock.ticker) continue;
    const stooqSymbol = `${stock.ticker}.JP`;
    symbolMap.set(stooqSymbol, stock.id);
    symbols.push(stooqSymbol);
  }

  if (symbols.length === 0) {
    console.log("No stocks to refresh.");
    return;
  }

  console.log(`Total stocks: ${symbols.length}\n`);

  let updated = 0;
  let skipped = 0;
  let failed = 0;
  const errors = [];
  const successLogs = [];
  const failureLogs = [];
  const stockUpdates = [];

  for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
    const batch = symbols.slice(i, i + BATCH_SIZE);
    const url = `https://stooq.com/q/l/?s=${batch.join("+")}&f=sd2t2ohlcv&h&e=csv`;

    process.stdout.write(`Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(symbols.length / BATCH_SIZE)} ... `);

    try {
      const res = await fetchStooq(url);
      if (res.status !== 200) {
        throw new Error(`HTTP ${res.status}`);
      }

      const parsed = parseStooqCsv(res.body);
      skipped += parsed.skipped;

      for (const row of parsed.rows) {
        const stooqSymbol = `${row.ticker}.JP`;
        const stockId = symbolMap.get(stooqSymbol);
        if (!stockId) {
          skipped++;
          continue;
        }

        stockUpdates.push({
          id: stockId,
          current_price: row.price,
          price_updated_at: now,
          updated_at: now,
        });
        successLogs.push({ stock_id: stockId, status: "success", new_price: row.price });
        updated++;
      }

      // 날짜가 안 맞는 종목은 실패로 기록
      const returnedTickers = new Set(parsed.rows.map((r) => `${r.ticker}.JP`));
      for (const sym of batch) {
        if (!returnedTickers.has(sym)) {
          const stockId = symbolMap.get(sym);
          if (stockId) {
            failureLogs.push({ stock_id: stockId, status: "failure", error_message: "No data for expected date" });
            failed++;
          }
        }
      }

      console.log(`OK (${parsed.rows.length} prices)`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(`FAILED: ${message}`);
      errors.push(`Batch ${i}-${i + batch.length}: ${message}`);
      for (const sym of batch) {
        const stockId = symbolMap.get(sym);
        if (stockId) {
          failureLogs.push({ stock_id: stockId, status: "failure", error_message: message });
          failed++;
        }
      }
    }

    // Stooq에 부담을 주지 않기 위해 약간의 딜레이
    await sleep(500);
  }

  console.log("\n--- Batch DB Updates ---");

  // 배치 업데이트 via RPC
  if (stockUpdates.length > 0) {
    const BATCH_DB_SIZE = 500;
    let updateCount = 0;
    for (let i = 0; i < stockUpdates.length; i += BATCH_DB_SIZE) {
      const batch = stockUpdates.slice(i, i + BATCH_DB_SIZE);
      const { error: rpcError } = await supabase.rpc("batch_update_stock_prices", {
        updates: batch,
      });
      if (rpcError) {
        console.error(`Batch update ${i / BATCH_DB_SIZE + 1} failed:`, rpcError.message);
      } else {
        updateCount += batch.length;
      }
    }
    console.log(`Updated ${updateCount} stock prices`);
  }

  // 배치 로그
  const allLogs = [...successLogs, ...failureLogs];
  if (allLogs.length > 0) {
    const { error: logError } = await supabase.from("stock_price_refresh_logs").insert(allLogs);
    if (logError) {
      console.error("Batch log insert failed:", logError.message);
    } else {
      console.log(`Inserted ${allLogs.length} logs`);
    }
  }

  console.log("\n=== Result ===");
  console.log(`Updated: ${updated}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Failed:  ${failed}`);
  if (errors.length > 0) {
    console.log(`\nErrors (${errors.length}):`);
    errors.forEach((e) => console.log(`  - ${e}`));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
