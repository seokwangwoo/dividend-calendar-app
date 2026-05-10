import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.1";
import {
  buildYanoshinListUrl,
  classifyCandidate,
  extractYanoshinRows,
  normalizeCandidateInput,
  normalizeYanoshinRow,
  resolveYanoshinCondition,
  type ClassifiedDisclosureCandidate,
  type YanoshinFormat
} from "../_shared/disclosure-collection.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

type JsonRecord = Record<string, unknown>;

type CollectionResult =
  | {
      externalId: string;
      disclosureId?: string;
      inserted: boolean;
      jobCreated: boolean;
      skipped?: never;
    }
  | {
      externalId: string;
      skipped: string;
      inserted?: never;
      jobCreated?: never;
    }
  | {
      externalId: string;
      error: string;
      inserted?: never;
      jobCreated?: never;
    };

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "Missing Supabase environment" }, 500);
  }
  if (req.headers.get("Authorization") !== `Bearer ${serviceRoleKey}`) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const body = await req.json().catch(() => ({}));
  const normalizedInputs = Array.isArray(body.disclosures)
    ? body.disclosures
    : Array.isArray(body.candidates)
      ? body.candidates
      : null;

  const source =
    normalizedInputs == null
      ? await fetchYanoshinCandidates(body)
      : {
          candidates: normalizedInputs
            .filter(isRecord)
            .map((candidate) => classifyCandidate(normalizeCandidateInput(candidate))),
          url: null
        };

  const results: CollectionResult[] = [];

  for (const candidate of source.candidates) {
    if (!candidate.accepted) {
      results.push({ externalId: candidate.externalId, skipped: candidate.skipReason ?? "keyword" });
      continue;
    }

    try {
      results.push(await persistCandidate(client, candidate));
    } catch (error) {
      results.push({
        externalId: candidate.externalId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return jsonResponse({ sourceUrl: source.url, results });
});

async function fetchYanoshinCandidates(body: JsonRecord): Promise<{
  candidates: ClassifiedDisclosureCandidate[];
  url: string;
}> {
  const condition = resolveYanoshinCondition({
    mode: typeof body.mode === "string" ? body.mode : null,
    date: typeof body.date === "string" ? body.date : null,
    condition: typeof body.condition === "string" ? body.condition : null
  });
  const format = body.format === "json" ? "json" : ("json2" satisfies YanoshinFormat);
  const limit = typeof body.limit === "number" || typeof body.limit === "string"
    ? body.limit
    : Deno.env.get("YANOSHIN_LIST_LIMIT");
  const url = buildYanoshinListUrl({ condition, format, limit });
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Yanoshin request failed: ${response.status}`);
  }

  const payload = await response.json();
  return {
    url,
    candidates: extractYanoshinRows(payload).map((row) =>
      classifyCandidate(normalizeYanoshinRow(row))
    )
  };
}

async function persistCandidate(
  client: ReturnType<typeof createClient>,
  candidate: ClassifiedDisclosureCandidate
): Promise<CollectionResult> {
  const stockId = candidate.ticker ? await findStockId(client, candidate.ticker) : null;
  const missingDocumentUrl = candidate.documentUrl == null;
  const disclosurePayload = {
    stock_id: stockId,
    external_id: candidate.externalId,
    source_type: candidate.sourceType,
    title: candidate.title,
    document_url: candidate.documentUrl,
    published_at: candidate.publishedAt,
    disclosure_type: candidate.disclosureType,
    parse_status: missingDocumentUrl ? "skipped" : "pending",
    review_priority: missingDocumentUrl ? "high" : candidate.reviewPriority,
    last_parse_error: missingDocumentUrl ? "missing_document_url" : null,
    raw_payload: {
      ...candidate.rawPayload,
      companyName: candidate.companyName,
      ticker: candidate.ticker,
      missing_document_url: missingDocumentUrl || undefined
    }
  };

  const { data: existing, error: existingError } = await client
    .from("disclosures")
    .select("id, storage_path")
    .eq("external_id", candidate.externalId)
    .maybeSingle();
  if (existingError) throw existingError;

  const disclosureId = existing?.id ?? (await insertDisclosure(client, disclosurePayload));

  if (existing?.id) {
    const { error } = await client
      .from("disclosures")
      .update(disclosurePayload)
      .eq("id", existing.id);
    if (error) throw error;
  }

  const jobCreated =
    !missingDocumentUrl && !existing?.storage_path
      ? await ensureDownloadJob(client, disclosureId)
      : false;

  return {
    externalId: candidate.externalId,
    disclosureId,
    inserted: existing == null,
    jobCreated
  };
}

async function insertDisclosure(
  client: ReturnType<typeof createClient>,
  disclosurePayload: JsonRecord
): Promise<string> {
  const { data, error } = await client
    .from("disclosures")
    .insert(disclosurePayload)
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

async function findStockId(
  client: ReturnType<typeof createClient>,
  ticker: string
): Promise<string | null> {
  const { data, error } = await client
    .from("stocks")
    .select("id")
    .eq("ticker", ticker)
    .maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

async function ensureDownloadJob(
  client: ReturnType<typeof createClient>,
  disclosureId: string
): Promise<boolean> {
  const { data: existing, error: existingError } = await client
    .from("jobs")
    .select("id")
    .eq("type", "download_disclosure_pdf")
    .contains("payload", { disclosureId })
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) return false;

  const { error } = await client.from("jobs").insert({
    type: "download_disclosure_pdf",
    payload: { disclosureId },
    max_attempts: 3
  });
  if (error) throw error;
  return true;
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
