import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.1";

interface RequestBody {
  notificationId?: string;
}

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

  const body = (await req.json().catch(() => ({}))) as RequestBody;
  if (!body.notificationId) {
    return new Response(JSON.stringify({ error: "notificationId is required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  // Fetch notification with user settings
  const { data: notification, error: notifError } = await admin
    .from("notifications")
    .select("*, user_settings!inner(email_notification_enabled)")
    .eq("id", body.notificationId)
    .eq("channel", "email")
    .single();

  if (notifError || !notification) {
    return new Response(
      JSON.stringify({ error: notifError?.message ?? "Notification not found" }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Skip if already sent
  if (notification.sent_via_email_at != null) {
    return new Response(
      JSON.stringify({ status: "skipped_already_sent", notificationId: body.notificationId }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Skip if user disabled email notifications
  if (notification.user_settings?.email_notification_enabled === false) {
    return new Response(
      JSON.stringify({ status: "skipped_disabled", notificationId: body.notificationId }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Fetch user email from profiles (fallback to auth user)
  const { data: profile } = await admin
    .from("profiles")
    .select("email")
    .eq("id", notification.user_id)
    .single();

  const userEmail = profile?.email;
  if (!userEmail) {
    await admin.rpc("mark_notification_email_delivered", {
      p_notification_id: body.notificationId,
      p_status: "failed",
      p_error: "User email not found"
    });
    return new Response(
      JSON.stringify({ status: "failed", error: "User email not found", notificationId: body.notificationId }),
      { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Send via Resend
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
        subject: notification.title,
        text: notification.body
      })
    });

    if (!res.ok) {
      const errBody = await res.text();
      await admin.rpc("mark_notification_email_delivered", {
        p_notification_id: body.notificationId,
        p_status: "failed",
        p_error: `Resend HTTP ${res.status}: ${errBody.slice(0, 200)}`
      });
      return new Response(
        JSON.stringify({ status: "failed", error: `Resend HTTP ${res.status}`, notificationId: body.notificationId }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    await admin.rpc("mark_notification_email_delivered", {
      p_notification_id: body.notificationId,
      p_status: "sent"
    });

    return new Response(
      JSON.stringify({ status: "sent", notificationId: body.notificationId }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await admin.rpc("mark_notification_email_delivered", {
      p_notification_id: body.notificationId,
      p_status: "failed",
      p_error: message.slice(0, 200)
    });
    return new Response(
      JSON.stringify({ status: "failed", error: message, notificationId: body.notificationId }),
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
