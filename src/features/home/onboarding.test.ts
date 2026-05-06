import { describe, expect, it } from "vitest";
import { getHomeDisplayMode } from "@/features/home/display-state";

describe("getHomeDisplayMode", () => {
  it("returns onboarding when holdingCount is 0", () => {
    expect(getHomeDisplayMode(0)).toBe("onboarding");
  });

  it("returns dashboard when holdingCount > 0", () => {
    expect(getHomeDisplayMode(1)).toBe("dashboard");
    expect(getHomeDisplayMode(5)).toBe("dashboard");
  });
});
