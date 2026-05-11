import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.1";
import {
  executeDownloadDisclosurePdf,
  JobHandlerError,
  parseBatchSize,
  processRunnableJobs,
  resolvePayloadString,
  type DisclosureForDownload,
  type JobHandler,
  type JobRow,
  type JsonRecord,
  type ProcessJobsClient
} from "../_shared/process-jobs.ts";
import {
  executeParseDisclosurePdfAi,
  type DisclosureForParse,
  type DividendReviewInsert,
  type OpenAIParseRequest,
  type OpenAIParseResponse
} from "../_shared/pdf-ai-parser.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

const DISCLOSURE_BUCKET = "disclosures";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const apiSecret = Deno.env.get("API_SECRET");
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "Missing Supabase environment" }, 500);
  }
  const authHeader = req.headers.get("Authorization");
  if (authHeader !== `Bearer ${serviceRoleKey}` && authHeader !== `Bearer ${apiSecret}`) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const body = await req.json().catch(() => ({}));
  const batchSize = parseBatchSize(
    isRecord(body) ? body.batch_size ?? body.batchSize : null,
    parseBatchSize(Deno.env.get("PROCESS_JOBS_BATCH_SIZE"), 5)
  );

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const handlers = {
    download_disclosure_pdf: createDownloadDisclosurePdfHandler(supabase),
    parse_disclosure_pdf_ai: createParseDisclosurePdfAiHandler(supabase)
  };
  const client = createSupabaseJobsClient(supabase, Object.keys(handlers));

  try {
    const result = await processRunnableJobs({ client, handlers, batchSize });
    return jsonResponse(result);
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : String(error) },
      500
    );
  }
});

function createSupabaseJobsClient(
  client: ReturnType<typeof createClient>,
  supportedTypes: string[]
): ProcessJobsClient {
  return {
    async listRunnableJobs({ batchSize, now }) {
      // Check daily AI parse call cap before listing jobs
      let skipParseJobs = false;
      if (supportedTypes.includes("parse_disclosure_pdf_ai")) {
        const dailyBudgetUsd = Number(Deno.env.get("DAILY_AI_PARSE_BUDGET_USD") ?? "5.0");
        const dailyCallCap = Number(Deno.env.get("DAILY_AI_PARSE_CALL_CAP") ?? "250");
        const todayStart = new Date(now);
        todayStart.setHours(0, 0, 0, 0);

        const { data: dailyStats, error: statsError } = await client
          .from("disclosures")
          .select("ai_parse_cost_usd")
          .gte("updated_at", todayStart.toISOString())
          .in("parse_status", ["parsed", "failed"])
          .not("ai_parse_cost_usd", "is", null);

        if (!statsError) {
          const dailyCost = (dailyStats ?? []).reduce((sum, row) => sum + (row.ai_parse_cost_usd ?? 0), 0);
          const dailyCalls = (dailyStats ?? []).length;
          if (dailyCost >= dailyBudgetUsd || dailyCalls >= dailyCallCap) {
            skipParseJobs = true;
          }
        }
      }

      const typesToRun = skipParseJobs
        ? supportedTypes.filter((t) => t !== "parse_disclosure_pdf_ai")
        : supportedTypes;

      const { data, error } = await client
        .from("jobs")
        .select("id, type, status, payload, run_after, attempts, max_attempts, last_error, priority")
        .eq("status", "pending")
        .in("type", typesToRun)
        .lte("run_after", now.toISOString())
        .order("priority", { ascending: true })
        .order("run_after", { ascending: true })
        .limit(batchSize);
      if (error) throw error;
      return (data ?? []).map(normalizeJobRow);
    },

    async claimJob(job) {
      const { data, error } = await client
        .from("jobs")
        .update({
          status: "processing",
          attempts: job.attempts + 1,
          last_error: null
        })
        .eq("id", job.id)
        .eq("status", "pending")
        .select("id, type, status, payload, run_after, attempts, max_attempts, last_error, priority")
        .maybeSingle();
      if (error) throw error;
      return data ? normalizeJobRow(data) : null;
    },

    async completeJob(job) {
      const { error } = await client
        .from("jobs")
        .update({ status: "completed", last_error: null })
        .eq("id", job.id);
      if (error) throw error;
    },

    async retryJob(job, { error: message, runAfter }) {
      const { error } = await client
        .from("jobs")
        .update({
          status: "pending",
          last_error: message,
          run_after: runAfter.toISOString()
        })
        .eq("id", job.id);
      if (error) throw error;
    },

    async failJob(job, { error: message }) {
      const { error } = await client
        .from("jobs")
        .update({ status: "failed", last_error: message })
        .eq("id", job.id);
      if (error) throw error;
    }
  };
}

function createDownloadDisclosurePdfHandler(
  client: ReturnType<typeof createClient>
): JobHandler {
  return {
    async execute(job) {
      await executeDownloadDisclosurePdf(job, {
        fetchDisclosure: (disclosureId) => fetchDisclosure(client, disclosureId),
        fetchDocument: (documentUrl) => fetch(documentUrl, { signal: AbortSignal.timeout(20_000) }),
        uploadPdf: async (storagePath, pdfBytes) => {
          const { error } = await client.storage
            .from(DISCLOSURE_BUCKET)
            .upload(storagePath, pdfBytes, {
              contentType: "application/pdf",
              upsert: true
            });
          if (error) throw new JobHandlerError(`storage_upload_failed:${error.message}`);
        },
        updateDisclosureDownloaded: async (disclosureId, storagePath) => {
          const { error } = await client
            .from("disclosures")
            .update({
              storage_path: storagePath,
              parse_status: "downloaded",
              last_parse_error: null
            })
            .eq("id", disclosureId);
          if (error) throw error;
        },
        ensureParseJob: (disclosureId) => ensureParseJob(client, disclosureId)
      });
    },

    async onFinalFailure(job, error) {
      const disclosureId = resolvePayloadString(job.payload, "disclosureId", "disclosure_id");
      if (!disclosureId) return;
      const { error: updateError } = await client
        .from("disclosures")
        .update({
          parse_status: "failed",
          last_parse_error: error.message
        })
        .eq("id", disclosureId);
      if (updateError) throw updateError;
    }
  };
}

async function fetchDisclosure(
  client: ReturnType<typeof createClient>,
  disclosureId: string
): Promise<DisclosureForDownload> {
  const { data, error } = await client
    .from("disclosures")
    .select(
      "id, external_id, document_url, published_at, storage_path, disclosure_type, raw_payload, stocks(ticker)"
    )
    .eq("id", disclosureId)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    throw new JobHandlerError("invalid_payload:disclosure_not_found", { retryable: false });
  }
  return {
    id: data.id,
    external_id: data.external_id,
    document_url: data.document_url,
    published_at: data.published_at,
    storage_path: data.storage_path,
    disclosure_type: data.disclosure_type,
    raw_payload: isRecord(data.raw_payload) ? data.raw_payload : {},
    stocks: data.stocks
  };
}

async function ensureParseJob(client: ReturnType<typeof createClient>, disclosureId: string): Promise<void> {
  const { data: existing, error: existingError } = await client
    .from("jobs")
    .select("id")
    .eq("type", "parse_disclosure_pdf_ai")
    .contains("payload", { disclosureId })
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) return;

  // SKIP_UNHELD_UNPARSED toggle: skip parse jobs for stocks with no active holdings
  const skipUnheldUnparsed = Deno.env.get("SKIP_UNHELD_UNPARSED") === "true";
  if (skipUnheldUnparsed) {
    const { data: disclosure, error: dError } = await client
      .from("disclosures")
      .select("stock_id")
      .eq("id", disclosureId)
      .single();
    if (!dError) {
      if (!disclosure?.stock_id) {
        // Unknown stock: skip creating parse job
        return;
      }
      const { data: holdings, error: hError } = await client
        .from("holdings")
        .select("id")
        .eq("stock_id", disclosure.stock_id)
        .is("deleted_at", null)
        .limit(1);
      if (!hError && (holdings ?? []).length === 0) {
        // No active holdings: skip creating parse job
        return;
      }
    }
  }

  // Calculate priority based on stock holdings and dividend history
  const priority = await resolveParsePriority(client, disclosureId);

  const { error } = await client.from("jobs").insert({
    type: "parse_disclosure_pdf_ai",
    payload: { disclosureId },
    max_attempts: 3,
    priority
  });
  if (error) throw error;
}

async function resolveParsePriority(
  client: ReturnType<typeof createClient>,
  disclosureId: string
): Promise<number> {
  // Fetch the disclosure's stock_id
  const { data: disclosure, error: dError } = await client
    .from("disclosures")
    .select("stock_id")
    .eq("id", disclosureId)
    .single();

  if (dError || !disclosure?.stock_id) {
    return 3; // Unknown stock = lowest priority
  }

  const stockId = disclosure.stock_id;

  // Priority 1: stock has active holdings
  const { data: holdings, error: hError } = await client
    .from("holdings")
    .select("id")
    .eq("stock_id", stockId)
    .is("deleted_at", null)
    .limit(1);

  if (!hError && (holdings ?? []).length > 0) {
    return 1;
  }

  // Priority 2: supported stock with approved dividend history
  const { data: stock, error: sError } = await client
    .from("stocks")
    .select("support_status")
    .eq("id", stockId)
    .single();

  if (!sError && stock?.support_status === "supported") {
    const { data: dividends, error: divError } = await client
      .from("dividend_events")
      .select("id")
      .eq("stock_id", stockId)
      .eq("review_status", "approved")
      .limit(1);

    if (!divError && (dividends ?? []).length > 0) {
      return 2;
    }
  }

  return 3;
}

function normalizeJobRow(row: JsonRecord): JobRow {
  return {
    id: String(row.id),
    type: String(row.type),
    status: String(row.status),
    payload: isRecord(row.payload) ? row.payload : {},
    run_after: String(row.run_after),
    attempts: Number(row.attempts ?? 0),
    max_attempts: Number(row.max_attempts ?? 3),
    last_error: typeof row.last_error === "string" ? row.last_error : null,
    priority: Number(row.priority ?? 3)
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// ---------------------------------------------------------------------------
// parse_disclosure_pdf_ai handler
// ---------------------------------------------------------------------------

function createParseDisclosurePdfAiHandler(
  client: ReturnType<typeof createClient>
): JobHandler {
  return {
    async execute(job) {
      await executeParseDisclosurePdfAi(job, {
        fetchDisclosureForParse: (disclosureId) =>
          fetchDisclosureForParse(client, disclosureId),

        downloadPdf: async (storagePath) => {
          const { data, error } = await client.storage
            .from(DISCLOSURE_BUCKET)
            .download(storagePath);
          if (error) throw new JobHandlerError(`storage_download_failed:${error.message}`);
          return new Uint8Array(await data.arrayBuffer());
        },

        callOpenAI: (request) => callOpenAIResponsesApi(request),

        openaiModel: Deno.env.get("OPENAI_MODEL") ?? "gpt-4o",
        openaiPdfModel: Deno.env.get("OPENAI_PDF_MODEL") ?? "gpt-4o-mini",

        upsertDividendReviews: async (rows) => {
          if (rows.length === 0) return;
          const { error } = await client.from("dividend_reviews").insert(rows);
          if (error) throw error;
        },

        updateDisclosureParsed: async (disclosureId) => {
          const { error } = await client
            .from("disclosures")
            .update({
              parse_status: "parsed",
              last_parse_error: null
            })
            .eq("id", disclosureId);
          if (error) throw error;
        },

        updateDisclosureParseAttempt: async (disclosureId, attempt, lastError) => {
          const updatePayload: Record<string, unknown> = {
            ai_parse_attempts: attempt,
            parse_status: "parsing"
          };
          if (lastError) updatePayload.last_parse_error = lastError;
          const { error } = await client
            .from("disclosures")
            .update(updatePayload)
            .eq("id", disclosureId);
          if (error) throw error;
        },

        updateDisclosureFailedParse: async (disclosureId, lastError) => {
          const { error } = await client
            .from("disclosures")
            .update({
              parse_status: "failed",
              last_parse_error: lastError
            })
            .eq("id", disclosureId);
          if (error) throw error;
        },

        logAiParseCost: async (disclosureId, usage) => {
          const { error } = await client
            .from("disclosures")
            .update({
              ai_parse_input_tokens: usage.input_tokens,
              ai_parse_output_tokens: usage.output_tokens,
              ai_parse_cost_usd: usage.cost_usd
            })
            .eq("id", disclosureId);
          if (error) throw error;
        }
      });
    },

    async onFinalFailure(job, error) {
      const disclosureId = resolvePayloadString(
        job.payload,
        "disclosureId",
        "disclosure_id"
      );
      if (!disclosureId) return;
      const { error: updateError } = await client
        .from("disclosures")
        .update({
          parse_status: "failed",
          last_parse_error: error.message
        })
        .eq("id", disclosureId);
      if (updateError) throw updateError;
    }
  };
}

async function fetchDisclosureForParse(
  client: ReturnType<typeof createClient>,
  disclosureId: string
): Promise<DisclosureForParse> {
  const { data, error } = await client
    .from("disclosures")
    .select(
      "id, stock_id, external_id, title, source_type, document_url, disclosure_type, storage_path, published_at, ai_parse_attempts, raw_payload, stocks(id, ticker, name)"
    )
    .eq("id", disclosureId)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    throw new JobHandlerError("invalid_payload:disclosure_not_found", {
      retryable: false
    });
  }
  return {
    id: data.id,
    stock_id: data.stock_id,
    external_id: data.external_id,
    title: data.title,
    source_type: data.source_type,
    document_url: data.document_url,
    disclosure_type: data.disclosure_type,
    storage_path: data.storage_path,
    published_at: data.published_at,
    ai_parse_attempts: Number(data.ai_parse_attempts ?? 0),
    raw_payload: isRecord(data.raw_payload) ? data.raw_payload : {},
    stocks: data.stocks as DisclosureForParse["stocks"]
  };
}

async function callOpenAIResponsesApi(
  request: OpenAIParseRequest
): Promise<OpenAIParseResponse> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    throw new JobHandlerError("missing_env:OPENAI_API_KEY", { retryable: false });
  }

  const model = request.model ?? Deno.env.get("OPENAI_MODEL") ?? "gpt-4o";

  // Build the input content
  const inputContent: unknown[] = [];
  if (request.prompt) {
    inputContent.push({ type: "input_text", text: request.prompt });
  }

  if (request.textExtractionMethod === "direct_pdf_fallback" && request.pdfBytes) {
    // Direct PDF fallback - encode as base64
    const base64 = encodeBase64(request.pdfBytes);
    inputContent.push({
      type: "input_file",
      filename: "disclosure.pdf",
      file_data: `data:application/pdf;base64,${base64}`
    });
  } else if (request.textExtractionMethod !== "extracted_text") {
    throw new JobHandlerError("invalid_ai_request:no_text_or_pdf", {
      retryable: false
    });
  }

  const requestBody = {
    model,
    input: [
      {
        role: "user",
        content: inputContent
      }
    ]
  };

  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(60_000)
    });
  } catch (error) {
    throw new JobHandlerError(
      `openai_request_failed:network_or_timeout`,
      { cause: error }
    );
  }

  if (!response.ok) {
    const retryable = response.status === 429 || response.status >= 500;
    const body = await response.text().catch(() => "");
    throw new JobHandlerError(
      `openai_request_failed:http_${response.status}:${body.slice(0, 200)}`,
      { retryable }
    );
  }

  const responseData = await response.json();
  // OpenAI Responses API: output is in responseData.output[0].content[0].text
  const rawText =
    responseData?.output?.[0]?.content?.[0]?.text ??
    responseData?.output_text ??
    "";

  if (!rawText) {
    throw new JobHandlerError("openai_response_empty_text", { retryable: false });
  }

  return {
    rawText,
    usage: responseData.usage
  };
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
