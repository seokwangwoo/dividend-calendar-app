"use server";

import { revalidatePath } from "next/cache";
import { requireAdminUser } from "./auth";
import { createClient } from "@/lib/supabase/server";
import { validateApprovalOverride } from "./validation";

const USER_FACING_PATHS = ["/app/home", "/app/portfolio", "/app/calendar"];

export type ApprovalOverride = {
  dividendPerShare?: number | null;
  previousDividendPerShare?: number | null;
  expectedPaymentMonth?: number | null;
  paymentYear?: number | null;
  eventType?: string | null;
  status?: string | null;
  changeType?: string | null;
  expectedPaymentDate?: string | null;
  recordDate?: string | null;
  exDividendDate?: string | null;
};

/** Approve a dividend_review via the DB RPC directly. */
export async function approveDividendReview(
  reviewId: string,
  override: ApprovalOverride = {}
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdminUser();

  const validationErrors = validateApprovalOverride(
    override as Record<string, unknown>
  );
  if (Object.keys(validationErrors).length > 0) {
    const first = Object.values(validationErrors)[0];
    return { ok: false, error: first };
  }

  const supabase = await createClient();

  // Strip null/undefined from override to keep payload clean
  const cleanOverride: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(override)) {
    if (v !== null && v !== undefined && v !== "") {
      cleanOverride[k] = v;
    }
  }

  const { error: rpcError } = await supabase.rpc(
    "approve_dividend_review",
    {
      p_review_id: reviewId,
      p_override: cleanOverride
    }
  );

  if (rpcError) {
    return { ok: false, error: rpcError.message };
  }

  revalidatePath("/admin/dividend-reviews");
  USER_FACING_PATHS.forEach((p) => revalidatePath(p));

  return { ok: true };
}

/** Reject a dividend_review via the DB RPC directly. */
export async function rejectDividendReview(
  reviewId: string,
  reason: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdminUser();

  const trimmedReason = reason.trim();
  if (!trimmedReason) {
    return { ok: false, error: "却下理由を入力してください" };
  }

  const supabase = await createClient();

  const { error: rpcError } = await supabase.rpc(
    "reject_dividend_review",
    {
      p_review_id: reviewId,
      p_reason: trimmedReason
    }
  );

  if (rpcError) {
    return { ok: false, error: rpcError.message };
  }

  revalidatePath("/admin/dividend-reviews");
  USER_FACING_PATHS.forEach((p) => revalidatePath(p));

  return { ok: true };
}

/**
 * Generate a short-lived signed URL for a disclosure's stored PDF.
 * This is admin-only and uses the service-role Supabase client server-side.
 * The SUPABASE_SERVICE_ROLE_KEY is never exposed to browser code.
 */
export async function getSignedPdfUrl(
  storagePath: string
): Promise<{ url: string } | { error: string }> {
  await requireAdminUser();

  if (!storagePath) {
    return { error: "storage_path が指定されていません" };
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return { error: "サーバー設定エラー" };
  }

  // Use service-role key via REST API to create a signed URL
  // (server-side only — never reaches the browser)
  const res = await fetch(
    `${supabaseUrl}/storage/v1/object/sign/disclosures/${encodeURIComponent(storagePath)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey
      },
      body: JSON.stringify({ expiresIn: 300 }) // 5 minutes
    }
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { error: `署名URLの生成に失敗しました: ${text || res.status}` };
  }

  const json = await res.json().catch(() => null);
  const signedUrl: string | undefined = json?.signedURL ?? json?.signedUrl;

  if (!signedUrl) {
    return { error: "署名URLを取得できませんでした" };
  }

  // Prepend the Supabase URL if the path is relative
  const fullUrl = signedUrl.startsWith("http")
    ? signedUrl
    : `${supabaseUrl}${signedUrl}`;

  return { url: fullUrl };
}
