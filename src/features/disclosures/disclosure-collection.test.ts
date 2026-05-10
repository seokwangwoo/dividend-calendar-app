import { describe, expect, it } from "vitest";
import {
  buildYanoshinListUrl,
  classifyCandidate,
  classifyDisclosureTitle,
  extractYanoshinRows,
  normalizeCandidateInput,
  normalizeYanoshinRow,
  resolveYanoshinCondition
} from "../../../supabase/functions/_shared/disclosure-collection";

describe("Yanoshin TDnet disclosure collection helpers", () => {
  it.each([
    [{ mode: "recent" }, "recent"],
    [{ mode: "today" }, "today"],
    [{ date: "2026-05-08" }, "20260508"],
    [{ condition: "20260501-20260508" }, "20260501-20260508"],
    [{ condition: "130A" }, "130A"],
    [{ condition: "130A-9433" }, "130A-9433"]
  ])("resolves condition %o to %s", (input, expected) => {
    expect(resolveYanoshinCondition(input)).toBe(expected);
  });

  it("builds json2 list URLs with hasXBRL=0 and configurable limit", () => {
    const url = buildYanoshinListUrl({ condition: "recent", limit: 50 });

    expect(url).toBe(
      "https://webapi.yanoshin.jp/webapi/tdnet/list/recent.json2?limit=50&hasXBRL=0"
    );
  });

  it("defaults to Yanoshin limit 300 and supports the json fallback format", () => {
    const url = buildYanoshinListUrl({ condition: "20260508", format: "json" });

    expect(url).toBe(
      "https://webapi.yanoshin.jp/webapi/tdnet/list/20260508.json?limit=300&hasXBRL=0"
    );
  });

  it.each([
    ["配当予想の修正に関するお知らせ", "dividend_forecast_revision", "high"],
    ["剰余金の配当に関するお知らせ", "dividend_decision", "normal"],
    ["2026年３月期 決算短信〔日本基準〕", "earnings_release", "low"],
    ["（訂正）配当予想の修正に関するお知らせ", "dividend_forecast_revision", "high"],
    ["減配に関するお知らせ", "other", "high"],
    ["新製品発売のお知らせ", "other", "low"]
  ] as const)(
    "classifies %s",
    (title, disclosureType, reviewPriority) => {
      const classification = classifyDisclosureTitle(title);

      expect(classification.disclosureType).toBe(disclosureType);
      expect(classification.reviewPriority).toBe(reviewPriority);
      expect(classification.accepted).toBe(title !== "新製品発売のお知らせ");
    }
  );

  it("normalizes Yanoshin json2 rows with alphanumeric securities codes", () => {
    const candidate = normalizeYanoshinRow({
      id: "20260508-001",
      code: "130A",
      company_name: "テスト株式会社",
      title: "期末配当予想に関するお知らせ",
      document_url: "https://example.com/tdnet.pdf",
      pubdate: "2026-05-08 15:30:00"
    });

    expect(candidate).toMatchObject({
      externalId: "20260508-001",
      ticker: "130A",
      companyName: "テスト株式会社",
      documentUrl: "https://example.com/tdnet.pdf",
      sourceType: "tdnet"
    });
    expect(candidate.publishedAt).toBe("2026-05-08T06:30:00.000Z");
  });

  it("extracts rows from both json2 and nested json fixtures", () => {
    expect(extractYanoshinRows([{ id: 1 }])).toEqual([{ id: 1 }]);
    expect(extractYanoshinRows({ items: [{ TDnet: { id: 2 } }] })).toEqual([{ id: 2 }]);
  });

  it("keeps normalized candidate input available for tests without network access", () => {
    const classified = classifyCandidate(
      normalizeCandidateInput({
        ticker: "9433",
        title: "配当予想の修正に関するお知らせ",
        publishedAt: "2026-05-08T09:00:00Z",
        documentUrl: "https://example.com/9433.pdf"
      })
    );

    expect(classified.externalId).toBe(
      "tdnet:2026-05-08T09:00:00.000Z:9433:https://example.com/9433.pdf"
    );
    expect(classified.accepted).toBe(true);
    expect(classified.disclosureType).toBe("dividend_forecast_revision");
  });
});
