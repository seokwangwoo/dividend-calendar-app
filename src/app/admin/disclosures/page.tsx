import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import {
  getAdminDisclosureSummary,
  getAdminReviewBacklog,
  getParserDiagnosticSummary,
  LOW_CONFIDENCE_THRESHOLD,
  type AdminDisclosureSummaryRow,
} from "@/features/admin/diagnostics-queries";

type StatCardProps = {
  label: string;
  count: number;
  description: string;
  alertColor?: "text-danger" | "text-warn";
};

function StatCard({ label, count, description, alertColor }: StatCardProps) {
  return (
    <div className="rounded-lg border border-line p-4">
      <dt className="text-xs text-muted">{label}</dt>
      <dd
        className={`mt-1 text-2xl font-bold tabular-nums ${count > 0 && alertColor ? alertColor : "text-muted"}`}
      >
        {count}
      </dd>
      <p className="mt-1 text-xs text-muted">{description}</p>
    </div>
  );
}

function DisclosureSummaryTable({ rows }: { rows: AdminDisclosureSummaryRow[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted">直近7日間のデータがありません。</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs text-muted">
            <th className="pb-2 pr-4">日付</th>
            <th className="pb-2 pr-4 text-right">収集</th>
            <th className="pb-2 pr-4 text-right">解析済</th>
            <th className="pb-2 pr-4 text-right">失敗</th>
            <th className="pb-2 pr-4 text-right">スキップ</th>
            <th className="pb-2 pr-4 text-right">AIコスト($)</th>
            <th className="pb-2 pr-4 text-right">保留</th>
            <th className="pb-2 pr-4 text-right">承認</th>
            <th className="pb-2 text-right">拒否</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((row) => (
            <tr key={row.day} className="tabular-nums">
              <td className="py-2 pr-4">{row.day}</td>
              <td className="py-2 pr-4 text-right">{row.collected_count}</td>
              <td className="py-2 pr-4 text-right">{row.parsed_count}</td>
              <td className="py-2 pr-4 text-right text-danger">{row.failed_count}</td>
              <td className="py-2 pr-4 text-right">{row.skipped_count}</td>
              <td className="py-2 pr-4 text-right">{Number(row.total_ai_cost_usd).toFixed(4)}</td>
              <td className="py-2 pr-4 text-right">{row.pending_reviews}</td>
              <td className="py-2 pr-4 text-right">{row.approved_reviews}</td>
              <td className="py-2 text-right">{row.rejected_reviews}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function DisclosuresPage() {
  let diagnostics = { parseErrorCount: 0, lowConfidenceReviewCount: 0, noDividendInfoCount: 0 };
  let disclosureSummary: AdminDisclosureSummaryRow[] = [];
  let backlog = { pending: 0, needs_manual_check: 0, total: 0 };
  try {
    diagnostics = await getParserDiagnosticSummary();
    disclosureSummary = await getAdminDisclosureSummary();
    backlog = await getAdminReviewBacklog();
  } catch {
    // Non-critical: diagnostics unavailable (e.g. during build or unauthenticated)
  }

  const hasIssues =
    diagnostics.parseErrorCount > 0 ||
    diagnostics.lowConfidenceReviewCount > 0 ||
    diagnostics.noDividendInfoCount > 0 ||
    backlog.total > 0;

  return (
    <div className="space-y-5">
      <PageHeader title="公示データ" />

      {/* Parser diagnostics + backlog */}
      <Card className="space-y-4 p-5">
        <h2 className="font-semibold">パーサー診断</h2>
        {hasIssues && (
          <div className="rounded-lg border border-warn/30 bg-warn/5 px-4 py-3 text-sm text-warn">
            要確認の項目があります。以下の件数を確認してください。
          </div>
        )}
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="解析失敗"
            count={diagnostics.parseErrorCount}
            description="parse_status が failed の公示。再試行またはPDF確認が必要です。"
            alertColor="text-danger"
          />
          <StatCard
            label={`低信頼度レビュー（<${Math.round(LOW_CONFIDENCE_THRESHOLD * 100)}%）`}
            count={diagnostics.lowConfidenceReviewCount}
            description="保留中・要確認レビューのうち信頼度が低いもの。内容を慎重に確認してください。"
            alertColor="text-warn"
          />
          <StatCard
            label="配当情報なし"
            count={diagnostics.noDividendInfoCount}
            description="解析済みだが配当情報が見つからなかった公示。分類精度の参考値です。"
          />
          <StatCard
            label="レビュー滞留"
            count={backlog.total}
            description={`保留 ${backlog.pending} 件 / 要確認 ${backlog.needs_manual_check} 件`}
            alertColor={backlog.total > 10 ? "text-warn" : undefined}
          />
        </dl>
      </Card>

      {/* Daily disclosure summary */}
      <Card className="space-y-4 p-5">
        <h2 className="font-semibold">直近7日間の収集サマリー</h2>
        <DisclosureSummaryTable rows={disclosureSummary} />
      </Card>

      {/* Collection flow info */}
      <Card className="space-y-3 p-5">
        <h2 className="font-semibold">収集フロー</h2>
        <p className="text-sm leading-6 text-muted">
          `collect-disclosures` は配当関連キーワードを含む候補を `disclosures`
          に保存し、解析用の `jobs` を作成します。重複は `external_id`
          で抑止します。
        </p>
        <p className="text-sm leading-6 text-muted">
          訂正（訂正・一部訂正）開示は自動的に高優先度に設定され、管理者レビュー一覧の上位に表示されます。
          大きな差異（既存承認済みイベントとの乖離）は警告として各レビューの raw_payload に記録されます。
        </p>
      </Card>
    </div>
  );
}
