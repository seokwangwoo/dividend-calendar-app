export function formatCurrencyJpy(amount: number | null | undefined) {
  if (amount == null || Number.isNaN(amount)) {
    return "-";
  }

  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0
  }).format(amount);
}

export function formatPercent(
  value: number | null | undefined,
  digits = 2
) {
  if (value == null || Number.isNaN(value)) {
    return "-";
  }

  return `${value.toFixed(digits)}%`;
}
