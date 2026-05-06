export function validateMonth(value: unknown): string | null {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 12) {
    return "月は1〜12の整数で入力してください";
  }
  return null;
}

export function validateDividendAmount(value: unknown): string | null {
  const n = Number(value);
  if (isNaN(n) || n < 0) {
    return "配当金額は0以上の数値で入力してください";
  }
  return null;
}

export function validatePaymentYear(value: unknown): string | null {
  if (value === null || value === undefined || value === "") {
    return "支払年は必須です";
  }
  const n = Number(value);
  if (!Number.isInteger(n) || n < 2000 || n > 2100) {
    return "支払年は2000〜2100の整数で入力してください";
  }
  return null;
}
