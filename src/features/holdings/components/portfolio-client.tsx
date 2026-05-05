"use client";

import { useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCurrencyJpy, formatPercent } from "@/lib/formatting/number";
import { formatAccountType } from "@/lib/formatting/dividends";
import { calculateHoldingDividend } from "@/lib/dividends/calculations";
import type { HoldingWithStock } from "@/features/holdings/queries";
import type { PortfolioSummary } from "@/features/holdings/queries";
import type { AccountType } from "@/lib/constants/dividends";

const FILTER_OPTIONS = [
  { value: "all", label: "すべて" },
  { value: "nisa", label: "NISA" },
  { value: "tokutei", label: "特定口座" },
  { value: "general", label: "一般口座" }
] as const;

type FilterValue = (typeof FILTER_OPTIONS)[number]["value"];

function SummaryCard({ summary }: { summary: PortfolioSummary }) {
  return (
    <Card className="p-5">
      <h2 className="mb-4 text-sm font-semibold text-muted">ポートフォリオ概要</h2>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <p className="text-xs text-muted">保有銘柄数</p>
          <p className="mt-1 text-2xl font-bold">{summary.holdingCount}</p>
        </div>
        <div>
          <p className="text-xs text-muted">年間税引後配当</p>
          <p className="mt-1 text-2xl font-bold">
            {formatCurrencyJpy(summary.annualAfterTaxAmount)}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted">平均税引後利回り</p>
          <p className="mt-1 text-2xl font-bold">
            {formatPercent(summary.averageAfterTaxYield)}
          </p>
        </div>
      </div>
    </Card>
  );
}

function HoldingCard({ holding }: { holding: HoldingWithStock }) {
  const { stock } = holding;
  const calc = calculateHoldingDividend({
    expectedAnnualDividendPerShare: stock.expected_annual_dividend_per_share,
    currentPrice: stock.current_price,
    quantity: holding.quantity,
    accountType: holding.account_type as AccountType,
    currency: stock.currency
  });

  return (
    <Link
      href={`/app/portfolio/${holding.id}/edit`}
      className="block"
    >
      <Card className="p-4 transition hover:shadow-md">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium">{stock.name}</span>
              <span className="text-xs text-muted">{stock.ticker}</span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Badge variant="neutral">
                {formatAccountType(holding.account_type as AccountType)}
              </Badge>
              <span className="text-xs text-muted">
                {holding.quantity}株 @ {formatCurrencyJpy(holding.average_purchase_price)}
              </span>
            </div>
          </div>
          <div className="shrink-0 text-right">
            <p className="font-semibold text-brand">
              {formatCurrencyJpy(calc.afterTaxAmount)}
            </p>
            <p className="text-xs text-muted">
              {formatPercent(calc.afterTaxYield)}
            </p>
          </div>
        </div>
      </Card>
    </Link>
  );
}

export function PortfolioClient({
  initialHoldings,
  initialSummary
}: {
  initialHoldings: HoldingWithStock[];
  initialSummary: PortfolioSummary;
}) {
  const [activeFilter, setActiveFilter] = useState<FilterValue>("all");

  const filteredHoldings =
    activeFilter === "all"
      ? initialHoldings
      : initialHoldings.filter((h) => h.account_type === activeFilter);

  // Compute local summary for filtered view
  const localSummary: PortfolioSummary =
    activeFilter === "all"
      ? initialSummary
      : (() => {
          let totalBefore = 0;
          let totalTax = 0;
          let totalAfter = 0;
          let yieldSum = 0;
          let yieldCount = 0;

          for (const h of filteredHoldings) {
            const calc = calculateHoldingDividend({
              expectedAnnualDividendPerShare:
                h.stock.expected_annual_dividend_per_share,
              currentPrice: h.stock.current_price,
              quantity: h.quantity,
              accountType: h.account_type as AccountType,
              currency: h.stock.currency
            });
            if (calc.beforeTaxAmount != null) totalBefore += calc.beforeTaxAmount;
            if (calc.estimatedTaxAmount != null) totalTax += calc.estimatedTaxAmount;
            if (calc.afterTaxAmount != null) totalAfter += calc.afterTaxAmount;
            if (calc.afterTaxYield != null) {
              yieldSum += calc.afterTaxYield;
              yieldCount++;
            }
          }

          return {
            holdingCount: filteredHoldings.length,
            annualBeforeTaxAmount: totalBefore || null,
            annualEstimatedTaxAmount: totalTax || null,
            annualAfterTaxAmount: totalAfter || null,
            averageAfterTaxYield: yieldCount > 0 ? yieldSum / yieldCount : null,
            currency: initialSummary.currency
          };
        })();

  return (
    <div className="space-y-4">
      <SummaryCard summary={localSummary} />

      {/* Account type filter tabs */}
      <div className="flex rounded-lg border border-line bg-white p-1">
        {FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setActiveFilter(opt.value)}
            className={[
              "h-9 flex-1 rounded-md text-sm font-medium transition",
              activeFilter === opt.value
                ? "bg-paper text-ink"
                : "text-muted hover:text-ink"
            ].join(" ")}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Holdings list */}
      {filteredHoldings.length === 0 ? (
        <EmptyState
          title="保有銘柄がありません"
          description="数量、平均取得単価、口座区分を登録すると予想配当を確認できます。"
          actionHref="/app/portfolio/new"
          actionLabel="銘柄を追加"
        />
      ) : (
        <div className="space-y-3">
          {filteredHoldings.map((holding) => (
            <HoldingCard key={holding.id} holding={holding} />
          ))}
        </div>
      )}
    </div>
  );
}
