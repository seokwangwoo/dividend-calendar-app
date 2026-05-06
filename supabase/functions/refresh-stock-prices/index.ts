import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.1";

interface RefreshResult {
  updated: number;
  skipped: number;
  failed: number;
  errors: string[];
  warnings: string[];
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

function formatJstDate(d: Date): string {
  return d
    .toLocaleDateString("ja-JP", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    })
    .replace(/\//g, "-");
}

function normalizeStooqTicker(stooqSymbol: string): string | null {
  const match = stooqSymbol.trim().match(/^(\d{4})\.JP$/i);
  if (!match) return null;
  return match[1];
}

function parseStooqCsvRow(
  line: string,
  expectedDate: string
): { ticker: string; price: number; updatedAt: Date } | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(",");
  if (parts.length < 6) return null;

  const symbol = parts[0].trim();
  const date = parts[1].trim();
  const closeStr = parts[5].trim();

  const ticker = normalizeStooqTicker(symbol);
  if (!ticker || date !== expectedDate) return null;

  const closePrice = Number(closeStr);
  if (!Number.isFinite(closePrice) || closePrice <= 0) return null;

  return {
    ticker,
    price: closePrice,
    updatedAt: new Date(date + "T00:00:00+09:00")
  };
}

function parseStooqCsv(
  csvBody: string,
  expectedDate: string
): { rows: { ticker: string; price: number; updatedAt: Date }[]; skipped: number } {
  const lines = csvBody.split(/\r?\n/);
  const rows: { ticker: string; price: number; updatedAt: Date }[] = [];
  let skipped = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (i === 0 && line.toLowerCase().includes("symbol")) continue;
    const parsed = parseStooqCsvRow(line, expectedDate);
    if (parsed) {
      rows.push(parsed);
    } else if (line.trim()) {
      skipped++;
    }
  }

  return { rows, skipped };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: "Missing Supabase environment" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  const authorization = req.headers.get("Authorization") ?? "";
  const isServiceCall = authorization === `Bearer ${serviceRoleKey}`;

  if (!isServiceCall) {
    const authClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const { data, error } = await authClient.auth.getUser();
    if (error || !data.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
    const { data: profile } = await authClient
      .from("profiles")
      .select("role")
      .eq("id", data.user.id)
      .single();
    if (profile?.role !== "admin") {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const today = new Date();
  const expectedDate = formatJstDate(today);

  // Fetch supported stocks with ticker
  const { data: stocks, error: stocksError } = await admin
    .from("stocks")
    .select("id, ticker")
    .eq("support_status", "supported");

  if (stocksError) {
    return new Response(JSON.stringify({ error: stocksError.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  const result: RefreshResult = { updated: 0, skipped: 0, failed: 0, errors: [], warnings: [] };
  const symbolMap = new Map<string, string>();
  const symbols: string[] = [];

  for (const stock of stocks ?? []) {
    if (!stock.ticker) continue;
    const stooqSymbol = `${stock.ticker}.JP`;
    symbolMap.set(stooqSymbol, stock.id);
    symbols.push(stooqSymbol);
  }

  if (symbols.length === 0) {
    return new Response(JSON.stringify({ message: "No supported stocks to refresh", result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  async function checkConsecutiveFailures(stockId: string, ticker: string): Promise<void> {
    const { data: logs } = await admin
      .from("stock_price_refresh_logs")
      .select("status")
      .eq("stock_id", stockId)
      .order("created_at", { ascending: false })
      .limit(3);

    if (logs && logs.length >= 3 && logs.every((l) => l.status === "failure")) {
      result.warnings.push(`${ticker}: 3 consecutive price refresh failures`);
    }
  }

  // Stooq accepts up to ~50 symbols per request
  const batchSize = 40;
  for (let i = 0; i < symbols.length; i += batchSize) {
    const batch = symbols.slice(i, i + batchSize);
    const url = `https://stooq.com/q/l/?s=${batch.join(",")}&f=sd2t2ohlcv&h&e=csv`;

    try {
      const res = await fetch(url, { method: "GET" });
      if (!res.ok) {
        throw new Error(`Stooq HTTP ${res.status}`);
      }
      const csvBody = await res.text();
      const parsed = parseStooqCsv(csvBody, expectedDate);
      result.skipped += parsed.skipped;

      for (const row of parsed.rows) {
        const stooqSymbol = `${row.ticker}.JP`;
        const stockId = symbolMap.get(stooqSymbol);
        if (!stockId) {
          result.skipped++;
          continue;
        }

        const { error: updateError } = await admin
          .from("stocks")
          .update({
            current_price: row.price,
            price_updated_at: row.updatedAt.toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq("id", stockId);

        if (updateError) {
          result.failed++;
          result.errors.push(`${row.ticker}: ${updateError.message}`);
          const { error: logError } = await admin.from("stock_price_refresh_logs").insert({
            stock_id: stockId,
            status: "failure",
            new_price: row.price,
            error_message: updateError.message
          });
          if (logError) {
            result.errors.push(`${row.ticker} log insert: ${logError.message}`);
          }
          await checkConsecutiveFailures(stockId, row.ticker);
        } else {
          result.updated++;
          const { error: logError } = await admin.from("stock_price_refresh_logs").insert({
            stock_id: stockId,
            status: "success",
            new_price: row.price
          });
          if (logError) {
            result.errors.push(`${row.ticker} log insert: ${logError.message}`);
          }
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.failed += batch.length;
      result.errors.push(`Batch ${i}-${i + batch.length}: ${message}`);
      for (const sym of batch) {
        const stockId = symbolMap.get(sym);
        if (stockId) {
          const { error: logError } = await admin.from("stock_price_refresh_logs").insert({
            stock_id: stockId,
            status: "failure",
            error_message: message
          });
          if (logError) {
            result.errors.push(`${sym} log insert: ${logError.message}`);
          }
          await checkConsecutiveFailures(stockId, sym.replace(".JP", ""));
        }
      }
    }
  }

  return new Response(JSON.stringify({ message: "Refresh complete", result }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
});
