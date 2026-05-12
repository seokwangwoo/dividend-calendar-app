import { PageHeader } from "@/components/ui/page-header";
import { NewHoldingForm } from "@/features/holdings/components/new-holding-form";
import { searchStocksAction } from "@/features/stocks/actions";
import { getStockById } from "@/features/stocks/queries";
import type { StockRow } from "@/features/stocks/queries";

interface PageProps {
  searchParams: Promise<{ stockId?: string }>;
}

export default async function NewHoldingPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const stockId = params.stockId;

  let initialStock: StockRow | null = null;

  if (stockId) {
    const stock = await getStockById(stockId);
    // Only pre-populate if found and not delisted
    if (stock && stock.support_status !== "delisted") {
      initialStock = stock;
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader title="銘柄追加" />
      <NewHoldingForm onSearch={searchStocksAction} initialStock={initialStock} />
    </div>
  );
}
