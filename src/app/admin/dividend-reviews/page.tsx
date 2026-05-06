import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { listDividendEvents } from "@/features/admin/queries";
import { approveDividendEvent, rejectDividendEvent } from "@/features/admin/actions";
import type { DividendEventFilters } from "@/features/admin/queries";

function reviewStatusBadge(status: string) {
  if (status === "approved") return <Badge variant="success">承認済</Badge>;
  if (status === "rejected") return <Badge variant="danger">却下</Badge>;
  return <Badge variant="warning">保留中</Badge>;
}

function eventStatusLabel(status: string) {
  const map: Record<string, string> = {
    estimated: "予想",
    confirmed: "確定",
    paid: "支払済",
    undecided: "未定"
  };
  return map[status] ?? status;
}

export default async function DividendReviewsPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const filters: DividendEventFilters = {
    reviewStatus: params.reviewStatus,
    ticker: params.ticker,
    paymentYear: params.paymentYear ? Number(params.paymentYear) : undefined,
    status: params.status
  };

  const events = await listDividendEvents(filters);

  return (
    <div className="space-y-5">
      <PageHeader
        title="配当イベント管理"
        actionHref="/admin/dividend-reviews/new"
        actionLabel="新規作成"
      />

      {/* Filters */}
      <form method="GET" className="flex flex-wrap gap-3 text-sm">
        <select
          name="reviewStatus"
          defaultValue={params.reviewStatus ?? ""}
          className="h-9 rounded-md border border-line bg-white px-3 text-sm"
        >
          <option value="">すべてのステータス</option>
          <option value="pending">保留中</option>
          <option value="approved">承認済</option>
          <option value="rejected">却下</option>
        </select>

        <input
          name="ticker"
          defaultValue={params.ticker ?? ""}
          placeholder="ティッカー"
          className="h-9 rounded-md border border-line bg-white px-3 text-sm"
        />

        <input
          name="paymentYear"
          defaultValue={params.paymentYear ?? ""}
          placeholder="支払年 (例: 2026)"
          className="h-9 rounded-md border border-line bg-white px-3 text-sm"
          type="number"
        />

        <select
          name="status"
          defaultValue={params.status ?? ""}
          className="h-9 rounded-md border border-line bg-white px-3 text-sm"
        >
          <option value="">すべての状態</option>
          <option value="estimated">予想</option>
          <option value="confirmed">確定</option>
          <option value="paid">支払済</option>
          <option value="undecided">未定</option>
        </select>

        <button
          type="submit"
          className="h-9 rounded-md bg-brand px-4 text-sm font-semibold text-white"
        >
          絞り込む
        </button>

        {Object.values(filters).some(Boolean) && (
          <Link
            href="/admin/dividend-reviews"
            className="flex h-9 items-center rounded-md border border-line px-4 text-sm text-muted"
          >
            クリア
          </Link>
        )}
      </form>

      {/* Table */}
      {events.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">データがありません</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full text-sm">
            <thead className="border-b border-line bg-paper">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-muted">銘柄</th>
                <th className="px-3 py-2 text-left font-medium text-muted">決算年</th>
                <th className="px-3 py-2 text-left font-medium text-muted">支払年</th>
                <th className="px-3 py-2 text-left font-medium text-muted">支払月</th>
                <th className="px-3 py-2 text-right font-medium text-muted">配当金</th>
                <th className="px-3 py-2 text-left font-medium text-muted">状態</th>
                <th className="px-3 py-2 text-left font-medium text-muted">検収</th>
                <th className="px-3 py-2 text-left font-medium text-muted">出典</th>
                <th className="px-3 py-2 text-left font-medium text-muted">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {events.map((event) => {
                const approveAction = approveDividendEvent.bind(null, event.id);

                async function rejectAction(formData: FormData) {
                  "use server";
                  const reason = String(formData.get("reason") ?? "");
                  await rejectDividendEvent(event.id, reason);
                }

                return (
                  <tr key={event.id} className="hover:bg-paper/50">
                    <td className="px-3 py-2">
                      <Link
                        href={`/admin/dividend-reviews/${event.id}`}
                        className="font-medium text-brand hover:underline"
                      >
                        {event.stocks?.ticker ?? "—"}
                      </Link>
                      <div className="text-xs text-muted">{event.stocks?.name ?? "—"}</div>
                    </td>
                    <td className="px-3 py-2">{event.fiscal_year}</td>
                    <td className="px-3 py-2">{event.payment_year ?? "—"}</td>
                    <td className="px-3 py-2">
                      {event.expected_payment_month ? `${event.expected_payment_month}月` : "未定"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {event.dividend_per_share != null
                        ? `¥${event.dividend_per_share}`
                        : "未定"}
                    </td>
                    <td className="px-3 py-2">{eventStatusLabel(event.status)}</td>
                    <td className="px-3 py-2">{reviewStatusBadge(event.review_status)}</td>
                    <td className="px-3 py-2">
                      {event.source_url ? (
                        <a
                          href={event.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-brand hover:underline"
                        >
                          {event.source_type ?? "リンク"}
                        </a>
                      ) : (
                        <span className="text-muted">{event.source_type ?? "—"}</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {event.review_status === "pending" && (
                        <div className="flex flex-col gap-1">
                          <form action={approveAction}>
                            <button
                              type="submit"
                              className="h-7 rounded bg-brand px-3 text-xs font-semibold text-white"
                            >
                              承認
                            </button>
                          </form>
                          <form action={rejectAction} className="flex gap-1">
                            <input
                              name="reason"
                              placeholder="却下理由"
                              className="h-7 w-28 rounded border border-line px-2 text-xs"
                            />
                            <button
                              type="submit"
                              className="h-7 rounded border border-red-200 px-2 text-xs text-red-700"
                            >
                              却下
                            </button>
                          </form>
                        </div>
                      )}
                      {event.review_status !== "pending" && (
                        <Link
                          href={`/admin/dividend-reviews/${event.id}`}
                          className="text-xs text-muted hover:underline"
                        >
                          詳細
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
