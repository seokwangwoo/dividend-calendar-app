export const NOTIFICATION_RULE_BASES = [
  "before_tax_yield",
  "after_tax_yield"
] as const;
export type NotificationRuleBasis = (typeof NOTIFICATION_RULE_BASES)[number];

export const NOTIFICATION_OPERATORS = ["gte", "lte"] as const;
export type NotificationOperator = (typeof NOTIFICATION_OPERATORS)[number];

export const NOTIFICATION_RULE_BASIS_OPTIONS = [
  { value: "before_tax_yield", label: "税引前配当利回り" },
  { value: "after_tax_yield", label: "税引後配当利回り" }
] as const;

export const NOTIFICATION_OPERATOR_OPTIONS = [
  { value: "gte", label: "以上" },
  { value: "lte", label: "以下" }
] as const;

export const INVESTMENT_NEUTRAL_DISCLAIMER =
  "これは売買を推奨するものではありません。\n投資判断はご自身で行ってください。";

export const NOTIFICATION_FILTERS = [
  { value: "all", label: "すべて" },
  { value: "yield_target", label: "目標利回り" },
  { value: "dividend_change", label: "配当変更" },
  { value: "data_update", label: "データ更新" }
] as const;

export type NotificationFilter = (typeof NOTIFICATION_FILTERS)[number]["value"];
