import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";

export default function ResetPasswordPage() {
  return (
    <Card className="space-y-6 p-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">パスワード再設定</h1>
        <p className="text-sm text-muted">再設定用リンクをメールで送信します。</p>
      </div>
      <form className="space-y-4">
        <FormField label="メールアドレス" htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="email" />
        </FormField>
        <Button type="submit" className="w-full">
          送信
        </Button>
      </form>
      <Link href="/auth/login" className="block text-sm text-muted">
        ログインへ戻る
      </Link>
    </Card>
  );
}
