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
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "Missing Supabase environment" }, 500);
  }
  if (req.headers.get("Authorization") !== `Bearer ${serviceRoleKey}`) {
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
      const { data, error } = await client
        .from("jobs")
        .select("id, type, status, payload, run_after, attempts, max_attempts, last_error")
        .eq("status", "pending")
        .in("type", supportedTypes)
        .lte("run_after", now.toISOString())
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
        .select("id, type, status, payload, run_after, attempts, max_attempts, last_error")
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

  const { error } = await client.from("jobs").insert({
    type: "parse_disclosure_pdf_ai",
    payload: { disclosureId },
    max_attempts: 3
  });
  if (error) throw error;
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
    last_error: typeof row.last_error === "string" ? row.last_error : null
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
      "id, stock_id, external_id, title, disclosure_type, storage_path, published_at, ai_parse_attempts, raw_payload, stocks(id, ticker)"
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

  if (request.textExtractionMethod === "extracted_text" && request.extractedText) {
    // Build the prompt with extracted text embedded
    const promptText = request.extractedText;
    const disclosureType = request.disclosureType;
    const title = request.disclosureTitle;

    // Re-build prompt with actual text
    const { buildPromptForDisclosure } = await import("../_shared/pdf-ai-parser.ts");
    const prompt = buildPromptForDisclosure(disclosureType, title, promptText);
    inputContent.push({ type: "input_text", text: prompt });
  } else if (request.pdfBytes) {
    // Direct PDF fallback - encode as base64
    const base64 = encodeBase64(request.pdfBytes);
    inputContent.push({
      type: "input_file",
      filename: "disclosure.pdf",
      file_data: `data:application/pdf;base64,${base64}`
    });
    // Add instruction text
    const { buildPromptForDisclosure } = await import("../_shared/pdf-ai-parser.ts");
    const prompt = buildPromptForDisclosure(
      request.disclosureType,
      request.disclosureTitle,
      "[Extract dividend information from the attached PDF]"
    );
    inputContent.push({ type: "input_text", text: prompt });
  } else {
    throw new JobHandlerError("invalid_ai_request:no_text_or_pdf", {
      retryable: false
    });
  }

  const requestBody = {
    model,
    input: inputContent
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
