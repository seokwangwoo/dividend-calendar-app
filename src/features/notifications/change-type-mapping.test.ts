import { describe, expect, it } from "vitest";
import {
  mapChangeTypeToNotificationType,
  buildDividendChangeNotificationPayload
} from "./change-type-mapping";

describe("mapChangeTypeToNotificationType", () => {
  it("maps increase to dividend_increase", () => {
    expect(mapChangeTypeToNotificationType("increase")).toBe("dividend_increase");
  });

  it("maps decrease to dividend_decrease", () => {
    expect(mapChangeTypeToNotificationType("decrease")).toBe("dividend_decrease");
  });

  it("maps no_dividend to no_dividend", () => {
    expect(mapChangeTypeToNotificationType("no_dividend")).toBe("no_dividend");
  });

  it("maps resumed to dividend_increase (resuming dividends is positive change)", () => {
    expect(mapChangeTypeToNotificationType("resumed")).toBe("dividend_increase");
  });

  it("maps special to special_dividend", () => {
    expect(mapChangeTypeToNotificationType("special")).toBe("special_dividend");
  });

  it("maps commemorative to special_dividend (closest existing type)", () => {
    expect(mapChangeTypeToNotificationType("commemorative")).toBe("special_dividend");
  });

  it("maps none to null (no notification needed)", () => {
    expect(mapChangeTypeToNotificationType("none")).toBeNull();
  });

  it("maps unchanged to null (no notification needed)", () => {
    expect(mapChangeTypeToNotificationType("unchanged")).toBeNull();
  });

  it("maps unknown to null (cannot classify)", () => {
    expect(mapChangeTypeToNotificationType("unknown")).toBeNull();
  });
});

describe("buildDividendChangeNotificationPayload", () => {
  it("returns shouldNotify true for notifiable change types", () => {
    const result = buildDividendChangeNotificationPayload("increase", 100, 80);
    expect(result.shouldNotify).toBe(true);
    expect(result.notificationType).toBe("dividend_increase");
    expect(result.dividendPerShare).toBe(100);
    expect(result.previousDividendPerShare).toBe(80);
    expect(result.changeType).toBe("increase");
  });

  it("returns shouldNotify false for unchanged", () => {
    const result = buildDividendChangeNotificationPayload("unchanged", 100, 100);
    expect(result.shouldNotify).toBe(false);
    expect(result.notificationType).toBeNull();
  });

  it("returns shouldNotify false for none", () => {
    const result = buildDividendChangeNotificationPayload("none", 100, 100);
    expect(result.shouldNotify).toBe(false);
    expect(result.notificationType).toBeNull();
  });

  it("returns shouldNotify false for unknown", () => {
    const result = buildDividendChangeNotificationPayload("unknown", null, null);
    expect(result.shouldNotify).toBe(false);
    expect(result.notificationType).toBeNull();
  });

  it("handles null dividend amounts", () => {
    const result = buildDividendChangeNotificationPayload("no_dividend", null, 50);
    expect(result.shouldNotify).toBe(true);
    expect(result.notificationType).toBe("no_dividend");
    expect(result.dividendPerShare).toBeNull();
    expect(result.previousDividendPerShare).toBe(50);
  });

  it("maps commemorative to special_dividend type with component amount", () => {
    const result = buildDividendChangeNotificationPayload("commemorative", 20, 15);
    expect(result.shouldNotify).toBe(true);
    expect(result.notificationType).toBe("special_dividend");
    expect(result.changeType).toBe("commemorative");
  });

  it("maps special to special_dividend type", () => {
    const result = buildDividendChangeNotificationPayload("special", 30, null);
    expect(result.shouldNotify).toBe(true);
    expect(result.notificationType).toBe("special_dividend");
  });

  it("maps decrease to dividend_decrease", () => {
    const result = buildDividendChangeNotificationPayload("decrease", 40, 60);
    expect(result.shouldNotify).toBe(true);
    expect(result.notificationType).toBe("dividend_decrease");
    expect(result.dividendPerShare).toBe(40);
    expect(result.previousDividendPerShare).toBe(60);
  });
});
