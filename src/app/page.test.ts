import { describe, it, expect, vi } from "vitest";
import { redirect } from "next/navigation";
import RootPage from "./page";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`Redirect: ${url}`);
  })
}));

describe("RootPage", () => {
  it("redirects to /app/home", () => {
    try {
      RootPage();
    } catch {
      // redirect throws
    }
    expect(redirect).toHaveBeenCalledWith("/app/home");
  });
});
