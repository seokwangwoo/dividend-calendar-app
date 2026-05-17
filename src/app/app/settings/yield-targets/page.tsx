import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import {
  getActiveYieldTargets,
  type ActiveYieldTarget
} from "@/features/notifications/queries";
import { calculateAchieved } from "@/features/notifications/yield-target";
import { formatPercent } from "@/lib/formatting/number";

function formatTarget(operator: ActiveYieldTarget["operator"], targetYield: number) {
  return `${operator === "gte" ? "以上" : "以下"} ${formatPercent(targetYield)}`;
}

function YieldTargetCard({ target }: { target: ActiveYieldTarget }) {
  const hasCurrentYield = target.expectedDividendYield !== null;
  const achieved = hasCurrentYield
    ? calculateAchieved(
        target.operator,
        target.targetYield,
        target.expectedDividendYield
      )
    : false;

  return (
    <Link href={`/app/stocks/${target.stockId}`} className="block">
      <Card className="p-4 transition hover:shadow-md">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{target.stockName}</p>
            <p className="mt-0.5 text-xs lowercase text-muted">{target.ticker}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="font-semibold text-brand">
              {hasCurrentYield
                ? formatPercent(target.expectedDividendYield)
                : "データなし"}
            </p>
            <p className="mt-0.5 text-xs text-muted">
              目標 {formatTarget(target.operator, target.targetYield)}
            </p>
          </div>
        </div>
        {hasCurrentYield ? (
          <div className="mt-3 flex justify-end">
            <Badge variant={achieved ? "success" : "neutral"}>
              {achieved ? "達成" : "未達成"}
            </Badge>
          </div>
        ) : null}
      </Card>
    </Link>
  );
}

export default async function YieldTargetsPage() {
  const targets = await getActiveYieldTargets();

  return (
    <div className="space-y-5">
      <PageHeader title="目標利回り管理" />

      {targets.length === 0 ? (
        <EmptyState
          title="目標利回りが設定されていません"
          description="銘柄を検索して目標利回りを設定しましょう"
          actionHref="/app/stocks/search"
          actionLabel="銘柄を探す"
        />
      ) : (
        <div className="space-y-3">
          {targets.map((target) => (
            <YieldTargetCard key={target.ruleId} target={target} />
          ))}
        </div>
      )}
    </div>
  );
}
