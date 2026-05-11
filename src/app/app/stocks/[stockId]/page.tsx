import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCurrencyJpy, formatPercent } from "@/lib/formatting/number";
import {
  formatAccountType,
  formatDividendStatus,
  formatReviewStatus
} from "@/lib/formatting/dividends";
import { getStockDetail } from "@/features/dividends/queries";
import type { DividendStatus, ReviewStatus } from "@/lib/constants/dividends";

interface PageProps {
  params: Promise<{ stockId: string }>;
}

export default async function StockDetailPage({ params }: PageProps) {
  const { stockId } = await params;
  const detail = await getStockDetail(stockId);

  if (detail === null) {
    notFound();
  }

  const { stock, userHoldings, dividendSchedule, source } = detail;

  return (
    <div className="space-y-5">
      <PageHeader
        title={stock.name}
        subtitle={`${stock.ticker} · ${stock.currency}`}
      />

      {/* Stock info */}
      <Card className="divide-y divide-line">
        <div className="flex items-center justify-between p-4">
          <p className="text-sm text-muted">現在株価</p>
          <p className="font-semibold">{formatCurrencyJpy(stock.currentPrice)}</p>
        </div>
        <div className="flex items-center justify-between p-4">
          <p className="text-sm text-muted">予想年間配当/株</p>
          <p className="font-semibold">
            {formatCurrencyJpy(stock.expectedAnnualDividendPerShare)}
          </p>
        </div>
        <div className="flex items-center justify-between p-4">
          <p className="text-sm text-muted">予想配当利回り</p>
          <p className="font-semibold">
            {formatPercent(stock.expectedDividendYield)}
          </p>
        </div>
      </Card>

      {/* User holdings */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">保有情報</h2>
        {userHoldings.length === 0 ? (
          <EmptyState
            title="この銘柄は未保有です"
            description="ポートフォリオに追加して配当を管理しましょう。"
            actionHref="/app/portfolio/new"
            actionLabel="ポートフォリオに追加"
          />
        ) : (
          <Card className="divide-y divide-line">
            {userHoldings.map((holding, idx) => (
              <div key={idx} className="space-y-2 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">
                    {formatAccountType(holding.accountType as DividendStatus extends never ? never : Parameters<typeof formatAccountType>[0])}
                  </span>
                  <span className="text-sm text-muted">{holding.quantity}株</span>
                </div>
                <div className="flex gap-4 text-sm">
                  <span>
                    税引後年間{" "}
                    <span className="font-semibold">
                      {formatCurrencyJpy(holding.annualAfterTaxAmount)}
                    </span>
                  </span>
                  <span className="text-muted">
                    税引前 {formatCurrencyJpy(holding.annualBeforeTaxAmount)}
                  </span>
                </div>
              </div>
            ))}
          </Card>
        )}
      </section>

      {/* Dividend schedule */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">配当スケジュール</h2>
        {dividendSchedule.length === 0 ? (
          <p className="text-sm text-muted">
            {stock.expectedAnnualDividendPerShare == null
              ? "配当データ確認中"
              : "配当スケジュールは登録されていません。"}
          </p>
        ) : (
          <Card className="divide-y divide-line">
            {dividendSchedule.map((evt, idx) => (
              <div key={idx} className="flex items-center justify-between p-4">
                <div>
                  <p className="text-sm font-medium">
                    {evt.expectedPaymentDate
                      ? evt.expectedPaymentDate.replace(
                          /^(\d{4})-(\d{2})-(\d{2})$/,
                          "$1年$2月$3日"
                        )
                      : evt.expectedPaymentMonth !== null
                        ? `${evt.expectedPaymentMonth}月予定`
                        : "未定"}
                  </p>
                  <p className="text-xs text-muted">{evt.eventType}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">
                    {evt.dividendPerShare !== null
                      ? formatCurrencyJpy(evt.dividendPerShare)
                      : "未定"}
                    <span className="ml-0.5 text-xs font-normal text-muted">
                      /株
                    </span>
                  </span>
                  <Badge
                    variant={
                      evt.status === "confirmed" || evt.status === "paid"
                        ? "success"
                        : evt.status === "undecided"
                          ? "warning"
                          : "neutral"
                    }
                  >
                    {formatDividendStatus(evt.status as DividendStatus)}
                  </Badge>
                </div>
              </div>
            ))}
          </Card>
        )}
      </section>

      {/* Data source */}
      {source !== null && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">データソース</h2>
          <Card className="divide-y divide-line">
            <div className="flex items-center justify-between p-4">
              <p className="text-sm text-muted">検収状態</p>
              <Badge
                variant={
                  source.reviewStatus === "approved" ? "success" : "neutral"
                }
              >
                {formatReviewStatus(source.reviewStatus as ReviewStatus)}
              </Badge>
            </div>
            {source.sourceType !== null && (
              <div className="flex items-center justify-between p-4">
                <p className="text-sm text-muted">ソース種別</p>
                <p className="text-sm">{source.sourceType}</p>
              </div>
            )}
            {source.sourceUrl !== null && (
              <div className="p-4">
                <p className="mb-1 text-sm text-muted">ソースURL</p>
                <a
                  href={source.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="break-all text-sm text-brand hover:underline"
                >
                  {source.sourceUrl}
                </a>
              </div>
            )}
            {source.sourcePublishedAt !== null && (
              <div className="flex items-center justify-between p-4">
                <p className="text-sm text-muted">公表日時</p>
                <p className="text-sm">
                  {new Date(source.sourcePublishedAt).toLocaleDateString(
                    "ja-JP"
                  )}
                </p>
              </div>
            )}
          </Card>
        </section>
      )}

      {/* Notification rule link */}
      <div className="space-y-2 pt-2 text-center">
        {stock.expectedAnnualDividendPerShare == null && (
          <p className="text-sm text-muted">
            配当データが確定後、通知を設定できます。
          </p>
        )}
        <Link
          href={`/app/stocks/${stockId}/notification-rule`}
          aria-disabled={stock.expectedAnnualDividendPerShare == null}
          className={`inline-flex h-10 items-center justify-center rounded-md border border-line px-6 text-sm font-semibold ${
            stock.expectedAnnualDividendPerShare == null
              ? "pointer-events-none bg-paper text-muted"
              : "text-ink hover:bg-paper"
          }`}
        >
          目標利回りを設定
        </Link>
      </div>
    </div>
  );
}
