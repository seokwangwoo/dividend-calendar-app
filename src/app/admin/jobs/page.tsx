import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

export default function JobsPage() {
  return (
    <div className="space-y-5">
      <PageHeader title="ジョブ" />
      <EmptyState title="ジョブキューは未接続です" />
    </div>
  );
}
