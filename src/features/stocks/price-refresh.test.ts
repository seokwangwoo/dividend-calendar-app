import { describe, expect, it } from "vitest";
import { isStalePrice, hasThreeConsecutiveFailures } from "@/features/stocks/price-refresh";

describe("isStalePrice", () => {
  it("returns true when updatedAt is older than threshold", () => {
    const now = new Date();
    const stale = new Date(now.getTime() - 49 * 60 * 60 * 1000);
    expect(isStalePrice(stale.toISOString(), 48)).toBe(true);
  });

  it("returns false when updatedAt is within threshold", () => {
    const now = new Date();
    const fresh = new Date(now.getTime() - 1 * 60 * 60 * 1000);
    expect(isStalePrice(fresh.toISOString(), 48)).toBe(false);
  });

  it("returns true for null updatedAt", () => {
    expect(isStalePrice(null, 48)).toBe(true);
  });

  it("returns true for invalid date string", () => {
    expect(isStalePrice("invalid-date", 48)).toBe(true);
  });

  it("returns false exactly at threshold boundary", () => {
    const now = new Date();
    const boundary = new Date(now.getTime() - 48 * 60 * 60 * 1000 + 1);
    expect(isStalePrice(boundary.toISOString(), 48)).toBe(false);
  });

  it("returns true just past threshold boundary", () => {
    const now = new Date();
    const boundary = new Date(now.getTime() - 48 * 60 * 60 * 1000 - 1);
    expect(isStalePrice(boundary.toISOString(), 48)).toBe(true);
  });
});

describe("hasThreeConsecutiveFailures", () => {
  it("returns true for three consecutive failures", () => {
    expect(
      hasThreeConsecutiveFailures([
        { status: "failure" },
        { status: "failure" },
        { status: "failure" }
      ])
    ).toBe(true);
  });

  it("returns false when fewer than 3 logs", () => {
    expect(
      hasThreeConsecutiveFailures([{ status: "failure" }, { status: "failure" }])
    ).toBe(false);
  });

  it("returns false when the most recent is success", () => {
    expect(
      hasThreeConsecutiveFailures([
        { status: "success" },
        { status: "failure" },
        { status: "failure" }
      ])
    ).toBe(false);
  });

  it("returns false when middle log is success", () => {
    expect(
      hasThreeConsecutiveFailures([
        { status: "failure" },
        { status: "success" },
        { status: "failure" }
      ])
    ).toBe(false);
  });

  it("returns true for more than 3 failures (first 3 are failures)", () => {
    expect(
      hasThreeConsecutiveFailures([
        { status: "failure" },
        { status: "failure" },
        { status: "failure" },
        { status: "failure" }
      ])
    ).toBe(true);
  });
});
