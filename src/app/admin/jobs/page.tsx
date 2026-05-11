import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import {
  getAdminJobQueueDepth,
  getAdminPriceRefreshSummary,
  type AdminJobQueueDepthRow,
  type AdminPriceRefreshSummaryRow,
} from "@/features/admin/diagnostics-queries";

function QueueDepthTable({ rows }: { rows: AdminJobQueueDepthRow[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted">ジョブデータがありません。</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs text-muted">
            <th className="pb-2 pr-4">タイプ</th>
            <th className="pb-2 pr-4">ステータス</th>
            <th className="pb-2 pr-4 text-right">件数</th>
            <th className="pb-2 pr-4">最古待機</th>
            <th className="pb-2">最新待機</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((row, idx) => (
            <tr key={`${row.job_type}-${row.status}-${idx}`} className="tabular-nums">
              <td className="py-2 pr-4">{row.job_type}</td>
              <td className="py-2 pr-4">
                <span
                  className={`inline-block rounded px-1.5 py-0.5 text-xs ${
                    row.status === "pending"
                      ? "bg-warn/10 text-warn"
                      : row.status === "running"
                        ? "bg-brand/10 text-brand"
                        : "bg-paper text-muted"
                  }`}
                >
                  {row.status}
                </span>
              </td>
              <td className="py-2 pr-4 text-right">{row.count}</td>
              <td className="py-2 pr-4 text-xs text-muted">
                {row.oldest_pending ? new Date(row.oldest_pending).toLocaleString("ja-JP") : "—"}
              </td>
              <td className="py-2 text-xs text-muted">
                {row.newest_pending ? new Date(row.newest_pending).toLocaleString("ja-JP") : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PriceRefreshSummaryTable({ rows }: { rows: AdminPriceRefreshSummaryRow[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted">直近7日間の価格更新データがありません。</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs text-muted">
            <th className="pb-2 pr-4">日付</th>
            <th className="pb-2 pr-4 text-right">試行</th>
            <th className="pb-2 pr-4 text-right">成功</th>
            <th className="pb-2 pr-4 text-right">失敗</th>
            <th className="pb-2 pr-4 text-right">失敗率(%)</th>
            <th className="pb-2 pr-4 text-right">銘柄数</th>
            <th className="pb-2 text-right">平均株価</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((row) => (
            <tr key={row.day} className="tabular-nums">
              <td className="py-2 pr-4">{row.day}</td>
              <td className="py-2 pr-4 text-right">{row.total_attempts}</td>
              <td className="py-2 pr-4 text-right">{row.success_count}</td>
              <td className="py-2 pr-4 text-right text-danger">{row.failure_count}</td>
              <td className="py-2 pr-4 text-right">
                <span className={row.failure_rate > 5 ? "text-warn" : ""}>{row.failure_rate}%</span>
              </td>
              <td className="py-2 pr-4 text-right">{row.unique_stocks}</td>
              <td className="py-2 text-right">
                {row.avg_new_price != null ? `¥${Number(row.avg_new_price).toLocaleString()}` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function JobsPage() {
  let queueDepth: AdminJobQueueDepthRow[] = [];
  let priceRefreshSummary: AdminPriceRefreshSummaryRow[] = [];
  try {
    queueDepth = await getAdminJobQueueDepth();
    priceRefreshSummary = await getAdminPriceRefreshSummary();
  } catch {
    // Non-critical: diagnostics unavailable (e.g. during build or unauthenticated)
  }

  return (
    <div className="space-y-5">
      <PageHeader title="ジョブ" />

      {/* Queue depth */}
      <Card className="space-y-4 p-5">
        <h2 className="font-semibold">キュー深度</h2>
        <QueueDepthTable rows={queueDepth} />
      </Card>

      {/* Price refresh summary */}
      <Card className="space-y-4 p-5">
        <h2 className="font-semibold">価格更新サマリー（直近7日間）</h2>
        <PriceRefreshSummaryTable rows={priceRefreshSummary} />
      </Card>

      {/* Operational note */}
      <Card className="space-y-3 p-5">
        <h2 className="font-semibold">運用メモ</h2>
        <p className="text-sm leading-6 text-muted">
          `process-jobs` Edge Function は `pending` 状態のジョブを優先度順に処理します。
          失敗時は `attempts` をインクリメントし、最大試行回数に達すると `failed` ステータスに遷移します。
          連続失敗銘柄は `get_stocks_with_consecutive_price_refresh_failures` で確認できます。
        </p>
      </Card>
    </div>
  );
}
