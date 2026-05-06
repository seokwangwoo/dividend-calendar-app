import { INVESTMENT_NEUTRAL_DISCLAIMER } from "@/features/notifications/constants";

export interface YieldTargetEmailData {
  stockName: string;
  ticker: string;
  evaluatedYield: number;
  targetYield: number;
  operator: "gte" | "lte";
  basis: "before_tax_yield" | "after_tax_yield";
}

export interface DividendChangeEmailData {
  stockName: string;
  ticker: string;
  changeType: "increase" | "decrease" | "no_dividend" | "special_dividend";
  previousDps: number | null;
  currentDps: number | null;
  sourceUrl?: string | null;
}

export interface DataUpdateEmailData {
  stockName: string;
  ticker: string;
  updateSummary: string;
}

const BANNED_STRINGS = [
  "買い推奨",
  "売り推奨",
  "買いシグナル",
  "売りシグナル",
  "今すぐ買う",
  "今すぐ売る",
  "確実に儲かる",
  "安全に稼げる"
];

function assertNoBannedStrings(text: string): void {
  for (const banned of BANNED_STRINGS) {
    if (text.includes(banned)) {
      throw new Error(`Banned string detected in email: ${banned}`);
    }
  }
}

export function renderYieldTargetEmail(data: YieldTargetEmailData): {
  subject: string;
  text: string;
} {
  const conditionText =
    data.operator === "gte" ? "以上" : "以下";
  const basisText =
    data.basis === "before_tax_yield" ? "税引前配当利回り" : "税引後配当利回り";

  const text = [
    `${data.stockName}（${data.ticker}）が目標${basisText}に到達しました。`,
    ``,
    `現在の予想配当利回り: ${data.evaluatedYield.toFixed(1)}%`,
    `設定条件: ${data.targetYield.toFixed(1)}%${conditionText}`,
    ``,
    INVESTMENT_NEUTRAL_DISCLAIMER
  ].join("\n");

  assertNoBannedStrings(text);

  return {
    subject: `【配当カレンダー】${data.stockName} 目標利回りに到達`,
    text
  };
}

export function renderDividendChangeEmail(data: DividendChangeEmailData): {
  subject: string;
  text: string;
} {
  const changeLabels: Record<string, string> = {
    increase: "増配",
    decrease: "減配",
    no_dividend: "配当なし",
    special_dividend: "特別配当"
  };

  const changeLabel = changeLabels[data.changeType] ?? data.changeType;

  const lines = [
    `${data.stockName}（${data.ticker}）の配当が${changeLabel}となりました。`,
    ``
  ];

  if (data.previousDps != null && data.currentDps != null) {
    lines.push(
      `前回: ${data.previousDps}円 -> 今回: ${data.currentDps}円`
    );
  } else if (data.currentDps != null) {
    lines.push(`今回: ${data.currentDps}円`);
  }

  if (data.sourceUrl) {
    lines.push(``, `情報源: ${data.sourceUrl}`);
  }

  lines.push("", INVESTMENT_NEUTRAL_DISCLAIMER);

  const text = lines.join("\n");
  assertNoBannedStrings(text);

  return {
    subject: `【配当カレンダー】${data.stockName} ${changeLabel}のお知らせ`,
    text
  };
}

export function renderDataUpdateEmail(data: DataUpdateEmailData): {
  subject: string;
  text: string;
} {
  const text = [
    `${data.stockName}（${data.ticker}）のデータが更新されました。`,
    ``,
    data.updateSummary,
    ``,
    INVESTMENT_NEUTRAL_DISCLAIMER
  ].join("\n");

  assertNoBannedStrings(text);

  return {
    subject: `【配当カレンダー】${data.stockName} データ更新`,
    text
  };
}
