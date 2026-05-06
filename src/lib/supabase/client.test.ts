import { describe, it, expect, vi } from "vitest";
import { createBrowserClient } from "@supabase/ssr";
import { createClient } from "./client";

vi.mock("@supabase/ssr", () => ({
  createBrowserClient: vi.fn(() => ({ mocked: true }))
}));

describe("createClient", () => {
  it("creates a browser client with environment variables", () => {
    const client = createClient();
    expect(createBrowserClient).toHaveBeenCalledWith(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
    expect(client).toEqual({ mocked: true });
  });
});
