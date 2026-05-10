import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { listAllStocks } from "@/features/admin/queries";
import { createDividendEvent } from "@/features/admin/actions";
import type { Database } from "@/types/supabase";

export default async function NewDividendEventPage() {
  const stocks = await listAllStocks();

  async function createAction(formData: FormData) {
    "use server";

    const paymentMonthRaw = formData.get("estimatedPaymentMonth");
    const dividendRaw = formData.get("dividendPerShare");
    const prevDividendRaw = formData.get("previousDividendPerShare");

    await createDividendEvent({
      stockId: String(formData.get("stockId") ?? ""),
      fiscalYear: Number(formData.get("fiscalYear")),
      paymentYear: Number(formData.get("paymentYear")),
      estimatedPaymentMonth:
        paymentMonthRaw && String(paymentMonthRaw).trim() !== ""
          ? Number(paymentMonthRaw)
          : null,
      paymentStartDate:
        formData.get("paymentStartDate")
          ? String(formData.get("paymentStartDate"))
          : null,
      eventType: String(
        formData.get("eventType") ?? "year_end"
      ) as Database["public"]["Enums"]["dividend_event_type"],
      status: String(
        formData.get("status") ?? "estimated"
      ) as "estimated" | "confirmed" | "paid" | "undecided",
      changeType: formData.get("changeType")
        ? (String(formData.get("changeType")) as Database["public"]["Enums"]["dividend_change_type"])
        : null,
      dividendPerShare:
        dividendRaw && String(dividendRaw).trim() !== ""
          ? Number(dividendRaw)
          : null,
      previousDividendPerShare:
        prevDividendRaw && String(prevDividendRaw).trim() !== ""
          ? Number(prevDividendRaw)
          : null,
      sourceType: formData.get("sourceType")
        ? String(formData.get("sourceType"))
        : null,
      sourceUrl: formData.get("sourceUrl")
        ? String(formData.get("sourceUrl"))
        : null
    });

    redirect("/admin/dividend-reviews");
  }

  const currentYear = new Date().getFullYear();

  return (
    <div className="space-y-5">
      <PageHeader title="配当イベント新規作成" />

      <form action={createAction} className="max-w-lg space-y-4">
        <FormField label="銘柄" htmlFor="stockId">
          <select
            id="stockId"
            name="stockId"
            required
            className="h-11 w-full rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
          >
            <option value="">銘柄を選択...</option>
            {stocks.map((s) => (
              <option key={s.id} value={s.id}>
                {s.ticker} — {s.name}
              </option>
            ))}
          </select>
        </FormField>

        <div className="grid grid-cols-2 gap-4">
          <FormField label="決算年" htmlFor="fiscalYear">
            <Input
              id="fiscalYear"
              name="fiscalYear"
              type="number"
              required
              defaultValue={currentYear}
              min={2000}
              max={2100}
            />
          </FormField>

          <FormField label="支払年" htmlFor="paymentYear">
            <Input
              id="paymentYear"
              name="paymentYear"
              type="number"
              required
              defaultValue={currentYear}
              min={2000}
              max={2100}
            />
          </FormField>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField
            label="支払月（任意）"
            htmlFor="estimatedPaymentMonth"
            description="不明の場合は空欄"
          >
            <Input
              id="estimatedPaymentMonth"
              name="estimatedPaymentMonth"
              type="number"
              min={1}
              max={12}
              placeholder="1〜12"
            />
          </FormField>

          <FormField label="支払開始日（任意）" htmlFor="paymentStartDate">
            <Input
              id="paymentStartDate"
              name="paymentStartDate"
              type="date"
            />
          </FormField>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField label="種別" htmlFor="eventType">
            <select
              id="eventType"
              name="eventType"
              className="h-11 w-full rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
            >
              <option value="year_end">期末</option>
              <option value="interim">中間</option>
              <option value="annual_total">年間合計</option>
              <option value="special">特別</option>
              <option value="commemorative">記念</option>
              <option value="other">その他</option>
            </select>
          </FormField>

          <FormField label="状態" htmlFor="status">
            <select
              id="status"
              name="status"
              className="h-11 w-full rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
            >
              <option value="estimated">予想</option>
              <option value="confirmed">確定</option>
              <option value="paid">支払済</option>
              <option value="undecided">未定</option>
            </select>
          </FormField>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField label="1株配当（円）" htmlFor="dividendPerShare" description="未定の場合は空欄">
            <Input
              id="dividendPerShare"
              name="dividendPerShare"
              type="number"
              step="0.01"
              min={0}
              placeholder="例: 50"
            />
          </FormField>

          <FormField label="前回配当（円）（任意）" htmlFor="previousDividendPerShare">
            <Input
              id="previousDividendPerShare"
              name="previousDividendPerShare"
              type="number"
              step="0.01"
              min={0}
              placeholder="例: 45"
            />
          </FormField>
        </div>

        <FormField label="変化種別（任意）" htmlFor="changeType">
          <select
            id="changeType"
            name="changeType"
            className="h-11 w-full rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
          >
            <option value="">自動判定</option>
            <option value="increase">増額</option>
            <option value="decrease">減額</option>
            <option value="unchanged">変化なし</option>
            <option value="unknown">不明</option>
            <option value="no_dividend">無配</option>
            <option value="resumed">復配</option>
            <option value="special">特別</option>
            <option value="commemorative">記念</option>
          </select>
        </FormField>

        <div className="grid grid-cols-2 gap-4">
          <FormField label="出典種別（任意）" htmlFor="sourceType">
            <Input
              id="sourceType"
              name="sourceType"
              placeholder="例: tdnet, manual"
            />
          </FormField>

          <FormField label="出典URL（任意）" htmlFor="sourceUrl">
            <Input
              id="sourceUrl"
              name="sourceUrl"
              type="url"
              placeholder="https://"
            />
          </FormField>
        </div>

        <div className="flex gap-3 pt-2">
          <Button type="submit">保存（保留中として登録）</Button>
          <Link
            href="/admin/dividend-reviews"
            className="inline-flex h-11 items-center rounded-md border border-line px-4 text-sm font-semibold text-ink"
          >
            キャンセル
          </Link>
        </div>
      </form>
    </div>
  );
}
