import { describe, expect, it } from "vitest";
import {
  positiveQuantitySchema,
  nonNegativePriceSchema,
  nonNegativeAmountSchema,
  positiveYieldSchema
} from "./numbers";

describe("validators/numbers", () => {
  describe("positiveQuantitySchema", () => {
    it("accepts positive number", () => {
      expect(positiveQuantitySchema.parse(10)).toBe(10);
    });

    it("accepts positive string number", () => {
      expect(positiveQuantitySchema.parse("10")).toBe(10);
    });

    it("rejects zero", () => {
      expect(() => positiveQuantitySchema.parse(0)).toThrow("Quantity must be greater than zero");
    });

    it("rejects negative", () => {
      expect(() => positiveQuantitySchema.parse(-1)).toThrow("Quantity must be greater than zero");
    });

    it("rejects NaN string", () => {
      expect(() => positiveQuantitySchema.parse("abc")).toThrow();
    });
  });

  describe("nonNegativePriceSchema", () => {
    it("accepts zero", () => {
      expect(nonNegativePriceSchema.parse(0)).toBe(0);
    });

    it("accepts positive", () => {
      expect(nonNegativePriceSchema.parse(100)).toBe(100);
    });

    it("accepts string number", () => {
      expect(nonNegativePriceSchema.parse("100")).toBe(100);
    });

    it("rejects negative", () => {
      expect(() => nonNegativePriceSchema.parse(-1)).toThrow("Average purchase price must be greater than or equal to zero");
    });
  });

  describe("nonNegativeAmountSchema", () => {
    it("accepts zero", () => {
      expect(nonNegativeAmountSchema.parse(0)).toBe(0);
    });

    it("accepts positive", () => {
      expect(nonNegativeAmountSchema.parse(1000)).toBe(1000);
    });

    it("rejects negative", () => {
      expect(() => nonNegativeAmountSchema.parse(-1)).toThrow("Amount must be greater than or equal to zero");
    });
  });

  describe("positiveYieldSchema", () => {
    it("accepts positive", () => {
      expect(positiveYieldSchema.parse(1.5)).toBe(1.5);
    });

    it("accepts string number", () => {
      expect(positiveYieldSchema.parse("2.5")).toBe(2.5);
    });

    it("rejects zero", () => {
      expect(() => positiveYieldSchema.parse(0)).toThrow("Yield must be greater than zero");
    });

    it("rejects negative", () => {
      expect(() => positiveYieldSchema.parse(-0.5)).toThrow("Yield must be greater than zero");
    });
  });
});
