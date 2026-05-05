import { z } from "zod";

export const positiveQuantitySchema = z.coerce
  .number()
  .finite()
  .positive("Quantity must be greater than zero");

export const nonNegativePriceSchema = z.coerce
  .number()
  .finite()
  .nonnegative("Average purchase price must be greater than or equal to zero");

export const nonNegativeAmountSchema = z.coerce
  .number()
  .finite()
  .nonnegative("Amount must be greater than or equal to zero");

export const positiveYieldSchema = z.coerce
  .number()
  .finite()
  .positive("Yield must be greater than zero");
