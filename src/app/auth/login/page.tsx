import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { login } from "@/features/auth/actions";

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const params = await searchParams;

  return (
    <Card className="space-y-6 p-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">ログイン</h1>
        <p className="text-sm text-muted">配当予定と通知を確認します。</p>
      </div>
      {params.message ? (
        <p className="rounded-md border border-brand/20 bg-brand/10 px-3 py-2 text-sm text-brand">
          {params.message}
        </p>
      ) : null}
      {params.error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {params.error}
        </p>
      ) : null}
      <form action={login} className="space-y-4">
        <FormField label="メールアドレス" htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </FormField>
        <FormField label="パスワード" htmlFor="password">
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
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
