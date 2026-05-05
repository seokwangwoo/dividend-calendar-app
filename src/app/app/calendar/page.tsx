import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { formatCurrencyJpy } from "@/lib/formatting/number";
import { formatYearMonth } from "@/lib/formatting/date";

const months = Array.from({ length: 12 }, (_, index) => index + 1);

export default function CalendarPage() {
  const year = new Date().getFullYear();

  return (
    <div className="space-y-5">
      <PageHeader title="配当カレンダー" />
      <Card className="divide-y divide-line">
        {months.map((month) => (
          <div key={month} className="flex items-center justify-between p-4">
            <div>
              <p className="font-medium">{formatYearMonth(year, month)}</p>
              <p className="text-sm text-muted">入金予定 0件</p>
            </div>
            <div className="text-right">
              <p className="font-semibold">{formatCurrencyJpy(0)}</p>
              <Badge variant="neutral">税引後</Badge>
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}
