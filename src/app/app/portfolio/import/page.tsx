import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { CsvImportPage } from "@/features/holdings/components/csv-import-page";

export default function PortfolioImportPage() {
  return (
    <div className="space-y-5">
      <PageHeader title="CSVインポート">
        <Link
          href="/app/portfolio"
          className="inline-flex h-10 shrink-0 items-center rounded-md border border-line bg-white px-4 text-sm font-semibold text-ink hover:bg-paper"
        >
          ← ポートフォリオへ戻る
        </Link>
      </PageHeader>
      <CsvImportPage />
    </div>
  );
}
