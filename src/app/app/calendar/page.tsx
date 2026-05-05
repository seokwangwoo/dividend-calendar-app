import { PageHeader } from "@/components/ui/page-header";
import { getDividendCalendar } from "@/features/dividends/queries";
import { CalendarClient } from "@/features/calendar/components/calendar-client";

export default async function CalendarPage() {
  const year = new Date().getFullYear();
  const basis = "after_tax";
  const accountType = "all";

  const initialCalendar = await getDividendCalendar(year, basis, accountType);

  return (
    <div className="space-y-5">
      <PageHeader title="配当カレンダー" />
      <CalendarClient
        initialYear={year}
        initialCalendar={initialCalendar}
        initialBasis={basis}
        initialAccountType={accountType}
      />
    </div>
  );
}
