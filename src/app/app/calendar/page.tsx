import { PageHeader } from "@/components/ui/page-header";
import { getDividendCalendar } from "@/features/dividends/queries";
import { getHoldings } from "@/features/holdings/queries";
import { CalendarClient } from "@/features/calendar/components/calendar-client";
import { DISCLOSURE_SOURCE_DISCLAIMER } from "@/features/notifications/constants";

export default async function CalendarPage() {
  const year = new Date().getFullYear();
  const basis = "after_tax";
  const accountType = "all";

  const [initialCalendar, holdings] = await Promise.all([
    getDividendCalendar(year, basis, accountType, "payment_month"),
    getHoldings()
  ]);

  const holdingCount = holdings.filter((h) => h.deleted_at == null).length;

  return (
    <div className="space-y-5">
      <PageHeader title="配当カレンダー" />
      <CalendarClient
        initialYear={year}
        initialCalendar={initialCalendar}
        initialBasis={basis}
        initialAccountType={accountType}
        initialHoldingCount={holdingCount}
      />
      <p className="whitespace-pre-line rounded-md bg-paper p-3 text-sm leading-6 text-muted">
        {DISCLOSURE_SOURCE_DISCLAIMER}
      </p>
    </div>
  );
}
