import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ACCOUNT_TYPE_OPTIONS } from "@/lib/constants/dividends";

export default function EditHoldingPage() {
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">保有情報編集</h1>
      <Card className="space-y-4 p-5">
        <FormField label="保有数量" htmlFor="quantity">
          <Input id="quantity" inputMode="decimal" placeholder="100" />
        </FormField>
        <FormField label="平均取得単価" htmlFor="average-price">
          <Input id="average-price" inputMode="decimal" placeholder="4300" />
        </FormField>
        <FormField label="口座区分" htmlFor="account-type">
          <Select id="account-type" options={ACCOUNT_TYPE_OPTIONS} />
        </FormField>
        <Button type="button" className="w-full">
          保存
        </Button>
      </Card>
    </div>
  );
}
