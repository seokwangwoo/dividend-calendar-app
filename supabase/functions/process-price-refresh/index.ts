import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

interface PriceRefreshResult {
  processed: number;
  remainingJobs: number;
  failedTickers: string[];
  errors: string[];
}

interface StooqResponse {
  symbols?: Array<{
    symbol: string;
    date: string;
    time: string;
    open: string;
    high: string;
    low: string;
    close: string;
    volume: string;
  }>;
}

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class RetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RetryableError";
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const apiSecret = Deno.env.get("API_SECRET");

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: "Missing Supabase environment" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  const authHeader = req.headers.get("Authorization");
  if (authHeader !== `Bearer ${serviceRoleKey}` && authHeader !== `Bearer ${apiSecret}`) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const body = await req.json().catch(() => ({}));
  const runDate: string = body.run_date ?? formatJstDate(new Date());

  const result: PriceRefreshResult = {
    processed: 0,
    remainingJobs: 0,
    failedTickers: [],
    errors: []
  };

  try {
    // 0. Recover stuck jobs: running jobs for this run_date updated > 10 min ago
    const stuckThreshold = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { error: recoverError } = await client
      .from("jobs")
      .update({ status: "pending" })
      .eq("type", "refresh_stock_prices")
      .eq("payload->>run_date", runDate)
      .eq("status", "running")
      .lt("updated_at", stuckThreshold);

    if (recoverError) {
      result.errors.push(`Failed to recover stuck jobs: ${recoverError.message}`);
    }

    // 1. Check if jobs already exist for this run_date
    const { data: existingJobs, error: checkError } = await client
      .from("jobs")
      .select("id, status")
      .eq("type", "refresh_stock_prices")
      .eq("payload->>run_date", runDate);

    if (checkError) {
      throw new Error(`Failed to check existing jobs: ${checkError.message}`);
    }

    // 2. If no jobs exist, create chunk jobs for all non-delisted stocks
    if (!existingJobs || existingJobs.length === 0) {
      const { data: stocks, error: stocksError } = await client
        .from("stocks")
        .select("id, ticker")
        .in("support_status", ["supported", "unsupported"])
        .order("ticker");

      if (stocksError) {
        throw new Error(`Failed to fetch stocks: ${stocksError.message}`);
      }

      const chunkSize = Number(Deno.env.get("PRICE_REFRESH_CHUNK_SIZE") ?? "50");
      const chunks: Array<{ stock_id: string; ticker: string }[]> = [];
      for (let i = 0; i < (stocks ?? []).length; i += chunkSize) {
        chunks.push((stocks ?? []).slice(i, i + chunkSize));
      }

      const jobInserts = chunks.map((chunk, index) => ({
        type: "refresh_stock_prices",
        status: "pending",
        payload: {
          run_date: runDate,
          offset: index * chunkSize,
          tickers: chunk.map((s) => s.ticker)
        },
        run_after: new Date().toISOString(),
        max_attempts: 4
      }));

      if (jobInserts.length > 0) {
        const { error: insertError } = await client.from("jobs").insert(jobInserts);
        if (insertError) {
          throw new Error(`Failed to create jobs: ${insertError.message}`);
        }
      }

      result.remainingJobs = jobInserts.length;
      return new Response(
        JSON.stringify({
          message: "Jobs created",
          runDate,
          createdJobs: jobInserts.length,
          result
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Count remaining pending jobs
    const { count: pendingCount, error: countError } = await client
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("type", "refresh_stock_prices")
      .eq("payload->>run_date", runDate)
      .eq("status", "pending");

    if (countError) {
      throw new Error(`Failed to count pending jobs: ${countError.message}`);
    }

    result.remainingJobs = pendingCount ?? 0;

    if (result.remainingJobs === 0) {
      return new Response(
        JSON.stringify({ message: "No pending jobs", runDate, result }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Claim the oldest pending job
    const { data: jobToRun, error: claimError } = await client
      .from("jobs")
      .select("id, type, status, payload, run_after, attempts, max_attempts, last_error")
      .eq("type", "refresh_stock_prices")
      .eq("payload->>run_date", runDate)
      .eq("status", "pending")
      .lte("run_after", new Date().toISOString())
      .order("created_at", { ascending: true })
      .limit(1)
      .single();

    if (claimError || !jobToRun) {
      return new Response(
        JSON.stringify({
          message: "No runnable jobs (all pending jobs are scheduled for future retry)",
          runDate,
          result
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Mark as running
    const { error: runningError } = await client
      .from("jobs")
      .update({ status: "running", attempts: jobToRun.attempts + 1 })
      .eq("id", jobToRun.id);

    if (runningError) {
      throw new Error(`Failed to claim job: ${runningError.message}`);
    }

    const payloadTickers: string[] = jobToRun.payload?.tickers ?? [];
    const delayMs = Number(Deno.env.get("STOOQ_REQUEST_DELAY_MS") ?? "200");

    // Fetch stock IDs for the tickers in this chunk
    const { data: stockRows, error: stockQueryError } = await client
      .from("stocks")
      .select("id, ticker")
      .in("ticker", payloadTickers);

    if (stockQueryError) {
      throw new RetryableError(`Failed to fetch stock IDs: ${stockQueryError.message}`);
    }

    const stockMap = new Map(stockRows?.map((s) => [s.ticker, s.id]) ?? []);

    // 5. Process each ticker in the chunk
    for (const ticker of payloadTickers) {
      const stockId = stockMap.get(ticker);
      if (!stockId) {
        result.errors.push(`${ticker}: stock not found in DB`);
        result.failedTickers.push(ticker);
        continue;
      }

      try {
        const url = `https://stooq.com/q/l/?s=${ticker}.JP&f=sd2t2ohlcv&h&e=json`;
        const res = await fetch(url, { method: "GET" });

        if (res.status === 429) {
          throw new RetryableError(`Stooq rate limit (429) for ${ticker}`);
        }
        if (!res.ok) {
          throw new Error(`Stooq HTTP ${res.status} for ${ticker}`);
        }

        const data: StooqResponse = await res.json();
        const symbolData = data.symbols?.[0];

        if (!symbolData || !symbolData.close) {
          throw new Error(`Invalid Stooq response for ${ticker}`);
        }

        const closePrice = Number(symbolData.close);
        if (!Number.isFinite(closePrice) || closePrice <= 0) {
          throw new Error(`Invalid close price for ${ticker}: ${symbolData.close}`);
        }

        // Update stock price
        const { error: updateError } = await client
          .from("stocks")
          .update({
            current_price: closePrice,
            price_updated_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq("id", stockId);

        if (updateError) {
          throw new Error(`DB update failed for ${ticker}: ${updateError.message}`);
        }

        // Log success
        const { error: logError } = await client.from("stock_price_refresh_logs").insert({
          stock_id: stockId,
          status: "success",
          new_price: closePrice
        });

        if (logError) {
          result.errors.push(`${ticker} log insert: ${logError.message}`);
        }

        result.processed++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        result.errors.push(`${ticker}: ${message}`);
        result.failedTickers.push(ticker);

        // Log failure
        const { error: logError } = await client.from("stock_price_refresh_logs").insert({
          stock_id: stockId,
          status: "failure",
          error_message: message
        });

        if (logError) {
          result.errors.push(`${ticker} log insert: ${logError.message}`);
        }

        // If retryable, abort the chunk so it can be retried
        if (err instanceof RetryableError) {
          throw err;
        }
      }

      // Delay between requests
      await sleep(delayMs);
    }

    // 6. Mark job as completed
    const { error: completeError } = await client
      .from("jobs")
      .update({ status: "completed", last_error: null })
      .eq("id", jobToRun.id);

    if (completeError) {
      result.errors.push(`Failed to mark job completed: ${completeError.message}`);
    }

    // Recount remaining jobs
    const { count: remainingCount, error: remError } = await client
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("type", "refresh_stock_prices")
      .eq("payload->>run_date", runDate)
      .eq("status", "pending");

    if (!remError) {
      result.remainingJobs = remainingCount ?? 0;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    result.errors.push(`Chunk error: ${message}`);

    // If we have a job that was being processed, handle retry/failure
    // We need to find the running job for this run_date and type
    const { data: runningJob } = await client
      .from("jobs")
      .select("id, attempts, max_attempts")
      .eq("type", "refresh_stock_prices")
      .eq("payload->>run_date", runDate)
      .eq("status", "running")
      .order("created_at", { ascending: true })
      .limit(1)
      .single();

    if (runningJob) {
      const isRetryable = err instanceof RetryableError;
      if (isRetryable && runningJob.attempts < runningJob.max_attempts) {
        // Exponential backoff: 5min, 15min, 45min
        const backoffMinutes = [5, 15, 45];
        const backoffIndex = Math.min(runningJob.attempts - 1, backoffMinutes.length - 1);
        const runAfter = new Date(Date.now() + backoffMinutes[backoffIndex] * 60 * 1000);

        await client
          .from("jobs")
          .update({
            status: "pending",
            run_after: runAfter.toISOString(),
            last_error: message
          })
          .eq("id", runningJob.id);
      } else {
        await client
          .from("jobs")
          .update({
            status: "failed",
            last_error: message
          })
          .eq("id", runningJob.id);
      }
    }

    return new Response(
      JSON.stringify({ error: message, runDate, result }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  return new Response(
    JSON.stringify({ message: "Chunk processed", runDate, result }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
