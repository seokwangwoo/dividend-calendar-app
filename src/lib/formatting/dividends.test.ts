import { describe, expect, it } from "vitest";
import {
  formatAccountType,
  formatDividendStatus,
  formatReviewStatus,
  formatNotificationType,
  formatChangeType
} from "./dividends";

describe("formatAccountType", () => {
  it("formats nisa", () => expect(formatAccountType("nisa")).toBe("NISA"));
  it("formats tokutei", () => expect(formatAccountType("tokutei")).toBe("特定口座"));
  it("formats general", () => expect(formatAccountType("general")).toBe("一般口座"));
});

describe("formatDividendStatus", () => {
  it("formats estimated", () => expect(formatDividendStatus("estimated")).toBe("予想"));
  it("formats confirmed", () => expect(formatDividendStatus("confirmed")).toBe("確定"));
  it("formats paid", () => expect(formatDividendStatus("paid")).toBe("支払済"));
  it("formats undecided", () => expect(formatDividendStatus("undecided")).toBe("未定"));
});

describe("formatReviewStatus", () => {
  it("formats pending", () => expect(formatReviewStatus("pending")).toBe("検収待ち"));
  it("formats approved", () => expect(formatReviewStatus("approved")).toBe("検収済"));
  it("formats rejected", () => expect(formatReviewStatus("rejected")).toBe("却下"));
});

describe("formatNotificationType", () => {
  it("formats known types", () => {
    expect(formatNotificationType("dividend_increase")).toBe("増配");
    expect(formatNotificationType("dividend_decrease")).toBe("減配");
    expect(formatNotificationType("no_dividend")).toBe("無配");
    expect(formatNotificationType("special_dividend")).toBe("特別配当");
    expect(formatNotificationType("data_update")).toBe("データ更新");
  });

  it("returns raw type for unknown", () => {
    expect(formatNotificationType("unknown")).toBe("unknown");
  });
});

describe("formatChangeType", () => {
  it("formats known types", () => {
    expect(formatChangeType("increase")).toBe("増配");
    expect(formatChangeType("decrease")).toBe("減配");
    expect(formatChangeType("no_dividend")).toBe("無配");
    expect(formatChangeType("resumed")).toBe("復配");
    expect(formatChangeType("special")).toBe("特別配当");
    expect(formatChangeType("commemorative")).toBe("記念配当");
    expect(formatChangeType("unchanged")).toBe("変化なし");
  });

  it("returns raw type for unknown", () => {
    expect(formatChangeType("unknown")).toBe("unknown");
  });
});
