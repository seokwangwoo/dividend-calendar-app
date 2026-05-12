import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { getHoldings, getPortfolioSummary } from "@/features/holdings/queries";
import { PortfolioClient } from "@/features/holdings/components/portfolio-client";
import { CsvImportSection } from "@/features/holdings/components/csv-import-section";

export default async function PortfolioPage() {
  const year = new Date().getFullYear();
  const [holdings, summary] = await Promise.all([
    getHoldings(),
    getPortfolioSummary(undefined, year)
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="ポートフォリオ"
        actionHref="/app/portfolio/new"
        actionLabel="+ 銘柄追加"
      >
        <Link
          href="/app/stocks/search"
          className="inline-flex h-10 shrink-0 items-center rounded-md border border-line bg-white px-4 text-sm font-semibold text-ink hover:bg-paper"
        >
          종목 검색
        </Link>
        <CsvImportSection />
      </PageHeader>
      <PortfolioClient
        initialHoldings={holdings}
        initialSummary={summary}
        year={year}
      />
    </div>
  );
}
