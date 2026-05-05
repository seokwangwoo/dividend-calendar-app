"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FormField } from "@/components/ui/form-field";
import { Select } from "@/components/ui/select";
import { formatCurrencyJpy, formatPercent } from "@/lib/formatting/number";
import { calculateHoldingDividend } from "@/lib/dividends/calculations";
import { updateHolding, softDeleteHolding } from "@/features/holdings/actions";
import { ACCOUNT_TYPE_OPTIONS } from "@/lib/constants/dividends";
import type { HoldingWithStock } from "@/features/holdings/queries";
import type { AccountType } from "@/lib/constants/dividends";

const DISCLAIMER =
  "税額および税引後配当額は概算です。実際の税額・入金額は証券会社の明細をご確認ください。";

function DividendCalcCard({
  holding,
  quantity,
  accountType
}: {
  holding: HoldingWithStock;
  quantity: number;
  accountType: AccountType;
}) {
  const calc = calculateHoldingDividend({
    expectedAnnualDividendPerShare:
      holding.stock.expected_annual_dividend_per_share,
    currentPrice: holding.stock.current_price,
    quantity,
    accountType,
    currency: holding.stock.currency
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
          <span className="text-brand">
            {formatCurrencyJpy(calc.afterTaxAmount)}
          </span>
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

export function EditHoldingForm({ holding }: { holding: HoldingWithStock }) {
  const [quantity, setQuantity] = useState(String(holding.quantity));
  const [averagePurchasePrice, setAveragePurchasePrice] = useState(
    String(holding.average_purchase_price)
  );
  const [accountType, setAccountType] = useState<AccountType>(
    holding.account_type as AccountType
  );
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startSave] = useTransition();
  const [isDeleting, startDelete] = useTransition();

  const parsedQuantity = parseFloat(quantity);
  const parsedPrice = parseFloat(averagePurchasePrice);
  const isQuantityValid = !isNaN(parsedQuantity) && parsedQuantity > 0;
  const isPriceValid = !isNaN(parsedPrice) && parsedPrice >= 0;
  const canSave = isQuantityValid && isPriceValid;

  const handleSave = () => {
    if (!canSave) return;
    setError(null);
    startSave(async () => {
      try {
        const formData = new FormData();
        formData.set("quantity", quantity);
        formData.set("averagePurchasePrice", averagePurchasePrice);
        formData.set("accountType", accountType);
        await updateHolding(holding.id, formData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "保存に失敗しました");
      }
    });
  };

  const handleDelete = () => {
    if (!confirm(`${holding.stock.name} の保有情報を削除しますか？`)) return;
    setError(null);
    startDelete(async () => {
      try {
        await softDeleteHolding(holding.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "削除に失敗しました");
      }
    });
  };

  return (
    <div className="space-y-5">
      {/* Stock summary (read-only) */}
      <Card className="p-4">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <p className="font-semibold">{holding.stock.name}</p>
            <p className="text-sm text-muted">{holding.stock.ticker}</p>
          </div>
          <Badge variant="success">対応済</Badge>
        </div>
        {holding.stock.current_price != null && (
          <p className="mt-2 text-xs text-muted">
            現在株価: {formatCurrencyJpy(holding.stock.current_price)}
          </p>
        )}
      </Card>

      {/* Edit form */}
      <Card className="space-y-4 p-5">
        <FormField label="保有数量" htmlFor="quantity">
          <Input
            id="quantity"
            inputMode="decimal"
            placeholder="100"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </FormField>

        <FormField label="平均取得単価（円）" htmlFor="average-price">
          <Input
            id="average-price"
            inputMode="decimal"
            placeholder="4300"
            value={averagePurchasePrice}
            onChange={(e) => setAveragePurchasePrice(e.target.value)}
          />
        </FormField>

        <FormField label="口座区分" htmlFor="account-type">
          <Select
            id="account-type"
            options={ACCOUNT_TYPE_OPTIONS}
            value={accountType}
            onChange={(e) => setAccountType(e.target.value as AccountType)}
          />
        </FormField>

        {error && (
          <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}

        <Button
          type="button"
          className="w-full"
          disabled={!canSave || isSaving}
          onClick={handleSave}
        >
          {isSaving ? "保存中…" : "保存"}
        </Button>

        <Button
          type="button"
          variant="ghost"
          className="w-full text-red-600 hover:bg-red-50 hover:text-red-700"
          disabled={isDeleting}
          onClick={handleDelete}
        >
          {isDeleting ? "削除中…" : "この保有情報を削除"}
        </Button>
      </Card>

      {/* Live calculation preview */}
      {isQuantityValid && (
        <DividendCalcCard
          holding={holding}
          quantity={parsedQuantity}
          accountType={accountType}
        />
      )}
    </div>
  );
}
