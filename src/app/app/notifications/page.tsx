import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

export default function NotificationsPage() {
  return (
    <div className="space-y-5">
      <PageHeader title="通知" />
      <EmptyState
        title="通知はありません"
        description="目標利回りや配当情報の更新があるとここに表示されます。"
      />
    </div>
  );
}
