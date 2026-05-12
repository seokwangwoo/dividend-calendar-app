import { describe, it, expect, vi, beforeEach } from "vitest";
import { revalidatePath } from "next/cache";
import { requireAdminUser } from "./auth";
import { createClient } from "@/lib/supabase/server";
import { approveDividendReview, rejectDividendReview, getSignedPdfUrl } from "./review-actions";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("./auth", () => ({ requireAdminUser: vi.fn() }));

// Mock global fetch
const fetchMock = vi.fn();
global.fetch = fetchMock;

function adminUser() {
  vi.mocked(requireAdminUser).mockResolvedValue({ id: "admin-id" });
}

function nonAdminUser() {
  vi.mocked(requireAdminUser).mockRejectedValue(new Error("Redirect: /app/home"));
}

function buildMockSupabaseWithSession(accessToken = "test-token") {
  return {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: accessToken } }
      })
    },
    rpc: vi.fn()
  };
}


beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
});

// ---------------------------------------------------------------------------
// approveDividendReview
// ---------------------------------------------------------------------------

describe("approveDividendReview", () => {
  it("fails for non-admin caller", async () => {
    nonAdminUser();
    await expect(approveDividendReview("review-id")).rejects.toThrow("Redirect: /app/home");
  });

  it("returns error when RPC fails", async () => {
    adminUser();
    const mockSupabase = buildMockSupabaseWithSession() as any;
    mockSupabase.rpc.mockResolvedValue({ error: { message: "review not found" } });
    vi.mocked(createClient).mockResolvedValue(mockSupabase);

    const result = await approveDividendReview("review-id");
    expect(result).toEqual({ ok: false, error: "review not found" });
  });

  it("returns error when override validation fails (negative dividend)", async () => {
    adminUser();
    vi.mocked(createClient).mockResolvedValue(buildMockSupabaseWithSession() as any);

    const result = await approveDividendReview("review-id", { dividendPerShare: -10 });
    expect(result).toEqual(
      expect.objectContaining({ ok: false })
    );
    expect((result as { ok: false; error: string }).error).toBeTruthy();
  });

  it("returns error when override validation fails (invalid year)", async () => {
    adminUser();
    vi.mocked(createClient).mockResolvedValue(buildMockSupabaseWithSession() as any);

    const result = await approveDividendReview("review-id", { expectedPaymentYear: 1990 });
    expect(result).toEqual(expect.objectContaining({ ok: false }));
  });

  it("calls RPC and returns ok on success", async () => {
    adminUser();
    const mockSupabase = buildMockSupabaseWithSession() as any;
    mockSupabase.rpc.mockResolvedValue({ error: null });
    vi.mocked(createClient).mockResolvedValue(mockSupabase);

    const result = await approveDividendReview("review-id", { expectedPaymentYear: 2026 });
    expect(result).toEqual({ ok: true });
    expect(mockSupabase.rpc).toHaveBeenCalledWith(
      "approve_dividend_review",
      expect.objectContaining({
        p_review_id: "review-id",
        p_override: { expectedPaymentYear: 2026 }
      })
    );
    expect(revalidatePath).toHaveBeenCalledWith("/admin/dividend-reviews");
    expect(revalidatePath).toHaveBeenCalledWith("/app/home");
  });

  it("returns error when RPC returns error", async () => {
    adminUser();
    const mockSupabase = buildMockSupabaseWithSession() as any;
    mockSupabase.rpc.mockResolvedValue({ error: { message: "expected_payment_year required" } });
    vi.mocked(createClient).mockResolvedValue(mockSupabase);

    const result = await approveDividendReview("review-id");
    expect(result).toEqual({ ok: false, error: "expected_payment_year required" });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("strips null/empty values from override before sending to RPC", async () => {
    adminUser();
    const mockSupabase = buildMockSupabaseWithSession() as any;
    mockSupabase.rpc.mockResolvedValue({ error: null });
    vi.mocked(createClient).mockResolvedValue(mockSupabase);

    await approveDividendReview("review-id", {
      expectedPaymentYear: 2026,
      dividendPerShare: null,
      changeType: null
    });

    const rpcCall = mockSupabase.rpc.mock.calls[0];
    expect(rpcCall[1].p_override).toEqual({ expectedPaymentYear: 2026 });
    expect(rpcCall[1].p_override).not.toHaveProperty("dividendPerShare");
  });
});

// ---------------------------------------------------------------------------
// rejectDividendReview
// ---------------------------------------------------------------------------

describe("rejectDividendReview", () => {
  it("fails for non-admin caller", async () => {
    nonAdminUser();
    await expect(rejectDividendReview("review-id", "test")).rejects.toThrow(
      "Redirect: /app/home"
    );
  });

  it("returns error when reason is blank", async () => {
    adminUser();
    vi.mocked(createClient).mockResolvedValue(buildMockSupabaseWithSession() as any);

    const result = await rejectDividendReview("review-id", "  ");
    expect(result).toEqual({ ok: false, error: "却下理由を入力してください" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns error when RPC fails", async () => {
    adminUser();
    const mockSupabase = buildMockSupabaseWithSession() as any;
    mockSupabase.rpc.mockResolvedValue({ error: { message: "review not found" } });
    vi.mocked(createClient).mockResolvedValue(mockSupabase);

    const result = await rejectDividendReview("review-id", "bad data");
    expect(result).toEqual({ ok: false, error: "review not found" });
  });

  it("calls RPC and returns ok on success", async () => {
    adminUser();
    const mockSupabase = buildMockSupabaseWithSession() as any;
    mockSupabase.rpc.mockResolvedValue({ error: null });
    vi.mocked(createClient).mockResolvedValue(mockSupabase);

    const result = await rejectDividendReview("review-id", "データ不備");
    expect(result).toEqual({ ok: true });
    expect(mockSupabase.rpc).toHaveBeenCalledWith(
      "reject_dividend_review",
      expect.objectContaining({
        p_review_id: "review-id",
        p_reason: "データ不備"
      })
    );
    expect(revalidatePath).toHaveBeenCalledWith("/admin/dividend-reviews");
    expect(revalidatePath).toHaveBeenCalledWith("/app/home");
  });

  it("returns error when RPC returns error", async () => {
    adminUser();
    const mockSupabase = buildMockSupabaseWithSession() as any;
    mockSupabase.rpc.mockResolvedValue({ error: { message: "review already rejected" } });
    vi.mocked(createClient).mockResolvedValue(mockSupabase);

    const result = await rejectDividendReview("review-id", "reason");
    expect(result).toEqual({ ok: false, error: "review already rejected" });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// getSignedPdfUrl
// ---------------------------------------------------------------------------

describe("getSignedPdfUrl", () => {
  it("fails for non-admin caller", async () => {
    nonAdminUser();
    await expect(getSignedPdfUrl("disclosures/test/test.pdf")).rejects.toThrow(
      "Redirect: /app/home"
    );
  });

  it("returns error when storage_path is empty", async () => {
    adminUser();
    const result = await getSignedPdfUrl("");
    expect(result).toEqual({ error: "storage_path が指定されていません" });
  });

  it("returns error when SUPABASE_SERVICE_ROLE_KEY is missing", async () => {
    adminUser();
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    const result = await getSignedPdfUrl("disclosures/ticker/2026-01-01/test.pdf");
    expect(result).toEqual({ error: "サーバー設定エラー" });
  });

  it("returns signed URL on success", async () => {
    adminUser();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        signedURL: "https://test.supabase.co/storage/v1/object/sign/disclosures/test.pdf?token=abc"
      })
    });

    const result = await getSignedPdfUrl("disclosures/ticker/2026-01-01/test.pdf");
    expect(result).toEqual({
      url: "https://test.supabase.co/storage/v1/object/sign/disclosures/test.pdf?token=abc"
    });
    // Should call storage sign endpoint with service role key
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toContain("/storage/v1/object/sign/disclosures/");
    expect(opts.headers.Authorization).toBe("Bearer test-service-role-key");
    // The request must not use NEXT_PUBLIC_SUPABASE_ANON_KEY — service role only
  });

  it("returns error when fetch fails", async () => {
    adminUser();
    fetchMock.mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => "Not found"
    });

    const result = await getSignedPdfUrl("disclosures/missing/path.pdf");
    expect(result).toEqual(
      expect.objectContaining({ error: expect.stringContaining("失敗") })
    );
  });

  it("uses service role key, not anon key, for storage access", async () => {
    adminUser();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ signedURL: "https://example.com/signed" })
    });

    await getSignedPdfUrl("disclosures/ticker/date/file.pdf");

    const opts = fetchMock.mock.calls[0][1];
    // MUST use service role key
    expect(opts.headers.Authorization).toBe("Bearer test-service-role-key");
    // MUST NOT use anon key (security check)
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
    if (anonKey) {
      expect(opts.headers.Authorization).not.toBe(`Bearer ${anonKey}`);
    }
  });
});
