import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

export default function PortfolioPage() {
  return (
    <div className="space-y-5">
      <PageHeader
        title="ポートフォリオ"
        actionHref="/app/portfolio/new"
        actionLabel="追加"
      />
      <EmptyState
        title="保有銘柄がありません"
        description="数量、平均取得単価、口座区分を登録すると予想配当を確認できます。"
        actionHref="/app/portfolio/new"
        actionLabel="銘柄を追加"
      />
    </div>
  );
}
