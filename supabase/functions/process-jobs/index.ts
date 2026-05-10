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
    download_disclosure_pdf: createDownloadDisclosurePdfHandler(supabase)
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
