import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { GET } from "./route";

vi.mock("next/server", () => ({
  NextResponse: {
    next: vi.fn((opts) => ({ cookies: { set: vi.fn() }, ...opts })),
    redirect: vi.fn((url) => ({ url }))
  }
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

describe("GET /auth/callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function createMockRequest(searchParams: Record<string, string>) {
    const url = new URL("http://localhost:3000/auth/callback");
    for (const [key, value] of Object.entries(searchParams)) {
      url.searchParams.set(key, value);
    }
    return { url: url.toString(), nextUrl: url } as any;
  }

  it("exchanges code for session and redirects to next", async () => {
    const exchangeCodeForSession = vi.fn().mockResolvedValue({});
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { exchangeCodeForSession }
    });

    const request = createMockRequest({
      code: "auth-code",
      next: "/app/dashboard"
    });
    await GET(request);

    expect(createClient).toHaveBeenCalled();
    expect(exchangeCodeForSession).toHaveBeenCalledWith("auth-code");
    expect(NextResponse.redirect).toHaveBeenCalledWith(
      new URL("/app/dashboard", "http://localhost:3000")
    );
  });

  it("redirects to /app/home when no code is provided", async () => {
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { exchangeCodeForSession: vi.fn() }
    });

    const request = createMockRequest({});
    await GET(request);

    expect(createClient).not.toHaveBeenCalled();
    expect(NextResponse.redirect).toHaveBeenCalledWith(
      new URL("/app/home", "http://localhost:3000")
    );
  });

  it("redirects to /app/home when next is missing", async () => {
    const exchangeCodeForSession = vi.fn().mockResolvedValue({});
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { exchangeCodeForSession }
    });

    const request = createMockRequest({ code: "auth-code" });
    await GET(request);

    expect(exchangeCodeForSession).toHaveBeenCalledWith("auth-code");
    expect(NextResponse.redirect).toHaveBeenCalledWith(
      new URL("/app/home", "http://localhost:3000")
    );
  });
});
