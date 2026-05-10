import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { getDividendReviewById } from "@/features/admin/review-queries";
import {
  approveDividendReview,
  rejectDividendReview,
  getSignedPdfUrl
} from "@/features/admin/review-actions";

function reviewStatusBadge(status: string) {
  if (status === "approved") return <Badge variant="success">承認済</Badge>;
  if (status === "rejected") return <Badge variant="danger">却下</Badge>;
  if (status === "needs_manual_check") return <Badge variant="warning">要確認</Badge>;
  return <Badge variant="warning">保留中</Badge>;
}

function field(label: string, value: React.ReactNode) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm">{value ?? <span className="text-muted">—</span>}</dd>
    </div>
  );
}

function eventTypeLabel(t: string | null | undefined) {
  const map: Record<string, string> = {
    interim: "中間",
    year_end: "期末",
    annual_total: "年間合計（参考専用・集計除外）",
    special: "特別",
    commemorative: "記念",
    other: "その他"
  };
  return map[t ?? ""] ?? (t ?? "—");
}

function changeTypeLabel(t: string | null | undefined) {
  const map: Record<string, string> = {
    increase: "増額",
    decrease: "減額",
    no_dividend: "無配",
    resumed: "復配",
    special: "特別",
    commemorative: "記念",
    unchanged: "変化なし",
    unknown: "不明"
  };
  return map[t ?? ""] ?? (t ?? "—");
}

function disclosureTypeLabel(t: string | null | undefined) {
  const map: Record<string, string> = {
    dividend_forecast_revision: "配当予想修正",
    dividend_decision: "配当決定",
    earnings_release: "決算短信",
    earnings_revision: "業績修正",
    correction: "訂正",
    other: "その他"
  };
  return map[t ?? ""] ?? (t ?? "—");
}

export default async function DividendReviewDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { eventId } = await params;
  const sp = await searchParams;

  const reviewData = await getDividendReviewById(eventId);
  if (!reviewData) notFound();

  // Capture non-null reference after the notFound() guard
  const review = reviewData;
  const reviewId = review.id;

  const isAnnualTotal = review.event_type === "annual_total";
  const isActionable =
    review.status === "pending" || review.status === "needs_manual_check";

  // Determine whether payment_year is needed (month-only, no full date)
  const hasFullPaymentDate = !!review.extracted_payment_date;
  const needsPaymentYear = !hasFullPaymentDate && review.event_type !== "annual_total";

  // Signed PDF URL (generated on demand via ?pdf=1)
  let pdfSignedUrl: string | null = null;
  let pdfError: string | null = null;
  if (sp.pdf === "1" && review.disclosures?.storage_path) {
    const result = await getSignedPdfUrl(review.disclosures.storage_path);
    if ("url" in result) {
      pdfSignedUrl = result.url;
    } else {
      pdfError = result.error;
    }
  }

  // ---- Server actions ----

  async function approveAction(formData: FormData) {
    "use server";
    const getValue = (name: string) => {
      const v = formData.get(name);
      return v !== null && String(v).trim() !== "" ? String(v).trim() : null;
    };

    const dividendPerShareRaw = getValue("dividendPerShare");
    const previousDividendPerShareRaw = getValue("previousDividendPerShare");
    const paymentYearRaw = getValue("paymentYear");
    const expectedPaymentMonthRaw = getValue("expectedPaymentMonth");
    const expectedPaymentDateRaw = getValue("expectedPaymentDate");
    const recordDateRaw = getValue("recordDate");
    const eventTypeRaw = getValue("eventType");
    const changeTypeRaw = getValue("changeType");
    const statusRaw = getValue("status");

    const override = {
      ...(dividendPerShareRaw != null ? { dividendPerShare: Number(dividendPerShareRaw) } : {}),
      ...(previousDividendPerShareRaw != null
        ? { previousDividendPerShare: Number(previousDividendPerShareRaw) }
        : {}),
      ...(paymentYearRaw != null ? { paymentYear: Number(paymentYearRaw) } : {}),
      ...(expectedPaymentMonthRaw != null
        ? { expectedPaymentMonth: Number(expectedPaymentMonthRaw) }
        : {}),
      ...(expectedPaymentDateRaw != null ? { expectedPaymentDate: expectedPaymentDateRaw } : {}),
      ...(recordDateRaw != null ? { recordDate: recordDateRaw } : {}),
      ...(eventTypeRaw != null ? { eventType: eventTypeRaw } : {}),
      ...(changeTypeRaw != null ? { changeType: changeTypeRaw } : {}),
      ...(statusRaw != null ? { status: statusRaw } : {})
    };

    const result = await approveDividendReview(reviewId, override);
    if (result.ok) {
      redirect("/admin/dividend-reviews");
    } else {
      redirect(`/admin/dividend-reviews/${reviewId}?error=${encodeURIComponent(result.error)}`);
    }
  }

  async function rejectAction(formData: FormData) {
    "use server";
    const reason = String(formData.get("reason") ?? "").trim();
    const result = await rejectDividendReview(reviewId, reason);
    if (result.ok) {
      redirect("/admin/dividend-reviews");
    } else {
      redirect(
        `/admin/dividend-reviews/${reviewId}?error=${encodeURIComponent(result.error)}`
      );
    }
  }

  const errorMessage = sp.error ? decodeURIComponent(sp.error) : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start gap-3">
        <PageHeader
          title={`${review.stocks?.ticker ?? "—"} AI配当候補`}
          subtitle={review.stocks?.name ?? undefined}
        />
        {reviewStatusBadge(review.status)}
        {isAnnualTotal && (
          <Badge variant="neutral" className="self-start">
            参考専用（集計除外）
          </Badge>
        )}
      </div>

      {/* Investment caution */}
      <div className="rounded-lg border border-warn/30 bg-warn/5 px-4 py-3 text-sm text-warn">
        以下はAIによる抽出候補です。承認前に原文PDFおよび出典を必ずご確認ください。
        {isAnnualTotal && (
          <span className="ml-2 font-medium">
            ※ 年間合計（annual_total）はユーザー向け配当集計に含まれません。
          </span>
        )}
      </div>

      {errorMessage && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          エラー: {errorMessage}
        </div>
      )}

      {/* Disclosure info */}
      {review.disclosures && (
        <Card className="p-5">
          <h2 className="mb-4 font-semibold">開示情報</h2>
          <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
            {field("開示タイトル", review.disclosures.title)}
            {field("開示種別", disclosureTypeLabel(review.disclosures.disclosure_type))}
            {field(
              "公表日",
              review.disclosures.published_at
                ? new Date(review.disclosures.published_at).toLocaleString("ja-JP")
                : null
            )}
            {field("解析状態", review.disclosures.parse_status)}
            {review.disclosures.last_parse_error &&
              field(
                "解析エラー",
                <span className="text-red-700">{review.disclosures.last_parse_error}</span>
              )}
            {field(
              "元PDF URL",
              review.disclosures.document_url ? (
                <a
                  href={review.disclosures.document_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="break-all text-brand hover:underline"
                >
                  {review.disclosures.document_url}
                </a>
              ) : null
            )}
          </dl>

          {/* Signed PDF access */}
          <div className="mt-4 border-t border-line pt-4">
            <div className="flex flex-wrap items-center gap-3">
              {review.disclosures.storage_path ? (
                <>
                  <span className="text-sm text-muted">
                    保管PDF: {review.disclosures.storage_path}
                  </span>
                  <Link
                    href={`/admin/dividend-reviews/${review.id}?pdf=1`}
                    className="inline-flex h-8 items-center rounded-md border border-brand px-3 text-xs font-semibold text-brand hover:bg-brand/5"
                  >
                    署名付きURLを生成（5分間有効）
                  </Link>
                  {pdfSignedUrl && (
                    <a
                      href={pdfSignedUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-8 items-center rounded-md bg-brand px-3 text-xs font-semibold text-white"
                    >
                      PDFを開く ↗
                    </a>
                  )}
                  {pdfError && (
                    <span className="text-xs text-red-700">{pdfError}</span>
                  )}
                </>
              ) : (
                <span className="text-sm text-muted">PDFは保管されていません</span>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Extracted values */}
      <Card className="p-5">
        <h2 className="mb-4 font-semibold">AI抽出値</h2>
        <dl className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-3">
          {field("決算年", review.fiscal_year)}
          {field("種別", eventTypeLabel(review.event_type))}
          {field(
            "1株配当（抽出）",
            review.extracted_dividend_per_share != null
              ? `¥${review.extracted_dividend_per_share}`
              : null
          )}
          {field(
            "前回配当",
            review.previous_dividend_per_share != null
              ? `¥${review.previous_dividend_per_share}`
              : null
          )}
          {field("変化種別", changeTypeLabel(review.change_type))}
          {field(
            "信頼度",
            review.confidence_score != null
              ? `${Math.round(review.confidence_score * 100)}%`
              : null
          )}
          {field("権利確定日", review.extracted_record_date)}
          {field("権利落ち日", review.extracted_ex_dividend_date)}
          {field("支払予定日", review.extracted_payment_date)}
          {field(
            "支払予定月",
            review.extracted_payment_month ? `${review.extracted_payment_month}月` : null
          )}
        </dl>

        {review.evidence_text && (
          <div className="mt-4 border-t border-line pt-4">
            <dt className="text-xs font-medium text-muted">エビデンステキスト</dt>
            <dd className="mt-1 whitespace-pre-wrap rounded-md bg-paper p-3 text-xs">
              {review.evidence_text}
            </dd>
          </div>
        )}

        {review.warning_message && (
          <div className="mt-3 rounded-md border border-warn/30 bg-warn/5 p-3 text-sm text-warn">
            ⚠ {review.warning_message}
          </div>
        )}
      </Card>

      {/* Raw AI payload (admin-only) */}
      <Card className="p-5">
        <details>
          <summary className="cursor-pointer text-sm font-semibold">
            RAWペイロード（管理者専用）
          </summary>
          <pre className="mt-3 overflow-auto rounded-md bg-paper p-3 text-xs">
            {JSON.stringify(review.raw_payload, null, 2)}
          </pre>
        </details>
      </Card>

      {/* Review metadata */}
      {(review.reviewed_by || review.reviewed_at || review.rejection_reason) && (
        <Card className="p-5">
          <h2 className="mb-4 font-semibold">レビュー情報</h2>
          <dl className="grid grid-cols-2 gap-x-8 gap-y-4">
            {review.reviewed_at &&
              field(
                "レビュー日時",
                new Date(review.reviewed_at).toLocaleString("ja-JP")
              )}
            {review.rejection_reason &&
              field(
                "却下理由",
                <span className="text-red-700">{review.rejection_reason}</span>
              )}
            {review.created_dividend_event_id &&
              field(
                "作成イベントID",
                <span className="font-mono text-xs">
                  {review.created_dividend_event_id}
                </span>
              )}
          </dl>
        </Card>
      )}

      {/* Approve / Reject actions */}
      {isActionable && (
        <Card className="space-y-6 p-5">
          <div>
            <h2 className="mb-1 font-semibold">承認（値の上書き）</h2>
            <p className="mb-4 text-xs text-muted">
              空欄のフィールドはAI抽出値をそのまま使用します。
              {needsPaymentYear && (
                <strong className="ml-1 text-red-700">
                  支払年は必須です（支払日が不明なため）。
                </strong>
              )}
            </p>
            <form action={approveAction} className="space-y-4">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <FormField label="1株配当（円）" htmlFor="dividendPerShare">
                  <Input
                    id="dividendPerShare"
                    name="dividendPerShare"
                    type="number"
                    step="0.01"
                    min={0}
                    placeholder={
                      review.extracted_dividend_per_share != null
                        ? `AI: ${review.extracted_dividend_per_share}`
                        : "未定"
                    }
                  />
                </FormField>

                <FormField label="前回配当（円）" htmlFor="previousDividendPerShare">
                  <Input
                    id="previousDividendPerShare"
                    name="previousDividendPerShare"
                    type="number"
                    step="0.01"
                    min={0}
                    placeholder={
                      review.previous_dividend_per_share != null
                        ? `AI: ${review.previous_dividend_per_share}`
                        : "未設定"
                    }
                  />
                </FormField>

                <FormField
                  label={needsPaymentYear ? "支払年 *必須" : "支払年（上書き）"}
                  htmlFor="paymentYear"
                >
                  <Input
                    id="paymentYear"
                    name="paymentYear"
                    type="number"
                    min={2000}
                    max={2100}
                    required={needsPaymentYear}
                    placeholder={needsPaymentYear ? "例: 2026" : "空欄=自動"}
                  />
                </FormField>

                <FormField label="支払月（上書き）" htmlFor="expectedPaymentMonth">
                  <Input
                    id="expectedPaymentMonth"
                    name="expectedPaymentMonth"
                    type="number"
                    min={1}
                    max={12}
                    placeholder={
                      review.extracted_payment_month != null
                        ? `AI: ${review.extracted_payment_month}`
                        : "1〜12"
                    }
                  />
                </FormField>

                <FormField label="支払予定日（上書き）" htmlFor="expectedPaymentDate">
                  <Input
                    id="expectedPaymentDate"
                    name="expectedPaymentDate"
                    type="date"
                    placeholder="YYYY-MM-DD"
                  />
                </FormField>

                <FormField label="権利確定日（上書き）" htmlFor="recordDate">
                  <Input
                    id="recordDate"
                    name="recordDate"
                    type="date"
                    placeholder="YYYY-MM-DD"
                  />
                </FormField>
              </div>

              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <FormField label="種別（上書き）" htmlFor="eventType">
                  <select
                    id="eventType"
                    name="eventType"
                    className="h-11 w-full rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
                  >
                    <option value="">空欄=AI値</option>
                    <option value="interim">中間</option>
                    <option value="year_end">期末</option>
                    <option value="annual_total">年間合計</option>
                    <option value="special">特別</option>
                    <option value="commemorative">記念</option>
                    <option value="other">その他</option>
                  </select>
                </FormField>

                <FormField label="変化種別（上書き）" htmlFor="changeType">
                  <select
                    id="changeType"
                    name="changeType"
                    className="h-11 w-full rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
                  >
                    <option value="">空欄=AI値</option>
                    <option value="increase">増額</option>
                    <option value="decrease">減額</option>
                    <option value="no_dividend">無配</option>
                    <option value="resumed">復配</option>
                    <option value="special">特別</option>
                    <option value="commemorative">記念</option>
                    <option value="unchanged">変化なし</option>
                    <option value="unknown">不明</option>
                  </select>
                </FormField>

                <FormField label="状態（上書き）" htmlFor="status">
                  <select
                    id="status"
                    name="status"
                    className="h-11 w-full rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
                  >
                    <option value="">空欄=AI値</option>
                    <option value="estimated">予想</option>
                    <option value="confirmed">確定</option>
                    <option value="paid">支払済</option>
                    <option value="undecided">未定</option>
                  </select>
                </FormField>
              </div>

              <button
                type="submit"
                className="inline-flex h-10 items-center rounded-md bg-brand px-5 text-sm font-semibold text-white"
              >
                承認する
              </button>
            </form>
          </div>

          <div className="border-t border-line pt-4">
            <h2 className="mb-2 font-semibold">却下</h2>
            <p className="mb-3 text-xs text-muted">
              却下理由は必須です。却下後は元に戻せません。
            </p>
            <form action={rejectAction} className="flex flex-wrap gap-3">
              <input
                name="reason"
                placeholder="却下理由（必須）"
                required
                className="h-10 flex-1 min-w-48 rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
              />
              <button
                type="submit"
                className="inline-flex h-10 items-center rounded-md border border-red-200 bg-red-50 px-5 text-sm font-semibold text-red-700"
              >
                却下する
              </button>
            </form>
          </div>
        </Card>
      )}

      <Link
        href="/admin/dividend-reviews"
        className="inline-flex h-9 items-center text-sm text-muted hover:underline"
      >
        ← 一覧に戻る
      </Link>

      {/* Timestamps */}
      <div className="text-xs text-muted">
        作成: {new Date(review.created_at).toLocaleString("ja-JP")} ·
        更新: {new Date(review.updated_at).toLocaleString("ja-JP")}
      </div>
    </div>
  );
}
