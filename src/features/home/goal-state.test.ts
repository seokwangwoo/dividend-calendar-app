import { describe, expect, it } from "vitest";
import { getGoalDisplayState } from "@/features/home/display-state";

describe("getGoalDisplayState", () => {
  it("returns hidden when holdingCount is 0", () => {
    expect(getGoalDisplayState(0, null)).toBe("hidden");
    expect(getGoalDisplayState(0, 120000)).toBe("hidden");
  });

  it("returns prompt when holdings exist but goal is null", () => {
    expect(getGoalDisplayState(1, null)).toBe("prompt");
  });

  it("returns progress when holdings exist and goal is set", () => {
    expect(getGoalDisplayState(1, 120000)).toBe("progress");
    expect(getGoalDisplayState(3, 50000)).toBe("progress");
  });
});
