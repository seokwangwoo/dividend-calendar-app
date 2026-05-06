import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

export default function DividendReviewsPage() {
  return (
    <div className="space-y-5">
      <PageHeader title="管理者検収" />
      <Card className="space-y-4 p-5">
        <h2 className="font-semibold">MVP 1st 運用</h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm leading-6 text-muted">
          <li>Supabase Studioで `dividend_reviews.status = pending` を確認します。</li>
          <li>`disclosures.document_url` または署名付きURLで元資料を確認します。</li>
          <li>抽出値を必要に応じて修正してから承認または却下します。</li>
          <li>承認は `approve-dividend-review`、却下は `reject-dividend-review` を呼び出します。</li>
          <li>承認済みデータだけが利用者向けの配当予定と通知に反映されます。</li>
        </ol>
      </Card>
    </div>
  );
}
