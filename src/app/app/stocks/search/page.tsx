"use client";

import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { searchStocksAction } from "@/features/stocks/actions";
import { useStockSearch } from "@/features/stocks/use-stock-search";
import type { StockRow } from "@/features/stocks/queries";

function formatYield(stock: StockRow): string {
  if (stock.expected_dividend_yield == null) {
    return "配当データ確保中";
  }
  return `${(stock.expected_dividend_yield * 100).toFixed(2)}%`;
}

function StockCard({ stock }: { stock: StockRow }) {
  const yieldLabel = formatYield(stock);

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-sm">{stock.name}</p>
          <p className="text-xs text-muted mt-0.5">{stock.ticker}</p>
          {stock.market_segment && (
            <p className="text-xs text-muted">{stock.market_segment}</p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-semibold text-brand">{yieldLabel}</p>
          <p className="text-xs text-muted">予想利回り</p>
        </div>
      </div>
      <div className="flex gap-2">
        <Link
          href={`/app/stocks/${stock.id}`}
          className="flex-1 inline-flex h-9 items-center justify-center rounded-md border border-line bg-white px-3 text-xs font-semibold text-ink hover:bg-paper"
        >
          상세 보기
        </Link>
        <Link
          href={`/app/portfolio/new?stockId=${stock.id}`}
          className="flex-1 inline-flex h-9 items-center justify-center rounded-md bg-brand px-3 text-xs font-semibold text-white"
        >
          보유 추가
        </Link>
      </div>
    </Card>
  );
}

export default function StockSearchPage() {
  const { query, setQuery, results, isLoading } = useStockSearch(searchStocksAction);

  const isEmpty = query.trim().length === 0;
  const hasNoResults = !isEmpty && !isLoading && results.length === 0;

  return (
    <div className="space-y-5">
      <PageHeader title="종목 검색" />

      <Input
        placeholder="銘柄名またはコードで検索"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoFocus
      />

      {isLoading && (
        <p className="text-sm text-muted text-center">検索中…</p>
      )}

      {isEmpty && !isLoading && (
        <p className="text-sm text-muted text-center">
          銘柄名またはコードを入力してください
        </p>
      )}

      {hasNoResults && (
        <p className="text-sm text-muted text-center">
          該当する銘柄が見つかりませんでした
        </p>
      )}

      {results.length > 0 && (
        <div className="space-y-3">
          {results.map((stock) => (
            <StockCard key={stock.id} stock={stock} />
          ))}
        </div>
      )}
    </div>
  );
}
