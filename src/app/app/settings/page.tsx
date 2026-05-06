import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { logout } from "@/features/auth/actions";
import { updateSettings } from "@/features/settings/actions";
import { getCurrentUserSettings } from "@/features/settings/queries";
import { AMOUNT_BASIS_OPTIONS } from "@/lib/constants/dividends";

export default async function SettingsPage() {
  const { email, settings } = await getCurrentUserSettings();

  return (
    <div className="space-y-5">
      <PageHeader title="設定" />

      <Card className="space-y-4 p-5">
        <div>
          <p className="text-sm text-muted">アカウント</p>
          <p className="mt-1 font-medium">{email}</p>
        </div>
        <form action={updateSettings} className="space-y-4">
          <label className="flex items-center gap-3 text-sm">
            <Checkbox
              name="emailNotificationEnabled"
              defaultChecked={settings.email_notification_enabled}
            />
            メール通知を有効にする
          </label>
          <label className="flex items-center gap-3 text-sm">
            <Checkbox
              name="inAppNotificationEnabled"
              defaultChecked={settings.in_app_notification_enabled}
            />
            アプリ内通知を有効にする
          </label>

          <FormField label="金額表示" htmlFor="defaultAmountBasis">
            <Select
              id="defaultAmountBasis"
              name="defaultAmountBasis"
              defaultValue={settings.default_amount_basis}
              options={AMOUNT_BASIS_OPTIONS}
            />
          </FormField>

          <FormField label="通貨" htmlFor="currency">
            <Input id="currency" value="JPY" readOnly />
          </FormField>

          <FormField label="年間税引後配当目標額" htmlFor="annualDividendGoalAmount">
            <Input
              id="annualDividendGoalAmount"
              name="annualDividendGoalAmount"
              type="number"
              min="0"
              step="1"
              defaultValue={settings.annual_dividend_goal_amount ?? ""}
              placeholder="600000"
            />
          </FormField>

          <Button type="submit" className="w-full">
            保存
          </Button>
        </form>
      </Card>

      <Card className="space-y-3 p-5">
        <h2 className="font-semibold">税額計算について</h2>
        <p className="text-sm leading-6 text-muted">
          税額および税引後配当額は概算です。実際の税額・入金額は証券会社の明細をご確認ください。
        </p>
      </Card>

      <Card className="space-y-2 p-5">
        <h2 className="font-semibold">アカウント削除</h2>
        <Button type="button" variant="secondary" disabled className="w-full">
          近日公開予定
        </Button>
      </Card>

      <form action={logout}>
        <Button type="submit" variant="secondary" className="w-full">
          ログアウト
        </Button>
      </form>
    </div>
  );
}
