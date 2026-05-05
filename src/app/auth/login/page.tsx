import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";

export default function LoginPage() {
  return (
    <Card className="space-y-6 p-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">ログイン</h1>
        <p className="text-sm text-muted">配当予定と通知を確認します。</p>
      </div>
      <form className="space-y-4">
        <FormField label="メールアドレス" htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="email" />
        </FormField>
        <FormField label="パスワード" htmlFor="password">
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
          />
        </FormField>
        <Button type="submit" className="w-full">
          ログイン
        </Button>
      </form>
      <div className="flex items-center justify-between text-sm text-muted">
        <Link href="/auth/signup">アカウント作成</Link>
        <Link href="/auth/reset-password">パスワード再設定</Link>
      </div>
    </Card>
  );
}
