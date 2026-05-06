import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { middleware } from "./middleware";

vi.mock("next/server", () => ({
  NextResponse: {
    next: vi.fn((opts) => ({ cookies: { set: vi.fn() }, ...opts })),
    redirect: vi.fn((url) => ({ url }))
  }
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn()
}));

function createMockRequest(pathname: string) {
  const url = new URL(`http://localhost:3000${pathname}`);
  return {
    url: url.toString(),
    nextUrl: {
      ...url,
      pathname: url.pathname,
      searchParams: url.searchParams,
      clone: vi.fn(() => new URL(`http://localhost:3000${pathname}`))
    },
    cookies: {
      getAll: vi.fn(() => []),
      set: vi.fn()
    }
  } as any;
}

function mockSupabaseClient(opts: { user?: any; profile?: any }) {
  const client = {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: opts.user ?? null } })
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: opts.profile ?? null })
        })
      })
    })
  };
  (createServerClient as ReturnType<typeof vi.fn>).mockReturnValue(client);
  return client;
}

describe("middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows authenticated users to access /app routes", async () => {
    mockSupabaseClient({ user: { id: "user-1" } });
    const request = createMockRequest("/app/home");
    const result = await middleware(request);
    expect(NextResponse.next).toHaveBeenCalled();
    expect(NextResponse.redirect).not.toHaveBeenCalled();
    expect(result).toBeDefined();
  });

  it("redirects unauthenticated users from /app to login with next param", async () => {
    mockSupabaseClient({ user: null });
    const request = createMockRequest("/app/home");
    await middleware(request);
    expect(NextResponse.redirect).toHaveBeenCalled();
    const redirectUrl = (NextResponse.redirect as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    expect(redirectUrl.pathname).toBe("/auth/login");
    expect(redirectUrl.searchParams.get("next")).toBe("/app/home");
  });

  it("redirects unauthenticated users from /admin to login with next param", async () => {
    mockSupabaseClient({ user: null });
    const request = createMockRequest("/admin/users");
    await middleware(request);
    expect(NextResponse.redirect).toHaveBeenCalled();
    const redirectUrl = (NextResponse.redirect as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    expect(redirectUrl.pathname).toBe("/auth/login");
    expect(redirectUrl.searchParams.get("next")).toBe("/admin/users");
  });

  it("redirects non-admin users from /admin to /app/home", async () => {
    mockSupabaseClient({ user: { id: "user-1" }, profile: { role: "user" } });
    const request = createMockRequest("/admin/users");
    await middleware(request);
    expect(NextResponse.redirect).toHaveBeenCalled();
    const redirectUrl = (NextResponse.redirect as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    expect(redirectUrl.pathname).toBe("/app/home");
  });

  it("allows admin users to access /admin routes", async () => {
    mockSupabaseClient({
      user: { id: "admin-1" },
      profile: { role: "admin" }
    });
    const request = createMockRequest("/admin/users");
    const result = await middleware(request);
    expect(NextResponse.redirect).not.toHaveBeenCalled();
    expect(result).toBeDefined();
  });

  it("passes through for authenticated users on non-app non-admin paths (not matched by config, but testing logic)", async () => {
    mockSupabaseClient({ user: { id: "user-1" } });
    const request = createMockRequest("/public");
    const result = await middleware(request);
    expect(NextResponse.next).toHaveBeenCalled();
    expect(NextResponse.redirect).not.toHaveBeenCalled();
    expect(result).toBeDefined();
  });
});
