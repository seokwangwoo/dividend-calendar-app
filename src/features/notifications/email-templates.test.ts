import { describe, expect, it } from "vitest";
import {
  renderYieldTargetEmail,
  renderDividendChangeEmail,
  renderDataUpdateEmail
} from "@/features/notifications/email-templates";

const BANNED_STRINGS = [
  "買い推奨",
  "売り推奨",
  "買いシグナル",
  "売りシグナル",
  "今すぐ買う",
  "今すぐ売る",
  "確実に儲かる",
  "安全に稼げる"
];

describe("email templates", () => {
  describe("renderYieldTargetEmail", () => {
    it("includes stock name, ticker, evaluated yield, and disclaimer", () => {
      const result = renderYieldTargetEmail({
        stockName: "KDDI",
        ticker: "9433",
        evaluatedYield: 3.7,
        targetYield: 3.5,
        operator: "gte",
        basis: "before_tax_yield"
      });

      expect(result.subject).toContain("KDDI");
      expect(result.text).toContain("KDDI（9433）");
      expect(result.text).toContain("3.7%");
      expect(result.text).toContain("これは売買を推奨するものではありません");
    });

    it("does not contain any banned strings", () => {
      const result = renderYieldTargetEmail({
        stockName: "KDDI",
        ticker: "9433",
        evaluatedYield: 3.7,
        targetYield: 3.5,
        operator: "gte",
        basis: "after_tax_yield"
      });

      for (const banned of BANNED_STRINGS) {
        expect(result.text).not.toContain(banned);
        expect(result.subject).not.toContain(banned);
      }
    });
  });

  describe("renderDividendChangeEmail", () => {
    it("includes stock name, change type, and disclaimer", () => {
      const result = renderDividendChangeEmail({
        stockName: "KDDI",
        ticker: "9433",
        changeType: "increase",
        previousDps: 100,
        currentDps: 120,
        sourceUrl: "https://example.com/source"
      });

      expect(result.subject).toContain("KDDI");
      expect(result.text).toContain("増配");
      expect(result.text).toContain("100円");
      expect(result.text).toContain("120円");
      expect(result.text).toContain("https://example.com/source");
      expect(result.text).toContain("これは売買を推奨するものではありません");
    });

    it("does not contain any banned strings", () => {
      const result = renderDividendChangeEmail({
        stockName: "JT",
        ticker: "2914",
        changeType: "decrease",
        previousDps: 150,
        currentDps: 140
      });

      for (const banned of BANNED_STRINGS) {
        expect(result.text).not.toContain(banned);
        expect(result.subject).not.toContain(banned);
      }
    });
  });

  describe("renderDataUpdateEmail", () => {
    it("does not include yield or price evaluation content", () => {
      const result = renderDataUpdateEmail({
        stockName: "KDDI",
        ticker: "9433",
        updateSummary: "決算データが更新されました。"
      });

      expect(result.text).toContain("データが更新されました");
      expect(result.text).not.toContain("利回り");
      expect(result.text).not.toContain("価格");
      expect(result.text).toContain("これは売買を推奨するものではありません");
    });

    it("does not contain any banned strings", () => {
      const result = renderDataUpdateEmail({
        stockName: "KDDI",
        ticker: "9433",
        updateSummary: "更新"
      });

      for (const banned of BANNED_STRINGS) {
        expect(result.text).not.toContain(banned);
      }
    });
  });
});
