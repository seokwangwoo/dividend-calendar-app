"use client";

import { useState, useTransition, useRef } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { formatCurrencyJpy } from "@/lib/formatting/number";
import { formatAccountType } from "@/lib/formatting/dividends";
import {
  previewCsvHoldings,
  commitCsvHoldings
} from "@/features/holdings/actions";
import type { CsvPreviewResult, CsvPreviewRow } from "@/features/holdings/actions";

type Step = "upload" | "preview" | "result";

interface CommitResult {
  insertedCount: number;
  skippedCount: number;
}

function StatusBadge({ row }: { row: CsvPreviewRow }) {
  if (row.isDuplicate) {
    return (
      <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
        重複スキップ
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
      有効
    </span>
  );
}

const CSV_FORMAT_EXAMPLE = `ticker,quantity,average_purchase_price,account_type,memo
9433,100,4300,nisa,
2914,50,3800,tokutei,JT特定口座分
7203,200,2500,general,トヨタ`;

export function CsvImportPage() {
  const [step, setStep] = useState<Step>("upload");
  const [csvText, setCsvText] = useState("");
  const [preview, setPreview] = useState<CsvPreviewResult | null>(null);
  const [commitResult, setCommitResult] = useState<CommitResult | null>(null);
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
      setCommitResult(null);
      setError(null);
    };
    reader.readAsText(file);
  }

  function runPreview() {
    if (!csvText.trim()) {
      setError("CSVテキストを入力またはファイルを選択してください。");
      return;
    }
    setError(null);
    setPreview(null);
    setCommitResult(null);
    startTransition(async () => {
      try {
        const result = await previewCsvHoldings(csvText);
        setPreview(result);
        setStep("preview");
      } catch (err) {
        setError(err instanceof Error ? err.message : "プレビューに失敗しました");
      }
    });
  }

  function runCommit() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await commitCsvHoldings(csvText);
        setCommitResult(result);
        setStep("result");
        setCsvText("");
        setPreview(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
      } catch (err) {
        setError(err instanceof Error ? err.message : "登録に失敗しました");
      }
    });
  }

  function resetToUpload() {
    setStep("upload");
    setCsvText("");
    setPreview(null);
    setCommitResult(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const nonDuplicateCount = preview?.previewRows.filter((r) => !r.isDuplicate).length ?? 0;
  const duplicateCount = preview?.previewRows.filter((r) => r.isDuplicate).length ?? 0;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Step indicators */}
      <div className="flex items-center gap-2 text-sm text-muted">
        <span className={step === "upload" ? "font-semibold text-ink" : ""}>
          1. アップロード
        </span>
        <span>/</span>
        <span className={step === "preview" ? "font-semibold text-ink" : ""}>
          2. プレビュー
        </span>
        <span>/</span>
        <span className={step === "result" ? "font-semibold text-ink" : ""}>
          3. 完了
        </span>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Step 1: Upload */}
      {step === "upload" && (
        <div className="space-y-6">
          {/* CSV format documentation */}
          <div className="rounded-md border border-line bg-paper p-4 space-y-2">
            <h2 className="text-sm font-semibold">CSVフォーマット</h2>
            <p className="text-xs text-muted">
              以下の列順で作成してください。1行目のヘッダー行はスキップされます。
            </p>
            <pre className="rounded-md bg-ink/5 p-3 text-xs font-mono overflow-x-auto whitespace-pre">
              {CSV_FORMAT_EXAMPLE}
            </pre>
            <ul className="text-xs text-muted space-y-0.5 list-disc list-inside">
              <li><code className="font-mono">account_type</code>: <code>nisa</code> / <code>tokutei</code> / <code>general</code>（日本語エイリアスも可）</li>
              <li><code className="font-mono">memo</code>: 任意。省略可。</li>
            </ul>
          </div>

          {/* File picker */}
          <div className="space-y-3">
            <label className="block text-sm font-medium">CSVファイルを選択</label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="block w-full text-sm file:mr-4 file:rounded-md file:border-0 file:bg-brand file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-brand/90"
            />
          </div>

          {/* Paste textarea */}
          <div className="space-y-3">
            <label className="block text-sm font-medium">またはCSVテキストを貼り付け</label>
            <textarea
              value={csvText}
              onChange={(e) => {
                setCsvText(e.target.value);
                setPreview(null);
                setError(null);
              }}
              placeholder={CSV_FORMAT_EXAMPLE}
              rows={6}
              className="w-full rounded-md border border-line bg-white p-3 text-sm font-mono placeholder:text-muted/50 focus:outline-none focus:ring-2 focus:ring-brand/30"
            />
          </div>

          <Button onClick={runPreview} disabled={isPending || !csvText.trim()}>
            {isPending ? "プレビュー中…" : "プレビュー →"}
          </Button>
        </div>
      )}

      {/* Step 2: Preview */}
      {step === "preview" && preview && (
        <div className="space-y-4">
          {/* Summary bar */}
          <div className="flex flex-wrap gap-3 text-sm">
            {nonDuplicateCount > 0 && (
              <span className="rounded-full bg-green-100 px-3 py-1 text-green-800 font-medium">
                登録予定 {nonDuplicateCount}件
              </span>
            )}
            {duplicateCount > 0 && (
              <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-800 font-medium">
                重複スキップ {duplicateCount}件
              </span>
            )}
            {preview.errors.length > 0 && (
              <span className="rounded-full bg-red-100 px-3 py-1 text-red-800 font-medium">
                エラー {preview.errors.length}件
              </span>
            )}
          </div>

          {/* Error rows */}
          {preview.errors.length > 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
              <p className="mb-2 text-sm font-medium text-amber-800">
                エラー行（インポートされません）
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

          {/* Preview table */}
          {preview.previewRows.length > 0 && (
            <div className="overflow-auto rounded-md border border-line">
              <table className="w-full text-sm">
                <thead className="bg-paper text-left text-muted">
                  <tr>
                    <th className="px-3 py-2">行</th>
                    <th className="px-3 py-2">銘柄コード</th>
                    <th className="px-3 py-2">会社名</th>
                    <th className="px-3 py-2">数量</th>
                    <th className="px-3 py-2">平均取得単価</th>
                    <th className="px-3 py-2">口座</th>
                    <th className="px-3 py-2">ステータス</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {preview.previewRows.map((row, idx) => (
                    <tr key={idx} className={row.isDuplicate ? "opacity-60" : ""}>
                      <td className="px-3 py-2 text-muted">{idx + 1}</td>
                      <td className="px-3 py-2 font-mono">{row.ticker}</td>
                      <td className="px-3 py-2">{row.stockName}</td>
                      <td className="px-3 py-2">{row.quantity}</td>
                      <td className="px-3 py-2">{formatCurrencyJpy(row.averagePurchasePrice)}</td>
                      <td className="px-3 py-2">{formatAccountType(row.accountType)}</td>
                      <td className="px-3 py-2">
                        <StatusBadge row={row} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {preview.previewRows.length === 0 && preview.errors.length === 0 && (
            <p className="text-sm text-muted">有効な行がありません。</p>
          )}

          <div className="flex gap-3">
            <Button variant="secondary" onClick={resetToUpload} disabled={isPending}>
              ← 戻る
            </Button>
            <Button
              onClick={runCommit}
              disabled={isPending || nonDuplicateCount === 0}
            >
              {isPending
                ? "登録中…"
                : nonDuplicateCount > 0
                ? `${nonDuplicateCount}件をインポート確定`
                : "インポートできる行がありません"}
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Result */}
      {step === "result" && commitResult && (
        <div className="space-y-4">
          <div className="rounded-md border border-green-200 bg-green-50 p-4 space-y-2">
            <p className="text-sm font-semibold text-green-800">インポート完了</p>
            <ul className="text-sm text-green-700 space-y-1">
              <li>登録件数: <strong>{commitResult.insertedCount}件</strong></li>
              {commitResult.skippedCount > 0 && (
                <li>重複スキップ: <strong>{commitResult.skippedCount}件</strong></li>
              )}
            </ul>
          </div>

          <div className="flex gap-3">
            <Button variant="secondary" onClick={resetToUpload}>
              続けてインポート
            </Button>
            <Link
              href="/app/portfolio"
              className="inline-flex h-10 items-center rounded-md bg-brand px-4 text-sm font-semibold text-white hover:bg-brand/90"
            >
              ポートフォリオへ戻る
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
