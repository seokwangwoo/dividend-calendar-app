export type PortfolioSortOption =
  | "annual_after_tax_desc"
  | "ticker_asc"
  | "recently_added";

export interface SortableHolding {
  id: string;
  ticker?: string;
  quantity: number;
  average_purchase_price: number;
  account_type: "nisa" | "tokutei" | "general";
  created_at: string;
  annualAfterTaxAmount?: number | null;
}

export function sortHoldings<T extends SortableHolding>(
  holdings: T[],
  sort: PortfolioSortOption,
  getTicker?: (h: T) => string
): T[] {
  const sorted = [...holdings];

  switch (sort) {
    case "annual_after_tax_desc":
      sorted.sort((a, b) => {
        const aVal = a.annualAfterTaxAmount ?? 0;
        const bVal = b.annualAfterTaxAmount ?? 0;
        return bVal - aVal;
      });
      break;
    case "ticker_asc":
      sorted.sort((a, b) => {
        const aTicker = getTicker ? getTicker(a) : (a.ticker ?? "");
        const bTicker = getTicker ? getTicker(b) : (b.ticker ?? "");
        return aTicker.localeCompare(bTicker, "ja");
      });
      break;
    case "recently_added":
      sorted.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      break;
  }

  return sorted;
}
