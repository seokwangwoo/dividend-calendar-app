"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCurrencyJpy, formatPercent } from "@/lib/formatting/number";
import { formatAccountType } from "@/lib/formatting/dividends";
import {
  TAX_RATES,
  calculatePortfolioAfterTaxYield
} from "@/lib/dividends/calculations";
import type { HoldingWithStock } from "@/features/holdings/queries";
import type { PortfolioSummary } from "@/features/holdings/queries";
import type { AccountType } from "@/lib/constants/dividends";
import { sortHoldings, type PortfolioSortOption } from "@/features/holdings/sort";

const FILTER_OPTIONS = [
  { value: "all", label: "すべて" },
  { value: "nisa", label: "NISA" },
  { value: "tokutei", label: "特定口座" },
  { value: "general", label: "一般口座" }
] as const;

const SORT_OPTIONS: { value: PortfolioSortOption; label: string }[] = [
  { value: "annual_after_tax_desc", label: "税引後配当額順" },
  { value: "ticker_asc", label: "銘柄コード順" },
  { value: "recently_added", label: "最近追加" }
];

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
          <p className="text-xs text-muted">ポートフォリオ税引後利回り</p>
          <p className="mt-1 text-2xl font-bold">
            {formatPercent(summary.averageAfterTaxYield)}
          </p>
        </div>
      </div>
    </Card>
  );
}

function getApprovedAnnualDividendPerShare(
  holding: HoldingWithStock,
  year: number
): number | null {
  const total =
    holding.stock.dividend_events
      ?.filter(
        (event) =>
          event.review_status === "approved" &&
          event.payment_year === year &&
          event.dividend_per_share != null
      )
      .reduce((sum, event) => sum + Number(event.dividend_per_share), 0) ?? 0;

  return total > 0 ? total : null;
}

function calculateHoldingAnnualAmounts(holding: HoldingWithStock, year: number) {
  const annualDividendPerShare = getApprovedAnnualDividendPerShare(holding, year);
  const taxRate = TAX_RATES[holding.account_type as AccountType];

  if (annualDividendPerShare == null) {
    return {
      beforeTaxAmount: null,
      estimatedTaxAmount: null,
      afterTaxAmount: null
    };
  }

  const beforeTaxAmount = annualDividendPerShare * holding.quantity;
  const estimatedTaxAmount = beforeTaxAmount * taxRate;

  return {
    beforeTaxAmount,
    estimatedTaxAmount,
    afterTaxAmount: beforeTaxAmount - estimatedTaxAmount
  };
}

function HoldingCard({
  holding,
  year
}: {
  holding: HoldingWithStock;
  year: number;
}) {
  const { stock } = holding;
  const calc = calculateHoldingAnnualAmounts(holding, year);
  const acquisitionCost = holding.quantity * holding.average_purchase_price;
  const afterTaxYield = calculatePortfolioAfterTaxYield({
    annualAfterTaxDividend: calc.afterTaxAmount,
    totalAcquisitionCost: acquisitionCost
  });

  const isDelisted = stock.support_status === "delisted";
  const hasNoDividendData = calc.afterTaxAmount == null;

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
              {isDelisted && (
                <Badge variant="danger">上場廃止</Badge>
              )}
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
            {hasNoDividendData ? (
              <p className="text-sm text-muted">配当データ確認中</p>
            ) : (
              <>
                <p className="font-semibold text-brand">
                  {formatCurrencyJpy(calc.afterTaxAmount)}
                </p>
                <p className="text-xs text-muted">
                  {formatPercent(afterTaxYield)}
                </p>
              </>
            )}
          </div>
        </div>
      </Card>
    </Link>
  );
}

export function PortfolioClient({
  initialHoldings,
  initialSummary,
  year
}: {
  initialHoldings: HoldingWithStock[];
  initialSummary: PortfolioSummary;
  year: number;
}) {
  const [activeFilter, setActiveFilter] = useState<FilterValue>("all");
  const [activeSort, setActiveSort] = useState<PortfolioSortOption>("annual_after_tax_desc");

  const filteredHoldings = useMemo(() => {
    const list =
      activeFilter === "all"
        ? initialHoldings
        : initialHoldings.filter((h) => h.account_type === activeFilter);

    const withAmount = list.map((h) => ({
      ...h,
      annualAfterTaxAmount: calculateHoldingAnnualAmounts(h, year).afterTaxAmount
    }));

    return sortHoldings(withAmount, activeSort, (h) => h.stock.ticker) as HoldingWithStock[];
  }, [activeFilter, activeSort, initialHoldings, year]);

  // Compute local summary for filtered view
  const localSummary: PortfolioSummary =
    activeFilter === "all"
      ? initialSummary
      : (() => {
          let totalBefore = 0;
          let totalTax = 0;
          let totalAfter = 0;
          let totalAcquisitionCost = 0;

          for (const h of filteredHoldings) {
            const calc = calculateHoldingAnnualAmounts(h, year);
            totalAcquisitionCost += h.quantity * h.average_purchase_price;
            if (calc.beforeTaxAmount != null) totalBefore += calc.beforeTaxAmount;
            if (calc.estimatedTaxAmount != null) totalTax += calc.estimatedTaxAmount;
            if (calc.afterTaxAmount != null) totalAfter += calc.afterTaxAmount;
          }

          return {
            holdingCount: filteredHoldings.length,
            annualBeforeTaxAmount: totalBefore || null,
            annualEstimatedTaxAmount: totalTax || null,
            annualAfterTaxAmount: totalAfter || null,
            averageAfterTaxYield: calculatePortfolioAfterTaxYield({
              annualAfterTaxDividend: totalAfter || null,
              totalAcquisitionCost
            }),
            currency: initialSummary.currency
          };
        })();

  return (
    <div className="space-y-4">
      <SummaryCard summary={localSummary} />

      {/* Sort and filter controls */}
      <div className="flex flex-col gap-3 sm:flex-row">
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

        <div className="flex gap-2 overflow-x-auto pb-1">
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setActiveSort(opt.value)}
              className={`shrink-0 rounded-full border px-3 py-1 text-sm font-medium transition-colors ${
                activeSort === opt.value
                  ? "border-brand bg-brand/10 text-brand"
                  : "border-line text-muted hover:bg-paper"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
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
            <HoldingCard key={holding.id} holding={holding} year={year} />
          ))}
        </div>
      )}
    </div>
  );
}
