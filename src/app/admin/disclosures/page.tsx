import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { getParserDiagnosticSummary, LOW_CONFIDENCE_THRESHOLD } from "@/features/admin/diagnostics-queries";

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
      <dd className={`mt-1 text-2xl font-bold tabular-nums ${count > 0 && alertColor ? alertColor : "text-muted"}`}>
        {count}
      </dd>
      <p className="mt-1 text-xs text-muted">{description}</p>
    </div>
  );
}

export default async function DisclosuresPage() {
  let diagnostics = { parseErrorCount: 0, lowConfidenceReviewCount: 0, noDividendInfoCount: 0 };
  try {
    diagnostics = await getParserDiagnosticSummary();
  } catch {
    // Non-critical: diagnostics unavailable (e.g. during build or unauthenticated)
  }

  const hasIssues =
    diagnostics.parseErrorCount > 0 ||
    diagnostics.lowConfidenceReviewCount > 0 ||
    diagnostics.noDividendInfoCount > 0;

  return (
    <div className="space-y-5">
      <PageHeader title="公示データ" />

      {/* Parser diagnostics */}
      <Card className="space-y-4 p-5">
        <h2 className="font-semibold">パーサー診断</h2>
        {hasIssues && (
          <div className="rounded-lg border border-warn/30 bg-warn/5 px-4 py-3 text-sm text-warn">
            要確認の項目があります。以下の件数を確認してください。
          </div>
        )}
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
        </dl>
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
