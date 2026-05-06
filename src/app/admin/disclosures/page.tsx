import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

export default function DisclosuresPage() {
  return (
    <div className="space-y-5">
      <PageHeader title="公示データ" />
      <Card className="space-y-3 p-5">
        <h2 className="font-semibold">収集フロー</h2>
        <p className="text-sm leading-6 text-muted">
          `collect-disclosures` は配当関連キーワードを含む候補を `disclosures`
          に保存し、解析用の `jobs` を作成します。重複は `external_id`
          で抑止します。
        </p>
      </Card>
    </div>
  );
}
