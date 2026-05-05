import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { logout } from "@/features/auth/actions";

export default function SettingsPage() {
  return (
    <div className="space-y-5">
      <PageHeader title="設定" />
      <Card className="space-y-3 p-5">
        <h2 className="font-semibold">税額計算について</h2>
        <p className="text-sm leading-6 text-muted">
          税額および税引後配当額は概算です。実際の税額・入金額は証券会社の明細をご確認ください。
        </p>
      </Card>
      <form action={logout}>
        <Button type="submit" variant="secondary" className="w-full">
          ログアウト
        </Button>
      </form>
    </div>
  );
}
