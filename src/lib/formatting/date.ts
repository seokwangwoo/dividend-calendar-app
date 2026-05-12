export function formatYearMonth(year: number, month: number) {
  return `${year}年${month}月`;
}

export function formatPaymentYearMonth(
  year: number | null,
  month: number | null
) {
  if (year !== null && month !== null) {
    return formatYearMonth(year, month);
  }

  if (month !== null) {
    return `${month}月予定`;
  }

  return "未定";
}
