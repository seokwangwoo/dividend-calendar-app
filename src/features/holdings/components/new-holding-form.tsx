"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FormField } from "@/components/ui/form-field";
import { Select } from "@/components/ui/select";
import { formatCurrencyJpy, formatPercent } from "@/lib/formatting/number";
import { calculateHoldingDividend } from "@/lib/dividends/calculations";
import { createHolding } from "@/features/holdings/actions";
import { ACCOUNT_TYPE_OPTIONS } from "@/lib/constants/dividends";
import { useStockSearch } from "@/features/stocks/use-stock-search";
import type { StockRow } from "@/features/stocks/queries";
import type { AccountType } from "@/lib/constants/dividends";

const DISCLAIMER =
  "税額および税引後配当額は概算です。実際の税額・入金額は証券会社の明細をご確認ください。";

type CompletionData = {
  stockName: string;
  ticker: string;
  afterTaxAmount: number | null;
};

function StockSearchResult({
  stock,
  onSelect
}: {
  stock: StockRow;
  onSelect: (stock: StockRow) => void;
}) {
  const isSupported = stock.support_status === "supported";

  return (
    <div className="flex items-center justify-between rounded-md border border-line px-3 py-2">
      <div>
        <span className="text-sm font-medium">{stock.name}</span>
        <span className="ml-2 text-xs text-muted">{stock.ticker}</span>
        {stock.market_segment && (
          <span className="ml-2 text-xs text-muted">({stock.market_segment})</span>
        )}
        {!isSupported && (
          <Badge variant="warning" className="ml-2">
            現在未対応
          </Badge>
        )}
      </div>
      <Button
        type="button"
        variant="secondary"
        className="h-8 px-3 text-xs"
        disabled={!isSupported}
        onClick={() => isSupported && onSelect(stock)}
      >
        選択
      </Button>
    </div>
  );
}

function DividendCalcCard({
  stock,
  quantity,
  accountType
}: {
  stock: StockRow;
  quantity: number;
  accountType: AccountType;
}) {
  const calc = calculateHoldingDividend({
    expectedAnnualDividendPerShare: stock.expected_annual_dividend_per_share,
    currentPrice: stock.current_price,
    quantity,
    accountType,
    currency: stock.currency
  });

  return (
    <Card className="space-y-3 p-4 bg-paper">
      <h3 className="text-sm font-semibold">配当シミュレーション（年間）</h3>
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted">税引前配当</span>
          <span>{formatCurrencyJpy(calc.beforeTaxAmount)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted">概算税額</span>
          <span>−{formatCurrencyJpy(calc.estimatedTaxAmount)}</span>
        </div>
        <div className="flex justify-between font-semibold">
          <span>税引後配当</span>
          <span className="text-brand">{formatCurrencyJpy(calc.afterTaxAmount)}</span>
        </div>
        <div className="flex justify-between border-t border-line pt-2">
          <span className="text-muted">税引後利回り</span>
          <span>{formatPercent(calc.afterTaxYield)}</span>
        </div>
      </div>
      <p className="text-xs text-muted leading-relaxed">{DISCLAIMER}</p>
    </Card>
  );
}

function CompletionScreen({
  data,
  onAddAnother
}: {
  data: CompletionData;
  onAddAnother: () => void;
}) {
  return (
    <div className="space-y-5">
      <Card className="p-6 text-center space-y-4">
        <div className="text-4xl">✓</div>
        <div>
          <h2 className="text-lg font-semibold">銘柄を追加しました</h2>
          <p className="mt-1 text-sm text-muted">
            {data.stockName}（{data.ticker}）
          </p>
        </div>
        <div className="rounded-md bg-paper p-4">
          <p className="text-xs text-muted">予想年間税引後配当</p>
          <p className="mt-1 text-2xl font-bold text-brand">
            {formatCurrencyJpy(data.afterTaxAmount)}
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Link
            href="/app/calendar"
            className="inline-flex h-11 items-center justify-center rounded-md bg-brand px-4 text-sm font-semibold text-white"
          >
            カレンダーで確認
          </Link>
          <button
            type="button"
            onClick={onAddAnother}
            className="inline-flex h-11 items-center justify-center rounded-md border border-line bg-white px-4 text-sm font-semibold text-ink hover:bg-paper"
          >
            続けて銘柄を追加
          </button>
        </div>
      </Card>
    </div>
  );
}

export function NewHoldingForm({
  onSearch
}: {
  onSearch: (query: string) => Promise<StockRow[]>;
}) {
  const {
    query: searchQuery,
    setQuery: setSearchQuery,
    results: searchResults,
    isLoading: isSearching,
    clearResults
  } = useStockSearch(onSearch);

  const [selectedStock, setSelectedStock] = useState<StockRow | null>(null);
  const [quantity, setQuantity] = useState("");
  const [averagePurchasePrice, setAveragePurchasePrice] = useState("");
  const [accountType, setAccountType] = useState<AccountType>("tokutei");
  const [error, setError] = useState<string | null>(null);
  const [completion, setCompletion] = useState<CompletionData | null>(null);
  const [isSaving, startSave] = useTransition();

  const handleSelectStock = (stock: StockRow) => {
    setSelectedStock(stock);
    clearResults();
    setSearchQuery(stock.name);
    setError(null);
  };

  const handleReset = () => {
    setSelectedStock(null);
    setSearchQuery("");
    clearResults();
    setQuantity("");
    setAveragePurchasePrice("");
    setAccountType("tokutei");
    setError(null);
    setCompletion(null);
  };

  const parsedQuantity = parseFloat(quantity);
  const parsedPrice = parseFloat(averagePurchasePrice);
  const isQuantityValid = !isNaN(parsedQuantity) && parsedQuantity > 0;
  const isPriceValid = !isNaN(parsedPrice) && parsedPrice >= 0;
  const canSave = selectedStock !== null && isQuantityValid && isPriceValid;

  const handleSave = () => {
    if (!canSave || !selectedStock) return;
    setError(null);

    startSave(async () => {
      try {
        const formData = new FormData();
        formData.set("stockId", selectedStock.id);
        formData.set("quantity", quantity);
        formData.set("averagePurchasePrice", averagePurchasePrice);
        formData.set("accountType", accountType);

        await createHolding(formData);

        const calc = calculateHoldingDividend({
          expectedAnnualDividendPerShare:
            selectedStock.expected_annual_dividend_per_share,
          currentPrice: selectedStock.current_price,
          quantity: parsedQuantity,
          accountType,
          currency: selectedStock.currency
        });

        setCompletion({
          stockName: selectedStock.name,
          ticker: selectedStock.ticker,
          afterTaxAmount: calc.afterTaxAmount
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "保存に失敗しました");
      }
    });
  };

  if (completion) {
    return <CompletionScreen data={completion} onAddAnother={handleReset} />;
  }

  return (
    <div className="space-y-5">
      <Card className="space-y-4 p-5">
        {/* Stock search */}
        <FormField label="銘柄名またはコード" htmlFor="stock-search">
          <Input
            id="stock-search"
            placeholder="KDDI または 9433"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              if (selectedStock) setSelectedStock(null);
            }}
          />
          {isSearching && (
            <p className="mt-1 text-xs text-muted">検索中…</p>
          )}
        </FormField>

        {/* Search results */}
        {searchResults.length > 0 && !selectedStock && (
          <div className="space-y-2 rounded-md border border-line p-2">
            {searchResults.map((stock) => (
              <StockSearchResult
                key={stock.id}
                stock={stock}
                onSelect={handleSelectStock}
              />
            ))}
          </div>
        )}

        {/* Selected stock summary */}
        {selectedStock && (
          <div className="flex items-center gap-3 rounded-md bg-paper p-3">
            <div className="flex-1">
              <p className="text-sm font-semibold">{selectedStock.name}</p>
              <p className="text-xs text-muted">{selectedStock.ticker}</p>
            </div>
            <Button
              type="button"
              variant="ghost"
              className="h-8 px-2 text-xs"
              onClick={() => {
                setSelectedStock(null);
                setSearchQuery("");
              }}
            >
              変更
            </Button>
          </div>
        )}

        {/* Quantity */}
        <FormField label="保有数量" htmlFor="quantity">
          <Input
            id="quantity"
            inputMode="decimal"
            placeholder="100"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </FormField>

        {/* Average purchase price */}
        <FormField label="平均取得単価（円）" htmlFor="average-price">
          <Input
            id="average-price"
            inputMode="decimal"
            placeholder="4300"
            value={averagePurchasePrice}
            onChange={(e) => setAveragePurchasePrice(e.target.value)}
          />
        </FormField>

        {/* Account type */}
        <FormField label="口座区分" htmlFor="account-type">
          <Select
            id="account-type"
            options={ACCOUNT_TYPE_OPTIONS}
            value={accountType}
            onChange={(e) => setAccountType(e.target.value as AccountType)}
          />
        </FormField>

        {error && (
          <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>
        )}

        <Button
          type="button"
          className="w-full"
          disabled={!canSave || isSaving}
          onClick={handleSave}
        >
          {isSaving ? "保存中…" : "保存"}
        </Button>
      </Card>

      {/* Live calculation preview */}
      {selectedStock && isQuantityValid && (
        <DividendCalcCard
          stock={selectedStock}
          quantity={parsedQuantity}
          accountType={accountType}
        />
      )}
    </div>
  );
}
