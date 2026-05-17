import { describe, expect, it } from "vitest";
import { calculateAchieved } from "./yield-target";

describe("calculateAchieved", () => {
  it("returns true for gte when current yield is at least the target", () => {
    expect(calculateAchieved("gte", 3.5, 3.5)).toBe(true);
    expect(calculateAchieved("gte", 3.5, 4.1)).toBe(true);
  });

  it("returns false for gte when current yield is below the target", () => {
    expect(calculateAchieved("gte", 3.5, 3.4)).toBe(false);
  });

  it("returns false for gte when current yield is null", () => {
    expect(calculateAchieved("gte", 3.5, null)).toBe(false);
  });

  it("returns true for lte when current yield is at most the target", () => {
    expect(calculateAchieved("lte", 3.5, 3.5)).toBe(true);
    expect(calculateAchieved("lte", 3.5, 2.8)).toBe(true);
  });

  it("returns false for lte when current yield is above the target", () => {
    expect(calculateAchieved("lte", 3.5, 3.6)).toBe(false);
  });

  it("returns false for lte when current yield is null", () => {
    expect(calculateAchieved("lte", 3.5, null)).toBe(false);
  });
});
