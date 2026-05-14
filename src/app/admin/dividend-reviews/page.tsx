import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { listDividendReviews } from "@/features/admin/review-queries";
import type { DividendReviewFilters } from "@/features/admin/review-queries";

function reviewStatusBadge(status: string) {
  if (status === "approved") return <Badge variant="success">承認済</Badge>;
  if (status === "rejected") return <Badge variant="danger">却下</Badge>;
  if (status === "needs_manual_check") return <Badge variant="warning">要確認</Badge>;
  return <Badge variant="warning">保留中</Badge>;
}

function priorityBadge(priority: string | undefined) {
  if (priority === "urgent") return <Badge variant="danger">緊急</Badge>;
  if (priority === "high") return <Badge variant="warning">高</Badge>;
  if (priority === "low") return <Badge variant="neutral">低</Badge>;
  return <Badge variant="neutral">通常</Badge>;
}

function eventTypeLabel(eventType: string | null | undefined) {
  const map: Record<string, string> = {
    interim: "中間",
    year_end: "期末",
    annual_total: "年間合計 ※参考",
    special: "特別",
    commemorative: "記念",
    other: "その他"
  };
  return map[eventType ?? ""] ?? (eventType ?? "—");
}

function changeTypeLabel(changeType: string | null | undefined) {
  const map: Record<string, string> = {
    increase: "増額",
    decrease: "減額",
    no_dividend: "無配",
    resumed: "復配",
    special: "特別",
    commemorative: "記念",
    none: "変化なし",
    unchanged: "変化なし",
    unknown: "不明"
  };
  return map[changeType ?? ""] ?? (changeType ?? "—");
}

function confidenceBadge(score: number | null) {
  if (score == null) return <span className="text-muted">—</span>;
  const pct = Math.round(score * 100);
  const variant = score >= 0.8 ? "success" : score >= 0.5 ? "warning" : "danger";
  return <Badge variant={variant}>{pct}%</Badge>;
}

export default async function DividendReviewsPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const filters: DividendReviewFilters = {
    status: params.status ?? "pending,needs_manual_check",
    priority: params.priority,
    disclosureType: params.disclosureType,
    ticker: params.ticker,
    changeType: params.changeType
  };

  const reviews = await listDividendReviews(filters);

  const hasCustomFilter =
    params.status !== undefined ||
    params.priority !== undefined ||
    params.disclosureType !== undefined ||
    params.ticker !== undefined ||
    params.changeType !== undefined;

  return (
    <div className="space-y-5">
      <PageHeader
        title="AI配当候補レビュー"
        subtitle="AI抽出の配当候補を確認・承認・却下します。承認済みデータのみユーザー画面に表示されます。"
        actionHref="/admin/dividend-reviews/new"
        actionLabel="手動作成"
      />

      {/* Investment-data caution */}
      <div className="rounded-lg border border-warn/30 bg-warn/5 px-4 py-3 text-sm text-warn">
        このページに表示される値はAIによる抽出候補です。承認前に原文PDFおよび出典を必ずご確認ください。
        「年間合計」種別はユーザー向け集計に含まれません（参考表示のみ）。
      </div>

      {/* Filters */}
      <form method="GET" className="flex flex-wrap gap-3 text-sm">
        <select
          name="status"
          defaultValue={params.status ?? "pending,needs_manual_check"}
          className="h-9 rounded-md border border-line bg-white px-3 text-sm"
        >
          <option value="pending,needs_manual_check">保留中・要確認（デフォルト）</option>
          <option value="pending">保留中のみ</option>
          <option value="needs_manual_check">要確認のみ</option>
          <option value="approved">承認済</option>
          <option value="rejected">却下済</option>
        </select>

        <select
          name="priority"
          defaultValue={params.priority ?? ""}
          className="h-9 rounded-md border border-line bg-white px-3 text-sm"
        >
          <option value="">すべての優先度</option>
          <option value="urgent">緊急</option>
          <option value="high">高</option>
          <option value="normal">通常</option>
          <option value="low">低</option>
        </select>

        <select
          name="disclosureType"
          defaultValue={params.disclosureType ?? ""}
          className="h-9 rounded-md border border-line bg-white px-3 text-sm"
        >
          <option value="">すべての開示種別</option>
          <option value="dividend_forecast_revision">配当予想修正</option>
          <option value="dividend_decision">配当決定</option>
          <option value="earnings_release">決算短信</option>
          <option value="earnings_revision">業績修正</option>
          <option value="correction">訂正</option>
          <option value="other">その他</option>
        </select>

        <input
          name="ticker"
          defaultValue={params.ticker ?? ""}
          placeholder="ティッカー"
          className="h-9 rounded-md border border-line bg-white px-3 text-sm"
        />

        <select
          name="changeType"
          defaultValue={params.changeType ?? ""}
          className="h-9 rounded-md border border-line bg-white px-3 text-sm"
        >
          <option value="">すべての変化種別</option>
          <option value="increase">増額</option>
          <option value="decrease">減額</option>
          <option value="no_dividend">無配</option>
          <option value="resumed">復配</option>
          <option value="special">特別</option>
          <option value="commemorative">記念</option>
          <option value="unchanged">変化なし</option>
          <option value="unknown">不明</option>
        </select>

        <button
          type="submit"
          className="h-9 rounded-md bg-brand px-4 text-sm font-semibold text-white"
        >
          絞り込む
        </button>

        {hasCustomFilter && (
          <Link
            href="/admin/dividend-reviews"
            className="flex h-9 items-center rounded-md border border-line px-4 text-sm text-muted"
          >
            クリア
          </Link>
        )}
      </form>

      {/* Table */}
      {reviews.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">
          対象の配当候補がありません
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full text-sm">
            <thead className="border-b border-line bg-paper">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-muted">優先度</th>
                <th className="px-3 py-2 text-left font-medium text-muted">銘柄</th>
                <th className="px-3 py-2 text-left font-medium text-muted">開示タイトル</th>
                <th className="px-3 py-2 text-left font-medium text-muted">種別</th>
                <th className="px-3 py-2 text-right font-medium text-muted">配当金</th>
                <th className="px-3 py-2 text-right font-medium text-muted">前回</th>
                <th className="px-3 py-2 text-left font-medium text-muted">変化</th>
                <th className="px-3 py-2 text-left font-medium text-muted">信頼度</th>
                <th className="px-3 py-2 text-left font-medium text-muted">状態</th>
                <th className="px-3 py-2 text-left font-medium text-muted">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {reviews.map((review) => {
                const isAnnualTotal = review.event_type === "annual_total";

                return (
                  <tr
                    key={review.id}
                    className={`hover:bg-paper/50 ${isAnnualTotal ? "bg-paper/30" : ""}`}
                  >
                    <td className="px-3 py-2">
                      {priorityBadge(review.disclosures?.review_priority)}
                    </td>
                    <td className="px-3 py-2">
                      <span className="font-medium">
                        {review.stocks?.ticker ?? "—"}
                      </span>
                      <div className="text-xs text-muted">{review.stocks?.name ?? "—"}</div>
                    </td>
                    <td className="px-3 py-2 max-w-xs">
                      <div className="truncate text-xs text-muted" title={review.disclosures?.title ?? ""}>
                        {review.disclosures?.title ?? "—"}
                      </div>
                      {review.disclosures?.published_at && (
                        <div className="text-xs text-muted">
                          {new Date(review.disclosures.published_at).toLocaleDateString("ja-JP")}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span className={isAnnualTotal ? "text-muted text-xs italic" : ""}>
                        {eventTypeLabel(review.event_type)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      {review.extracted_dividend_per_share != null
                        ? `¥${review.extracted_dividend_per_share}`
                        : "—"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {review.previous_dividend_per_share != null
                        ? `¥${review.previous_dividend_per_share}`
                        : "—"}
                    </td>
                    <td className="px-3 py-2">
                      {changeTypeLabel(review.change_type)}
                    </td>
                    <td className="px-3 py-2">
                      {confidenceBadge(review.confidence_score)}
                    </td>
                    <td className="px-3 py-2">
                      {reviewStatusBadge(review.status)}
                    </td>
                    <td className="px-3 py-2">
                      <Link
                        href={`/admin/dividend-reviews/${review.id}`}
                        className="inline-flex h-7 items-center rounded border border-line px-2 text-xs text-brand hover:underline"
                      >
                        詳細・操作
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-muted">
        {reviews.length}件表示 ·
        年間合計（annual_total）はユーザー向け集計に含まれない参照専用データです
      </p>
    </div>
  );
}
