import { describe, it, expect, vi, beforeEach } from "vitest";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAdminUser } from "./auth";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`Redirect: ${url}`);
  })
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn()
}));

function buildMockSupabase({
  user,
  role
}: {
  user: { id: string } | null;
  role?: "admin" | "user";
}) {
  const profileChain: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: role !== undefined ? { role } : null,
      error: null
    })
  };

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user } })
    },
    from: vi.fn().mockReturnValue(profileChain)
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("requireAdminUser", () => {
  it("resolves with user id for admin profile", async () => {
    vi.mocked(createClient).mockResolvedValue(
      buildMockSupabase({ user: { id: "admin-id" }, role: "admin" }) as any
    );

    const result = await requireAdminUser();
    expect(result).toEqual({ id: "admin-id" });
  });

  it("redirects to login when there is no session", async () => {
    vi.mocked(createClient).mockResolvedValue(
      buildMockSupabase({ user: null }) as any
    );

    await expect(requireAdminUser()).rejects.toThrow("Redirect: /auth/login");
    expect(redirect).toHaveBeenCalledWith("/auth/login");
  });

  it("redirects to home when profile role is not admin", async () => {
    vi.mocked(createClient).mockResolvedValue(
      buildMockSupabase({ user: { id: "user-id" }, role: "user" }) as any
    );

    await expect(requireAdminUser()).rejects.toThrow("Redirect: /app/home");
    expect(redirect).toHaveBeenCalledWith("/app/home");
  });

  it("redirects to home when profile is null", async () => {
    vi.mocked(createClient).mockResolvedValue(
      buildMockSupabase({ user: { id: "user-id" }, role: undefined }) as any
    );

    await expect(requireAdminUser()).rejects.toThrow("Redirect: /app/home");
    expect(redirect).toHaveBeenCalledWith("/app/home");
  });
});
