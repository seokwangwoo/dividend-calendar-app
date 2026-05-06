import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCurrencyJpy, formatPercent } from "@/lib/formatting/number";
import { formatDividendStatus } from "@/lib/formatting/dividends";
import { formatChangeType } from "@/lib/formatting/dividends";
import { getHomeSummary } from "@/features/dividends/queries";
import {
  getHomeDisplayMode,
  getGoalDisplayState
} from "@/features/home/display-state";

export default async function HomePage() {
  const year = new Date().getFullYear();
  const summary = await getHomeSummary(year);

  const holdingCount = summary?.holdingCount ?? 0;
  const displayMode = getHomeDisplayMode(holdingCount);
  const goalState = getGoalDisplayState(
    holdingCount,
    summary?.annualGoal?.targetAmount ?? null
  );

  return (
    <div className="space-y-5">
      <header>
        <p className="text-sm text-muted">こんにちは</p>
        <h1 className="text-2xl font-semibold">{year}年の配当</h1>
      </header>

      {displayMode === "onboarding" ? (
        <EmptyState
          title="保有銘柄が未登録です"
          description="ポートフォリオから最初の銘柄を追加してください。"
          actionHref="/app/portfolio/new"
          actionLabel="銘柄を追加"
        />
      ) : summary == null ? null : (
        <>
          {/* Annual dividend summary */}
          <Card className="space-y-2 p-5">
            <p className="text-sm text-muted">今年の予想税引後配当</p>
            <p className="text-4xl font-semibold">
              {formatCurrencyJpy(summary.annualDividend.afterTaxAmount)}
            </p>
            <div className="flex gap-4 text-sm text-muted">
              <span>
                税引前{" "}
                {formatCurrencyJpy(summary.annualDividend.beforeTaxAmount)}
              </span>
              <span>
                税額{" "}
                {formatCurrencyJpy(summary.annualDividend.estimatedTaxAmount)}
              </span>
            </div>
          </Card>

          {/* Current month expected income */}
          <Card className="space-y-2 p-5">
            <p className="text-sm text-muted">
              {summary.currentMonthDividend.month}月の予想入金額
            </p>
            <p className="text-2xl font-semibold">
              {formatCurrencyJpy(summary.currentMonthDividend.afterTaxAmount)}
            </p>
          </Card>

          {/* Next dividend */}
          {summary.nextDividend !== null && (
            <Card className="space-y-2 p-5">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted">次の配当</p>
                <Badge variant="neutral">
                  {formatDividendStatus(
                    summary.nextDividend.status as Parameters<
                      typeof formatDividendStatus
                    >[0]
                  )}
                </Badge>
              </div>
              <p className="font-semibold">
                {summary.nextDividend.stockName}{" "}
                <span className="text-sm font-normal text-muted">
                  {summary.nextDividend.ticker}
                </span>
              </p>
              <p className="text-sm text-muted">
                {summary.nextDividend.displayDateText}
              </p>
              <div className="flex gap-4 text-sm">
                <span>
                  税引後{" "}
                  <span className="font-semibold">
                    {formatCurrencyJpy(summary.nextDividend.afterTaxAmount)}
                  </span>
                </span>
                <span className="text-muted">
                  税引前{" "}
                  {formatCurrencyJpy(summary.nextDividend.beforeTaxAmount)}
                </span>
              </div>
            </Card>
          )}

          {/* Annual goal */}
          {goalState === "progress" && summary.annualGoal !== null ? (
            <Card className="space-y-3 p-5">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted">年間税引後配当目標</p>
                <span className="text-sm font-semibold">
                  {formatPercent(summary.annualGoal.achievementRate, 1)}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-paper">
                <div
                  className="h-full rounded-full bg-brand transition-all"
                  style={{
                    width: `${Math.min(summary.annualGoal.achievementRate ?? 0, 100)}%`
                  }}
                />
              </div>
              <div className="flex justify-between text-sm text-muted">
                <span>
                  今年{" "}
                  {formatCurrencyJpy(summary.annualGoal.currentAmount)}
                </span>
                <span>
                  目標{" "}
                  {formatCurrencyJpy(summary.annualGoal.targetAmount)}
                </span>
              </div>
            </Card>
          ) : goalState === "prompt" ? (
            <EmptyState
              title="年間税引後配当目標が未設定です"
              description="設定から年間の税引後配当目標を登録すると、今年の進捗を確認できます。"
              actionHref="/app/settings"
              actionLabel="目標を設定"
            />
          ) : null}

          {/* Recent dividend change */}
          {summary.recentDividendChange !== null && (
            <Card className="space-y-2 p-5">
              <p className="text-sm text-muted">最近の配当変更</p>
              <div className="flex items-center gap-2">
                <Badge variant="warning">
                  {formatChangeType(
                    summary.recentDividendChange.changeType
                  )}
                </Badge>
                <span className="font-semibold">
                  {summary.recentDividendChange.stockName}
                </span>
                <span className="text-sm text-muted">
                  {summary.recentDividendChange.ticker}
                </span>
              </div>
              {summary.recentDividendChange.dividendPerShare !== null && (
                <div className="flex gap-4 text-sm text-muted">
                  {summary.recentDividendChange.previousDividendPerShare !==
                    null && (
                    <span>
                      前回{" "}
                      {formatCurrencyJpy(
                        summary.recentDividendChange.previousDividendPerShare
                      )}
                    </span>
                  )}
                  <span>
                    今回{" "}
                    <span className="font-semibold text-ink">
                      {formatCurrencyJpy(
                        summary.recentDividendChange.dividendPerShare
                      )}
                    </span>
                  </span>
                </div>
              )}
            </Card>
          )}

          {/* Quick link to portfolio */}
          <div className="text-center">
            <Link
              href="/app/portfolio"
              className="text-sm text-brand underline-offset-4 hover:underline"
            >
              ポートフォリオを確認する
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
