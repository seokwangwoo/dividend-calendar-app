import type { AccountType } from "@/lib/constants/dividends";

export const TAX_RATES: Record<AccountType, number> = {
  nisa: 0,
  tokutei: 0.20315,
  general: 0.20315
} as const;

export interface HoldingDividendResult {
  beforeTaxAmount: number | null;
  estimatedTaxAmount: number | null;
  afterTaxAmount: number | null;
  beforeTaxYield: number | null;
  afterTaxYield: number | null;
  currency: string;
}

export function calculateHoldingDividend(params: {
  expectedAnnualDividendPerShare: number | null;
  currentPrice: number | null;
  quantity: number;
  accountType: AccountType;
  currency?: string;
}): HoldingDividendResult {
  const {
    expectedAnnualDividendPerShare,
    currentPrice,
    quantity,
    accountType,
    currency = "JPY"
  } = params;

  const taxRate = TAX_RATES[accountType];

  if (expectedAnnualDividendPerShare == null) {
    return {
      beforeTaxAmount: null,
      estimatedTaxAmount: null,
      afterTaxAmount: null,
      beforeTaxYield: null,
      afterTaxYield: null,
      currency
    };
  }

  const beforeTaxAmount = expectedAnnualDividendPerShare * quantity;
  const estimatedTaxAmount = beforeTaxAmount * taxRate;
  const afterTaxAmount = beforeTaxAmount - estimatedTaxAmount;

  const hasValidPrice = currentPrice != null && currentPrice > 0;

  const beforeTaxYield = hasValidPrice
    ? (expectedAnnualDividendPerShare / currentPrice!) * 100
    : null;

  const afterTaxYield = hasValidPrice
    ? (expectedAnnualDividendPerShare * (1 - taxRate) / currentPrice!) * 100
    : null;

  return {
    beforeTaxAmount,
    estimatedTaxAmount,
    afterTaxAmount,
    beforeTaxYield,
    afterTaxYield,
    currency
  };
}

export function calculatePortfolioAfterTaxYield(params: {
  annualAfterTaxDividend: number | null;
  totalAcquisitionCost: number;
}): number | null {
  const { annualAfterTaxDividend, totalAcquisitionCost } = params;

  if (annualAfterTaxDividend == null || totalAcquisitionCost <= 0) {
    return null;
  }

  return (annualAfterTaxDividend / totalAcquisitionCost) * 100;
}
