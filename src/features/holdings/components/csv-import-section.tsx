"use client";

import { useState, useTransition, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatCurrencyJpy } from "@/lib/formatting/number";
import { formatAccountType } from "@/lib/formatting/dividends";
import {
  previewCsvHoldings,
  commitCsvHoldings
} from "@/features/holdings/actions";
import type { CsvPreviewResult } from "@/features/holdings/actions";

export function CsvImportSection() {
  const [open, setOpen] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [preview, setPreview] = useState<CsvPreviewResult | null>(null);
  const [committed, setCommitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = String(ev.target?.result ?? "");
      setCsvText(text);
      setPreview(null);
      setCommitted(false);
      setError(null);
    };
    reader.readAsText(file);
  }

  function runPreview() {
    setError(null);
    setPreview(null);
    setCommitted(false);
    startTransition(async () => {
      try {
        const result = await previewCsvHoldings(csvText);
        setPreview(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : "プレビューに失敗しました");
      }
    });
  }

  function runCommit() {
    setError(null);
    startTransition(async () => {
      try {
        await commitCsvHoldings(csvText);
        setCommitted(true);
        setCsvText("");
        setPreview(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
      } catch (err) {
        setError(err instanceof Error ? err.message : "登録に失敗しました");
      }
    });
  }

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        CSVインポート
      </Button>
    );
  }

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">CSVから銘柄を一括登録</h3>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setCsvText("");
            setPreview(null);
            setCommitted(false);
            setError(null);
          }}
          className="text-sm text-muted hover:text-ink"
        >
          閉じる
        </button>
      </div>

      <p className="text-xs text-muted">
        形式: ticker, quantity, average_purchase_price, account_type, memo(任意)
        <br />
        account_type: nisa / tokutei / general
      </p>

      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        onChange={handleFileChange}
        className="block w-full text-sm file:mr-4 file:rounded-md file:border-0 file:bg-brand file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-brand/90"
      />

      {csvText && (
        <Button onClick={runPreview} disabled={isPending}>
          {isPending ? "プレビュー中…" : "プレビュー"}
        </Button>
      )}

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {committed && (
        <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          登録が完了しました。
        </div>
      )}

      {preview && (
        <div className="space-y-3">
          {preview.errors.length > 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
              <p className="mb-2 text-sm font-medium text-amber-800">
                エラー {preview.errors.length}件
              </p>
              <ul className="space-y-1 text-sm text-amber-700">
                {preview.errors.map((e) => (
                  <li key={e.rowNumber}>
                    行 {e.rowNumber}: {e.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {preview.previewRows.length > 0 && (
            <>
              <p className="text-sm font-medium">
                登録予定 {preview.previewRows.length}件
              </p>
              <div className="max-h-64 overflow-auto rounded-md border border-line">
                <table className="w-full text-sm">
                  <thead className="bg-paper text-left text-muted">
                    <tr>
                      <th className="px-3 py-2">銘柄</th>
                      <th className="px-3 py-2">数量</th>
                      <th className="px-3 py-2">平均取得単価</th>
                      <th className="px-3 py-2">口座</th>
                      <th className="px-3 py-2">メモ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {preview.previewRows.map((row, idx) => (
                      <tr key={idx}>
                        <td className="px-3 py-2">
                          {row.stockName}
                          <span className="ml-1 text-xs text-muted">({row.ticker})</span>
                        </td>
                        <td className="px-3 py-2">{row.quantity}</td>
                        <td className="px-3 py-2">
                          {formatCurrencyJpy(row.averagePurchasePrice)}
                        </td>
                        <td className="px-3 py-2">
                          {formatAccountType(row.accountType)}
                        </td>
                        <td className="px-3 py-2 text-muted">
                          {row.memo ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {preview.errors.length === 0 && (
                <Button onClick={runCommit} disabled={isPending}>
                  {isPending ? "登録中…" : `${preview.previewRows.length}件を登録`}
                </Button>
              )}
            </>
          )}
        </div>
      )}
    </Card>
  );
}
