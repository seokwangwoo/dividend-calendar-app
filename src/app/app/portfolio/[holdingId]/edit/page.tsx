import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { getHoldingById } from "@/features/holdings/queries";
import { EditHoldingForm } from "@/features/holdings/components/edit-holding-form";

export default async function EditHoldingPage({
  params
}: {
  params: Promise<{ holdingId: string }>;
}) {
  const { holdingId } = await params;
  const holding = await getHoldingById(holdingId);

  if (!holding) {
    notFound();
  }

  return (
    <div className="space-y-5">
      <PageHeader title="保有情報編集" actionHref="/app/portfolio" actionLabel="← 戻る" />
      <EditHoldingForm holding={holding} />
    </div>
  );
}
