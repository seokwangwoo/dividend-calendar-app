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
