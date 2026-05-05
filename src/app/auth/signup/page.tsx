import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";

export default function SignupPage() {
  return (
    <Card className="space-y-6 p-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">アカウント作成</h1>
        <p className="text-sm text-muted">税引後配当の見込みを管理します。</p>
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
            autoComplete="new-password"
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
