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
    rejected: "却下"
  };

  return labels[status];
}
