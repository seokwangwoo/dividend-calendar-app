import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

export default function JobsPage() {
  return (
    <div className="space-y-5">
      <PageHeader title="ジョブ" />
      <Card className="space-y-3 p-5">
        <h2 className="font-semibold">MVP 1st ジョブ</h2>
        <p className="text-sm leading-6 text-muted">
          `jobs` は収集後の解析処理を追跡する最小キューです。MVPでは
          Supabase Studioで状態を確認し、失敗時は `last_error` と
          `attempts` を見て手動で再実行します。
        </p>
      </Card>
    </div>
  );
}
