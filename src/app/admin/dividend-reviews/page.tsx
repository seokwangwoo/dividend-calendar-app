import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

export default function DividendReviewsPage() {
  return (
    <div className="space-y-5">
      <PageHeader title="管理者検収" />
      <EmptyState
        title="検収待ちデータはありません"
        description="Phase 06で配当レビューの承認フローを実装します。"
      />
    </div>
  );
}
