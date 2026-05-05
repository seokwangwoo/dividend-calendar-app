import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCurrencyJpy } from "@/lib/formatting/number";

export default function HomePage() {
  return (
    <div className="space-y-5">
      <header>
        <p className="text-sm text-muted">こんにちは</p>
        <h1 className="text-2xl font-semibold">ホーム</h1>
      </header>
      <Card className="space-y-2 p-5">
        <p className="text-sm text-muted">今年の予想税引後配当</p>
        <p className="text-4xl font-semibold">
          {formatCurrencyJpy(0)}
        </p>
        <div className="flex gap-2 text-sm text-muted">
          <span>税引前 {formatCurrencyJpy(0)}</span>
          <span>税額 {formatCurrencyJpy(0)}</span>
        </div>
      </Card>
      <Card className="space-y-2 p-5">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted">今月の予想入金額</p>
          <Badge variant="neutral">予想</Badge>
        </div>
        <p className="text-2xl font-semibold">{formatCurrencyJpy(0)}</p>
      </Card>
      <EmptyState
        title="保有銘柄が未登録です"
        description="ポートフォリオから最初の銘柄を追加してください。"
        actionHref="/app/portfolio/new"
        actionLabel="銘柄を追加"
      />
    </div>
  );
}
