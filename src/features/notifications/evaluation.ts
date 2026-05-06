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
