import { describe, expect, it } from "vitest";
import {
  NOTIFICATION_RULE_BASES,
  NOTIFICATION_OPERATORS,
  NOTIFICATION_RULE_BASIS_OPTIONS,
  NOTIFICATION_OPERATOR_OPTIONS,
  INVESTMENT_NEUTRAL_DISCLAIMER,
  DISCLOSURE_SOURCE_DISCLAIMER,
  NOTIFICATION_FILTERS
} from "./constants";

describe("notification constants", () => {
  it("NOTIFICATION_RULE_BASES has correct values", () => {
    expect(NOTIFICATION_RULE_BASES).toEqual(["before_tax_yield", "after_tax_yield"]);
  });

  it("NOTIFICATION_OPERATORS has correct values", () => {
    expect(NOTIFICATION_OPERATORS).toEqual(["gte", "lte"]);
  });

  it("NOTIFICATION_RULE_BASIS_OPTIONS has correct labels", () => {
    expect(NOTIFICATION_RULE_BASIS_OPTIONS).toEqual([
      { value: "before_tax_yield", label: "税引前配当利回り" },
      { value: "after_tax_yield", label: "税引後配当利回り" }
    ]);
  });

  it("NOTIFICATION_OPERATOR_OPTIONS has correct labels", () => {
    expect(NOTIFICATION_OPERATOR_OPTIONS).toEqual([
      { value: "gte", label: "以上" },
      { value: "lte", label: "以下" }
    ]);
  });

  it("INVESTMENT_NEUTRAL_DISCLAIMER is defined", () => {
    expect(INVESTMENT_NEUTRAL_DISCLAIMER).toContain("売買を推奨するものではありません");
    expect(INVESTMENT_NEUTRAL_DISCLAIMER).toContain("投資判断はご自身で行ってください。");
  });

  it("DISCLOSURE_SOURCE_DISCLAIMER mentions TDnet and brokerage confirmation", () => {
    expect(DISCLOSURE_SOURCE_DISCLAIMER).toContain("TDnet");
    expect(DISCLOSURE_SOURCE_DISCLAIMER).toContain("証券会社");
    expect(DISCLOSURE_SOURCE_DISCLAIMER).toContain("売買を推奨するものではありません");
  });

  it("NOTIFICATION_FILTERS has correct labels", () => {
    expect(NOTIFICATION_FILTERS).toEqual([
      { value: "all", label: "すべて" },
      { value: "yield_target", label: "目標利回り" },
      { value: "dividend_change", label: "配当変更" },
      { value: "data_update", label: "データ更新" }
    ]);
  });
});
