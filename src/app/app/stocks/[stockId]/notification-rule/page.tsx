import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { getStockById } from "@/features/stocks/queries";
import {
  disableNotificationRule,
  saveNotificationRule
} from "@/features/notifications/actions";
import {
  INVESTMENT_NEUTRAL_DISCLAIMER,
  NOTIFICATION_OPERATOR_OPTIONS,
  NOTIFICATION_RULE_BASIS_OPTIONS
} from "@/features/notifications/constants";
import { getNotificationRulesForStock } from "@/features/notifications/queries";

interface PageProps {
  params: Promise<{ stockId: string }>;
}

function formatRule(rule: Awaited<ReturnType<typeof getNotificationRulesForStock>>[number]) {
  const basis =
    rule.basis === "before_tax_yield" ? "税引前配当利回り" : "税引後配当利回り";
  const operator = rule.operator === "gte" ? "以上" : "以下";
  return `${basis} ${Number(rule.target_yield).toFixed(1)}%${operator}`;
}

export default async function NotificationRulePage({ params }: PageProps) {
  const { stockId } = await params;
  const [stock, rules] = await Promise.all([
    getStockById(stockId),
    getNotificationRulesForStock(stockId)
  ]);

  if (!stock) {
    notFound();
  }

  const activeRule = rules.find((rule) => rule.status === "active");

  return (
    <div className="space-y-5">
      <PageHeader
        title="目標利回りを設定"
        subtitle={`${stock.name} · ${stock.ticker}`}
      />

      <Card className="space-y-4 p-5">
        <form action={saveNotificationRule} className="space-y-4">
          <input type="hidden" name="stockId" value={stockId} />
          {activeRule ? (
            <input type="hidden" name="ruleId" value={activeRule.id} />
          ) : null}

          <FormField label="基準" htmlFor="basis">
            <Select
              id="basis"
              name="basis"
              defaultValue={activeRule?.basis ?? "before_tax_yield"}
              options={NOTIFICATION_RULE_BASIS_OPTIONS}
            />
          </FormField>

          <FormField label="条件" htmlFor="operator">
            <Select
              id="operator"
              name="operator"
              defaultValue={activeRule?.operator ?? "gte"}
              options={NOTIFICATION_OPERATOR_OPTIONS}
            />
          </FormField>

          <FormField label="目標利回り（%）" htmlFor="targetYield">
            <Input
              id="targetYield"
              name="targetYield"
              type="number"
              min="0.1"
              step="0.1"
              defaultValue={activeRule ? String(activeRule.target_yield) : ""}
              placeholder="3.5"
              required
            />
          </FormField>

          <label className="flex items-center gap-3 text-sm">
            <Checkbox
              name="notifyInApp"
              defaultChecked={activeRule?.notify_in_app ?? true}
            />
            アプリ内通知を受け取る
          </label>
          <label className="flex items-center gap-3 text-sm">
            <Checkbox
              name="notifyEmail"
              defaultChecked={activeRule?.notify_email ?? false}
            />
            メール通知を受け取る
          </label>

          <p className="whitespace-pre-line rounded-md bg-paper p-3 text-sm leading-6 text-muted">
            {INVESTMENT_NEUTRAL_DISCLAIMER}
          </p>

          <Button type="submit" className="w-full">
            保存
          </Button>
        </form>
      </Card>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">設定済みルール</h2>
        {rules.length === 0 ? (
          <p className="text-sm text-muted">この銘柄の通知ルールはまだありません。</p>
        ) : (
          <Card className="divide-y divide-line">
            {rules.map((rule) => (
              <div key={rule.id} className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{formatRule(rule)}</p>
                    <p className="mt-1 text-sm text-muted">
                      {[
                        rule.notify_in_app ? "アプリ内" : null,
                        rule.notify_email ? "メール" : null
                      ]
                        .filter(Boolean)
                        .join(" / ")}
                    </p>
                  </div>
                  <Badge variant={rule.status === "active" ? "success" : "neutral"}>
                    {rule.status === "active" ? "有効" : "無効"}
                  </Badge>
                </div>
                {rule.status === "active" ? (
                  <form action={disableNotificationRule}>
                    <input type="hidden" name="stockId" value={stockId} />
                    <input type="hidden" name="ruleId" value={rule.id} />
                    <Button type="submit" variant="secondary" className="h-9 w-full">
                      無効にする
                    </Button>
                  </form>
                ) : null}
              </div>
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}
