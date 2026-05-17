export type YieldTargetOperator = "gte" | "lte";

export function calculateAchieved(
  operator: YieldTargetOperator,
  targetYield: number,
  currentYield: number | null
): boolean {
  if (currentYield === null) {
    return false;
  }

  if (operator === "gte") {
    return currentYield >= targetYield;
  }

  return currentYield <= targetYield;
}
