"use server";

import { revalidatePath } from "next/cache";
import { requireAdminUser } from "./auth";
import { createClient } from "@/lib/supabase/server";
import { validateMonth, validateDividendAmount, validatePaymentYear, validateFiscalMonth } from "./validation";
import type { Database } from "@/types/supabase";

const USER_FACING_PATHS = ["/app/home", "/app/portfolio", "/app/calendar"];

export type CreateDividendEventInput = {
  stockId: string;
  fiscalYear: number;
  expectedPaymentYear: number;
  estimatedPaymentMonth?: number | null;
  fiscalMonth?: number | null;
  eventType: Database["public"]["Enums"]["dividend_event_type"];
  status?: "estimated" | "confirmed" | "paid" | "undecided";
  changeType?: Database["public"]["Enums"]["dividend_change_type"] | null;
  dividendPerShare?: number | null;
  previousDividendPerShare?: number | null;
  sourceType?: string | null;
  sourceUrl?: string | null;
};

export async function createDividendEvent(input: CreateDividendEventInput): Promise<void> {
  await requireAdminUser();

  const yearError = validatePaymentYear(input.expectedPaymentYear);
  if (yearError) throw new Error(yearError);

  if (input.estimatedPaymentMonth != null) {
    const monthError = validateMonth(input.estimatedPaymentMonth);
    if (monthError) throw new Error(monthError);
  }

  if (input.fiscalMonth != null) {
    const fiscalMonthError = validateFiscalMonth(input.fiscalMonth);
    if (fiscalMonthError) throw new Error(fiscalMonthError);
  }

  if (input.dividendPerShare != null) {
    const amountError = validateDividendAmount(input.dividendPerShare);
    if (amountError) throw new Error(amountError);
  }

  const supabase = await createClient();

  const { error } = await supabase.from("dividend_events").insert({
    stock_id: input.stockId,
    fiscal_year: input.fiscalYear,
    expected_payment_year: input.expectedPaymentYear,
    expected_payment_month: input.estimatedPaymentMonth ?? null,
    fiscal_month: input.fiscalMonth ?? null,
    event_type: input.eventType,
    status: input.status ?? "estimated",
    change_type: input.changeType ?? null,
    dividend_per_share: input.dividendPerShare ?? null,
    previous_dividend_per_share: input.previousDividendPerShare ?? null,
    source_type: input.sourceType ?? null,
    source_url: input.sourceUrl ?? null,
    review_status: "pending"
  });

  if (error) throw new Error(error.message);

  revalidatePath("/admin/dividend-reviews");
}

export async function approveDividendEvent(id: string): Promise<void> {
  await requireAdminUser();
  const supabase = await createClient();

  const { error } = await supabase
    .from("dividend_events")
    .update({ review_status: "approved" })
    .eq("id", id);

  if (error) throw new Error(error.message);

  revalidatePath("/admin/dividend-reviews");
  USER_FACING_PATHS.forEach((p) => revalidatePath(p));
}

export async function rejectDividendEvent(id: string, reason: string): Promise<void> {
  await requireAdminUser();
  const supabase = await createClient();

  const { error } = await supabase
    .from("dividend_events")
    .update({ review_status: "rejected", rejection_reason: reason.trim() || null })
    .eq("id", id);

  if (error) throw new Error(error.message);

  revalidatePath("/admin/dividend-reviews");
  USER_FACING_PATHS.forEach((p) => revalidatePath(p));
}
