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
    }
  };
}

function buildMockSupabaseNoSession() {
  return {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } })
    }
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

  it("returns error when session is missing", async () => {
    adminUser();
    vi.mocked(createClient).mockResolvedValue(buildMockSupabaseNoSession() as any);

    const result = await approveDividendReview("review-id");
    expect(result).toEqual({ ok: false, error: "未認証" });
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

    const result = await approveDividendReview("review-id", { paymentYear: 1990 });
    expect(result).toEqual(expect.objectContaining({ ok: false }));
  });

  it("calls Edge Function and returns ok on success", async () => {
    adminUser();
    vi.mocked(createClient).mockResolvedValue(buildMockSupabaseWithSession() as any);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ dividendEventId: "event-id" })
    });

    const result = await approveDividendReview("review-id", { paymentYear: 2026 });
    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://test.supabase.co/functions/v1/approve-dividend-review",
      expect.objectContaining({ method: "POST" })
    );
    expect(revalidatePath).toHaveBeenCalledWith("/admin/dividend-reviews");
    expect(revalidatePath).toHaveBeenCalledWith("/app/home");
  });

  it("returns error on Edge Function HTTP error", async () => {
    adminUser();
    vi.mocked(createClient).mockResolvedValue(buildMockSupabaseWithSession() as any);
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: "payment_year required" })
    });

    const result = await approveDividendReview("review-id");
    expect(result).toEqual({ ok: false, error: "payment_year required" });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("strips null/empty values from override before sending", async () => {
    adminUser();
    vi.mocked(createClient).mockResolvedValue(buildMockSupabaseWithSession() as any);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ dividendEventId: "event-id" })
    });

    await approveDividendReview("review-id", {
      paymentYear: 2026,
      dividendPerShare: null,
      changeType: null
    });

    const bodyArg = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(bodyArg.override).toEqual({ paymentYear: 2026 });
    expect(bodyArg.override).not.toHaveProperty("dividendPerShare");
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

  it("returns error when session is missing", async () => {
    adminUser();
    vi.mocked(createClient).mockResolvedValue(buildMockSupabaseNoSession() as any);

    const result = await rejectDividendReview("review-id", "bad data");
    expect(result).toEqual({ ok: false, error: "未認証" });
  });

  it("calls Edge Function and returns ok on success", async () => {
    adminUser();
    vi.mocked(createClient).mockResolvedValue(buildMockSupabaseWithSession() as any);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ status: "rejected" })
    });

    const result = await rejectDividendReview("review-id", "データ不備");
    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://test.supabase.co/functions/v1/reject-dividend-review",
      expect.objectContaining({ method: "POST" })
    );
    expect(revalidatePath).toHaveBeenCalledWith("/admin/dividend-reviews");
    expect(revalidatePath).toHaveBeenCalledWith("/app/home");
  });

  it("returns error on Edge Function HTTP error", async () => {
    adminUser();
    vi.mocked(createClient).mockResolvedValue(buildMockSupabaseWithSession() as any);
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: "review already rejected" })
    });

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
