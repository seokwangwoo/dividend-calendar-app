import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { signup } from "@/features/auth/actions";

export default async function SignupPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;

  return (
    <Card className="space-y-6 p-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">アカウント作成</h1>
        <p className="text-sm text-muted">税引後配当の見込みを管理します。</p>
      </div>
      {params.error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {params.error}
        </p>
      ) : null}
      <form action={signup} className="space-y-4">
        <FormField label="メールアドレス" htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </FormField>
        <FormField label="パスワード" htmlFor="password">
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
          />
        </FormField>
        <Button type="submit" className="w-full">
          作成
        </Button>
      </form>
      <Link href="/auth/login" className="block text-sm text-muted">
        既にアカウントをお持ちの方
      </Link>
    </Card>
  );
}
