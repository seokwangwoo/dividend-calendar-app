import { expect } from "vitest";

export function expectApprox(
  actual: number | null | undefined,
  expected: number,
  tolerance = 0.01,
  label = ""
): void {
  expect(actual, label).not.toBeNull();
  expect(Math.abs(Number(actual) - expected), label).toBeLessThanOrEqual(
    tolerance
  );
}
