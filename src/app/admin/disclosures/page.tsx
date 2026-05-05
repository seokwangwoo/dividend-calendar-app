import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

export default function DisclosuresPage() {
  return (
    <div className="space-y-5">
      <PageHeader title="公示データ" />
      <EmptyState title="公示データは未接続です" />
    </div>
  );
}
