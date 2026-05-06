import { PageHeader } from "@/components/ui/page-header";
import { getDividendCalendar } from "@/features/dividends/queries";
import { getHoldings } from "@/features/holdings/queries";
import { CalendarClient } from "@/features/calendar/components/calendar-client";

export default async function CalendarPage() {
  const year = new Date().getFullYear();
  const basis = "after_tax";
  const accountType = "all";
  const calendarBasis = "payment_month";

  const [initialCalendar, holdings] = await Promise.all([
    getDividendCalendar(year, basis, accountType, calendarBasis),
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
        initialCalendarBasis={calendarBasis}
        initialHoldingCount={holdingCount}
      />
    </div>
  );
}
