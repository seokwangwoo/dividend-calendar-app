import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

const dividendKeywords = [
  "配当",
  "配当予想",
  "配当予想の修正",
  "剰余金の配当",
  "期末配当",
  "中間配当",
  "増配",
  "減配",
  "無配",
  "復配",
  "記念配当",
  "特別配当",
  "株式分割",
  "決算短信",
  "業績予想及び配当予想"
];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) {
    return new Response(JSON.stringify({ error: "Missing Supabase environment" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  const client = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const body = await req.json().catch(() => ({}));
  const candidates = Array.isArray(body.disclosures)
    ? body.disclosures
    : Array.isArray(body.candidates)
      ? body.candidates
      : [];
  const results = [];

  for (const candidate of candidates) {
    const title = String(candidate.title ?? "");
    if (!dividendKeywords.some((keyword) => title.includes(keyword))) {
      results.push({ externalId: candidate.externalId, skipped: "keyword" });
      continue;
    }

    const { data, error } = await client.rpc("collect_disclosure_candidate", {
      p_candidate: candidate
    });
    results.push(error ? { externalId: candidate.externalId, error: error.message } : data);
  }

  return new Response(JSON.stringify({ results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
});
