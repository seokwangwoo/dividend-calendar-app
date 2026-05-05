import { PageHeader } from "@/components/ui/page-header";
import { NewHoldingForm } from "@/features/holdings/components/new-holding-form";
import { searchStocksAction } from "@/features/stocks/actions";

export default function NewHoldingPage() {
  return (
    <div className="space-y-5">
      <PageHeader title="銘柄追加" />
      <NewHoldingForm onSearch={searchStocksAction} />
    </div>
  );
}
