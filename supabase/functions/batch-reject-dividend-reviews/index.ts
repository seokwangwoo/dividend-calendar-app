import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

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
  const reviewIds: string[] = Array.isArray(body.reviewIds) ? body.reviewIds : [];
  const reason: string = typeof body.reason === "string" ? body.reason : "batch_reject";

  if (reviewIds.length === 0) {
    return new Response(JSON.stringify({ error: "reviewIds is required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  if (reviewIds.length > 100) {
    return new Response(JSON.stringify({ error: "Cannot reject more than 100 reviews at once" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  const { data, error: updateError } = await client
    .from("dividend_reviews")
    .update({
      status: "rejected",
      rejection_reason: reason,
      reviewed_by: authResult.userId,
      reviewed_at: new Date().toISOString()
    })
    .in("id", reviewIds)
    .eq("status", "pending")
    .select("id");

  if (updateError) {
    return new Response(JSON.stringify({ error: updateError.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  return new Response(
    JSON.stringify({
      rejectedCount: (data ?? []).length,
      requestedCount: reviewIds.length,
      rejectedIds: (data ?? []).map((r) => r.id)
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
