import type { AccountType } from "@/lib/constants/dividends";
import { TAX_RATES } from "@/lib/dividends/calculations";
import type {
  NotificationOperator,
  NotificationRuleBasis
} from "@/features/notifications/constants";

export function getTaxRateForAccountType(accountType: AccountType): number {
  return TAX_RATES[accountType];
}

export function calculateCurrentYield(params: {
  expectedAnnualDividendPerShare: number | null;
  currentPrice: number | null;
  basis: NotificationRuleBasis;
  accountType: AccountType;
}): number | null {
  const {
    expectedAnnualDividendPerShare,
    currentPrice,
    basis,
    accountType
  } = params;

  if (
    expectedAnnualDividendPerShare == null ||
    currentPrice == null ||
    currentPrice <= 0
  ) {
    return null;
  }

  const beforeTaxYield = (expectedAnnualDividendPerShare / currentPrice) * 100;

  if (basis === "before_tax_yield") {
    return beforeTaxYield;
  }

  return beforeTaxYield * (1 - getTaxRateForAccountType(accountType));
}

export function ruleMatches(params: {
  evaluatedYield: number;
  targetYield: number;
  operator: NotificationOperator;
}): boolean {
  const { evaluatedYield, targetYield, operator } = params;
  return operator === "gte"
    ? evaluatedYield >= targetYield
    : evaluatedYield <= targetYield;
}

export function isWithinDeduplicationWindow(
  lastTriggeredAt: string | null,
  now = new Date()
): boolean {
  if (!lastTriggeredAt) {
    return false;
  }

  const lastTriggeredTime = new Date(lastTriggeredAt).getTime();
  if (Number.isNaN(lastTriggeredTime)) {
    return false;
  }

  return now.getTime() - lastTriggeredTime < 24 * 60 * 60 * 1000;
}

export function formatRuleCondition(params: {
  targetYield: number;
  operator: NotificationOperator;
}): string {
  return `${params.targetYield.toFixed(1)}%${params.operator === "gte" ? "以上" : "以下"}`;
}

export type YieldRuleEvaluationResult =
  | { action: "skip_stale"; lastConditionMet: boolean }
  | { action: "skip_missing_yield"; lastConditionMet: boolean }
  | { action: "no_change"; lastConditionMet: boolean }
  | { action: "transition_to_unmet"; lastConditionMet: false }
  | { action: "transition_to_met"; lastConditionMet: true };

export function evaluateYieldRuleTransition(params: {
  expectedAnnualDividendPerShare: number | null;
  currentPrice: number | null;
  priceUpdatedAt: string | Date | null;
  basis: NotificationRuleBasis;
  accountType: AccountType;
  targetYield: number;
  operator: NotificationOperator;
  lastConditionMet: boolean;
  staleThresholdHours?: number;
}): YieldRuleEvaluationResult {
  const {
    expectedAnnualDividendPerShare,
    currentPrice,
    priceUpdatedAt,
    basis,
    accountType,
    targetYield,
    operator,
    lastConditionMet,
    staleThresholdHours = 48
  } = params;

  // Check stale price
  if (priceUpdatedAt == null) {
    return { action: "skip_stale", lastConditionMet };
  }

  const updatedTime =
    typeof priceUpdatedAt === "string"
      ? new Date(priceUpdatedAt).getTime()
      : priceUpdatedAt.getTime();

  if (Number.isNaN(updatedTime)) {
    return { action: "skip_stale", lastConditionMet };
  }

  const now = Date.now();
  const thresholdMs = staleThresholdHours * 60 * 60 * 1000;
  if (now - updatedTime > thresholdMs) {
    return { action: "skip_stale", lastConditionMet };
  }

  // Check missing yield data
  const evaluatedYield = calculateCurrentYield({
    expectedAnnualDividendPerShare,
    currentPrice,
    basis,
    accountType
  });

  if (evaluatedYield == null) {
    return { action: "skip_missing_yield", lastConditionMet };
  }

  const conditionMet = ruleMatches({
    evaluatedYield,
    targetYield,
    operator
  });

  if (lastConditionMet && conditionMet) {
    return { action: "no_change", lastConditionMet: true };
  }

  if (lastConditionMet && !conditionMet) {
    return { action: "transition_to_unmet", lastConditionMet: false };
  }

  if (!lastConditionMet && !conditionMet) {
    return { action: "no_change", lastConditionMet: false };
  }

  // !lastConditionMet && conditionMet
  return { action: "transition_to_met", lastConditionMet: true };
}

export interface DividendChangeCheckInput {
  userHasActiveHolding: boolean;
  existingNotificationForEvent: boolean;
}

export function shouldSendDividendChangeNotification(
  check: DividendChangeCheckInput
): { shouldSend: boolean; reason: "ok" | "no_holding" | "already_notified" } {
  if (!check.userHasActiveHolding) {
    return { shouldSend: false, reason: "no_holding" };
  }
  if (check.existingNotificationForEvent) {
    return { shouldSend: false, reason: "already_notified" };
  }
  return { shouldSend: true, reason: "ok" };
}
