import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

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
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const senderAddress = Deno.env.get("RESEND_SENDER_ADDRESS") ?? "notifications@example.com";

  if (!supabaseUrl || !serviceRoleKey || !resendApiKey) {
    return new Response(JSON.stringify({ error: "Missing environment variables" }), {
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

  // Fetch pending email notifications with user email and settings
  const { data: rows, error: queryError } = await admin
    .from("notifications")
    .select(`
      *,
      profiles!inner(email),
      user_settings!inner(email_notification_enabled)
    `)
    .eq("channel", "email")
    .is("sent_via_email_at", null)
    .or("email_delivery_status.is.null,email_delivery_status.neq.sent")
    .order("created_at", { ascending: true })
    .limit(100);

  if (queryError) {
    return new Response(JSON.stringify({ error: queryError.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  const results: Array<{
    notificationId: string;
    status: "sent" | "failed" | "skipped_disabled" | "skipped_no_email";
    error?: string;
  }> = [];

  for (const row of rows ?? []) {
    const notificationId = row.id as string;
    const userEmail = (row.profiles as { email: string } | null)?.email;
    const emailEnabled = (row.user_settings as { email_notification_enabled: boolean } | null)
      ?.email_notification_enabled;

    if (!emailEnabled) {
      results.push({ notificationId, status: "skipped_disabled" });
      continue;
    }

    if (!userEmail) {
      await admin.rpc("mark_notification_email_delivered", {
        p_notification_id: notificationId,
        p_status: "failed",
        p_error: "User email not found"
      });
      results.push({ notificationId, status: "skipped_no_email", error: "User email not found" });
      continue;
    }

    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          from: senderAddress,
          to: userEmail,
          subject: row.title,
          text: row.body
        })
      });

      if (!res.ok) {
        const errBody = await res.text();
        const errorSummary = `Resend HTTP ${res.status}: ${errBody.slice(0, 200)}`;
        await admin.rpc("mark_notification_email_delivered", {
          p_notification_id: notificationId,
          p_status: "failed",
          p_error: errorSummary
        });
        results.push({ notificationId, status: "failed", error: errorSummary });
        continue;
      }

      await admin.rpc("mark_notification_email_delivered", {
        p_notification_id: notificationId,
        p_status: "sent"
      });
      results.push({ notificationId, status: "sent" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await admin.rpc("mark_notification_email_delivered", {
        p_notification_id: notificationId,
        p_status: "failed",
        p_error: message.slice(0, 200)
      });
      results.push({ notificationId, status: "failed", error: message });
    }
  }

  return new Response(
    JSON.stringify({
      processed: results.length,
      results
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
