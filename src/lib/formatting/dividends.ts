import type {
  AccountType,
  DividendStatus,
  ReviewStatus
} from "@/lib/constants/dividends";

export function formatAccountType(accountType: AccountType) {
  const labels: Record<AccountType, string> = {
    nisa: "NISA",
    tokutei: "特定口座",
    general: "一般口座"
  };

  return labels[accountType];
}

export function formatDividendStatus(status: DividendStatus) {
  const labels: Record<DividendStatus, string> = {
    estimated: "予想",
    confirmed: "確定",
    paid: "支払済",
    undecided: "未定"
  };

  return labels[status];
}

export function formatReviewStatus(status: ReviewStatus) {
  const labels: Record<ReviewStatus, string> = {
    pending: "検収待ち",
    approved: "検収済",
    rejected: "却下",
    needs_manual_check: "要確認"
  };

  return labels[status];
}

export function formatNotificationType(type: string): string {
  const labels: Record<string, string> = {
    dividend_increase: "増配",
    dividend_decrease: "減配",
    no_dividend: "無配",
    special_dividend: "特別配当",
    data_update: "データ更新"
  };

  return labels[type] ?? type;
}

export function formatChangeType(changeType: string): string {
  const labels: Record<string, string> = {
    increase: "増配",
    decrease: "減配",
    no_dividend: "無配",
    resumed: "復配",
    special: "特別配当",
    commemorative: "記念配当",
    unchanged: "変化なし",
    unknown: "不明"
  };

  return labels[changeType] ?? changeType;
}
