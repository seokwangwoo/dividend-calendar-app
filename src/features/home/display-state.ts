export function getHomeDisplayMode(holdingCount: number): "onboarding" | "dashboard" {
  return holdingCount === 0 ? "onboarding" : "dashboard";
}

export function getGoalDisplayState(
  holdingCount: number,
  annualGoal: number | null
): "hidden" | "prompt" | "progress" {
  if (holdingCount === 0) {
    return "hidden";
  }
  if (annualGoal == null) {
    return "prompt";
  }
  return "progress";
}
