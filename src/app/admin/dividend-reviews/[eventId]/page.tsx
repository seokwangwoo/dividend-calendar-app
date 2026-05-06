import { notFound } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { getDividendEventById } from "@/features/admin/queries";
import { approveDividendEvent, rejectDividendEvent } from "@/features/admin/actions";

function reviewStatusBadge(status: string) {
  if (status === "approved") return <Badge variant="success">承認済</Badge>;
  if (status === "rejected") return <Badge variant="danger">却下</Badge>;
  return <Badge variant="warning">保留中</Badge>;
}

function field(label: string, value: React.ReactNode) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm">{value ?? "—"}</dd>
    </div>
  );
}

export default async function DividendEventDetailPage({
  params
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const found = await getDividendEventById(eventId);

  if (!found) notFound();

  const event = found;
  const approveAction = approveDividendEvent.bind(null, event.id);

  async function rejectAction(formData: FormData) {
    "use server";
    const reason = String(formData.get("reason") ?? "");
    await rejectDividendEvent(event.id, reason);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <PageHeader
          title={`${event.stocks?.ticker ?? "—"} 配当イベント`}
          subtitle={event.stocks?.name ?? undefined}
        />
        {reviewStatusBadge(event.review_status)}
      </div>

      <Card className="p-5">
        <dl className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-3">
          {field("銘柄コード", event.stocks?.ticker)}
          {field("銘柄名", event.stocks?.name)}
          {field("決算年", event.fiscal_year)}
          {field("支払年", event.payment_year)}
          {field(
            "支払月",
            event.expected_payment_month ? `${event.expected_payment_month}月` : "未定"
          )}
          {field("支払日", event.expected_payment_date)}
          {field(
            "1株配当",
            event.dividend_per_share != null ? `¥${event.dividend_per_share}` : "未定"
          )}
          {field(
            "前回配当",
            event.previous_dividend_per_share != null
              ? `¥${event.previous_dividend_per_share}`
              : undefined
          )}
          {field("種別", event.event_type)}
          {field("変化種別", event.change_type)}
          {field("状態", event.status)}
          {field("出典種別", event.source_type)}
          {field(
            "出典URL",
            event.source_url ? (
              <a
                href={event.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="break-all text-brand hover:underline"
              >
                {event.source_url}
              </a>
            ) : null
          )}
          {event.rejection_reason
            ? field("却下理由", event.rejection_reason)
            : null}
          {field("登録日時", new Date(event.created_at).toLocaleString("ja-JP"))}
          {field("更新日時", new Date(event.updated_at).toLocaleString("ja-JP"))}
        </dl>
      </Card>

      {event.review_status === "pending" && (
        <Card className="space-y-4 p-5">
          <h2 className="font-semibold">検収操作</h2>
          <div className="flex flex-wrap gap-4">
            <form action={approveAction}>
              <button
                type="submit"
                className="inline-flex h-10 items-center rounded-md bg-brand px-5 text-sm font-semibold text-white"
              >
                承認する
              </button>
            </form>

            <form action={rejectAction} className="flex gap-2">
              <input
                name="reason"
                placeholder="却下理由（任意）"
                className="h-10 rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
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
    </div>
  );
}
