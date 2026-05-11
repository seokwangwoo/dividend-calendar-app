import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

interface ImportResult {
  processedCount: number;
  insertedCount: number;
  updatedCount: number;
  delistedCount: number;
  failedCount: number;
  errors: string[];
}

interface CsvRow {
  ticker: string;
  name: string;
  marketSegment: string;
}

async function getAdminClient(req: Request) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    throw new Error("Missing Supabase environment");
  }

  const authorization = req.headers.get("Authorization") ?? "";
  const client = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) {
    return {
      client,
      error: new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      })
    };
  }

  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("role, status")
    .eq("id", data.user.id)
    .single();

  if (profileError || profile?.role !== "admin" || profile.status !== "active") {
    return {
      client,
      error: new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      })
    };
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  return { client: admin, userId: data.user.id, error: null };
}

function parseCsv(csvText: string): { rows: CsvRow[]; errors: string[] } {
  const lines = csvText.split(/\r?\n/);
  const errors: string[] = [];

  if (lines.length === 0) {
    errors.push("CSV is empty");
    return { rows: [], errors };
  }

  const headerLine = lines[0].trim().toLowerCase();
  const expectedHeader = "ticker,name,market_segment";
  if (headerLine !== expectedHeader) {
    errors.push(`Invalid CSV header. Expected: ${expectedHeader}, got: ${headerLine}`);
    return { rows: [], errors };
  }

  const rows: CsvRow[] = [];
  const seenTickers = new Set<string>();
  const duplicateTickers = new Set<string>();

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Simple CSV split (does not handle quoted commas, but JPX data is simple)
    const parts = line.split(",");
    if (parts.length < 3) {
      errors.push(`Row ${i + 1}: insufficient columns`);
      continue;
    }

    const ticker = parts[0].trim();
    const name = parts[1].trim();
    const marketSegment = parts[2].trim();

    if (!ticker) {
      errors.push(`Row ${i + 1}: empty ticker`);
      continue;
    }
    if (!name) {
      errors.push(`Row ${i + 1}: empty name for ticker ${ticker}`);
      continue;
    }

    if (seenTickers.has(ticker)) {
      duplicateTickers.add(ticker);
      continue;
    }
    seenTickers.add(ticker);

    rows.push({ ticker, name, marketSegment });
  }

  if (duplicateTickers.size > 0) {
    errors.push(`Duplicate tickers in CSV: ${Array.from(duplicateTickers).join(", ")}`);
  }

  return { rows, errors };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  let authResult: Awaited<ReturnType<typeof getAdminClient>>;
  try {
    authResult = await getAdminClient(req);
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  const { client, error } = authResult;
  if (error) return error;

  const body = await req.json().catch(() => ({}));
  const filePath: string = body.filePath ?? "";
  const dryRun: boolean = body.dryRun === true;

  if (!filePath) {
    return new Response(JSON.stringify({ error: "filePath is required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  // Parse bucket and path from filePath (e.g., "imports/stock-master/202506_list.csv")
  const firstSlash = filePath.indexOf("/");
  if (firstSlash === -1) {
    return new Response(JSON.stringify({ error: "filePath must be in format bucket/path" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
  const bucket = filePath.substring(0, firstSlash);
  const path = filePath.substring(firstSlash + 1);

  // Download file from Storage
  const { data: fileData, error: downloadError } = await client.storage
    .from(bucket)
    .download(path);

  if (downloadError || !fileData) {
    return new Response(
      JSON.stringify({ error: `Failed to download file: ${downloadError?.message ?? "unknown"}` }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const csvText = await fileData.text();
  const { rows, errors: parseErrors } = parseCsv(csvText);

  if (parseErrors.length > 0) {
    return new Response(
      JSON.stringify({ error: "CSV validation failed", details: parseErrors }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const result: ImportResult = {
    processedCount: rows.length,
    insertedCount: 0,
    updatedCount: 0,
    delistedCount: 0,
    failedCount: 0,
    errors: []
  };

  // Create import log entry
  const { data: logData, error: logInsertError } = await client
    .from("stock_import_logs")
    .insert({
      file_path: filePath,
      dry_run: dryRun,
      status: "running",
      processed_count: rows.length
    })
    .select("id")
    .single();

  if (logInsertError || !logData) {
    return new Response(
      JSON.stringify({ error: `Failed to create import log: ${logInsertError?.message ?? "unknown"}` }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const logId = logData.id;

  let existingMap: Map<string, { id: string; ticker: string; support_status: string; name: string | null; market_segment: string | null }> = new Map();
  let allDbStocks: { id: string; ticker: string; support_status: string }[] | null = null;

  try {
    // Fetch existing stocks for both dry-run and actual run to compute preview
    const tickers = rows.map((r) => r.ticker);
    const { data: existingStocks, error: existingError } = await client
      .from("stocks")
      .select("id, ticker, support_status, name, market_segment")
      .in("ticker", tickers);

    if (existingError) {
      result.errors.push(`Failed to fetch existing stocks: ${existingError.message}`);
      result.failedCount = rows.length;
      throw new Error("Abort: cannot safely upsert without reading existing stocks");
    }

    existingMap = new Map(existingStocks?.map((s) => [s.ticker, s]) ?? []);

    // Compute inserts vs updates
    for (const row of rows) {
      const existing = existingMap.get(row.ticker);
      if (existing) {
        result.updatedCount++;
      } else {
        result.insertedCount++;
      }
    }

    // Compute delisted count
    const { data: allDbData, error: allDbError } = await client
      .from("stocks")
      .select("id, ticker, support_status");

    if (allDbError) {
      result.errors.push(`Failed to fetch all stocks for delisting: ${allDbError.message}`);
      // Delisting is secondary; we can still proceed with upserts if allDbError occurs
    } else {
      allDbStocks = allDbData;
      const csvTickerSet = new Set(rows.map((r) => r.ticker));
      for (const dbStock of allDbStocks ?? []) {
        if (!csvTickerSet.has(dbStock.ticker) && dbStock.support_status !== "delisted") {
          result.delistedCount++;
        }
      }
    }

    if (!dryRun) {
      // Perform actual upserts
      for (const row of rows) {
        const existing = existingMap.get(row.ticker);
        const upsertData = {
          ticker: row.ticker,
          name: row.name,
          market_segment: row.marketSegment || null,
          exchange: "TSE",
          support_status: existing?.support_status ?? "unsupported"
        };

        const { error: upsertError } = await client
          .from("stocks")
          .upsert(upsertData, { onConflict: "ticker" });

        if (upsertError) {
          result.failedCount++;
          result.errors.push(`${row.ticker}: ${upsertError.message}`);
        }
      }

      // Perform actual delisting
      if (allDbStocks) {
        const csvTickerSet = new Set(rows.map((r) => r.ticker));
        for (const dbStock of allDbStocks) {
          if (!csvTickerSet.has(dbStock.ticker) && dbStock.support_status !== "delisted") {
            const { error: delistError } = await client
              .from("stocks")
              .update({ support_status: "delisted" })
              .eq("id", dbStock.id);

            if (delistError) {
              result.errors.push(`${dbStock.ticker} delist: ${delistError.message}`);
            }
          }
        }
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    result.errors.push(`Unexpected error: ${message}`);
  }

  // Update import log
  const finalStatus = result.errors.length > 0 && result.failedCount === rows.length ? "failed" : "success";
  await client
    .from("stock_import_logs")
    .update({
      dry_run: dryRun,
      processed_count: result.processedCount,
      inserted_count: result.insertedCount,
      updated_count: result.updatedCount,
      delisted_count: result.delistedCount,
      failed_count: result.failedCount,
      status: finalStatus,
      error_message: result.errors.length > 0 ? result.errors.join("; ") : null,
      completed_at: new Date().toISOString()
    })
    .eq("id", logId);

  return new Response(
    JSON.stringify({
      dryRun,
      logId,
      result: {
        processedCount: result.processedCount,
        insertedCount: result.insertedCount,
        updatedCount: result.updatedCount,
        delistedCount: result.delistedCount,
        failedCount: result.failedCount,
        errors: result.errors
      }
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
