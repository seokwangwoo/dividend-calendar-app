import { describe, it, expect, vi, beforeEach } from "vitest";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "./server";

vi.mock("next/headers", () => ({
  cookies: vi.fn(() => ({
    getAll: vi.fn(() => []),
    set: vi.fn()
  }))
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({ mocked: true }))
}));

describe("createClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a server client with cookie helpers", async () => {
    const cookieStore = {
      getAll: vi.fn(() => [{ name: "sb-token", value: "token" }]),
      set: vi.fn()
    };
    (cookies as ReturnType<typeof vi.fn>).mockResolvedValue(cookieStore);

    const client = await createClient();
    expect(createServerClient).toHaveBeenCalledWith(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      expect.objectContaining({
        cookies: expect.objectContaining({
          getAll: expect.any(Function),
          setAll: expect.any(Function)
        })
      })
    );
    expect(client).toEqual({ mocked: true });

    const cookieArg = (createServerClient as ReturnType<typeof vi.fn>).mock
      .calls[0][2];

    expect(cookieArg.cookies.getAll()).toEqual([
      { name: "sb-token", value: "token" }
    ]);

    cookieArg.cookies.setAll([
      { name: "new-token", value: "val", options: { maxAge: 3600 } }
    ]);
    expect(cookieStore.set).toHaveBeenCalledWith("new-token", "val", {
      maxAge: 3600
    });
  });

  it("handles cookie set errors silently", async () => {
    const cookieStore = {
      getAll: vi.fn(() => []),
      set: vi.fn(() => {
        throw new Error("Cannot set cookies");
      })
    };
    (cookies as ReturnType<typeof vi.fn>).mockResolvedValue(cookieStore);

    await createClient();
    const cookieArg = (createServerClient as ReturnType<typeof vi.fn>).mock
      .calls[0][2];

    expect(() => {
      cookieArg.cookies.setAll([
        { name: "token", value: "val", options: {} }
      ]);
    }).not.toThrow();
  });
});
