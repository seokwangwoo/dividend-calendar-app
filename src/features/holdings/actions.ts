"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ACCOUNT_TYPES } from "@/lib/constants/dividends";
import { positiveQuantitySchema, nonNegativePriceSchema } from "@/lib/validators/numbers";
import { z } from "zod";
import { parseCsvHoldings } from "@/features/holdings/csv-parser";
import type { CsvParseResult, ParsedCsvRow } from "@/features/holdings/csv-parser";

const holdingFormSchema = z.object({
  stockId: z.string().uuid("Invalid stock ID"),
  quantity: positiveQuantitySchema,
  averagePurchasePrice: nonNegativePriceSchema,
  accountType: z.enum(ACCOUNT_TYPES, {
    errorMap: () => ({ message: "Invalid account type" })
  })
});

export interface CsvPreviewRow extends ParsedCsvRow {
  stockName: string;
  isDuplicate: boolean;
}

export interface CsvPreviewResult extends CsvParseResult {
  previewRows: CsvPreviewRow[];
}

async function resolveSupportedStocks(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data, error } = await supabase
    .from("stocks")
    .select("id, ticker, name, support_status");
  if (error) throw new Error(error.message);
  const map = new Map<string, { id: string; name: string }>();
  for (const row of data ?? []) {
    if (row.support_status !== "delisted" && row.ticker) {
      map.set(row.ticker, { id: row.id, name: row.name ?? row.ticker });
    }
  }
  return map;
}

async function buildExistingHoldingKeys(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("holdings")
    .select("stock_id, account_type")
    .eq("user_id", userId)
    .is("deleted_at", null);
  if (error) throw new Error(error.message);
  const keys = new Set<string>();
  for (const row of data ?? []) {
    keys.add(`${row.stock_id}:${row.account_type}`);
  }
  return keys;
}

export async function previewCsvHoldings(csvText: string): Promise<CsvPreviewResult> {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/auth/login");
  }

  const [stockMap, existingKeys] = await Promise.all([
    resolveSupportedStocks(supabase),
    buildExistingHoldingKeys(supabase, user.id)
  ]);

  const parseResult = await parseCsvHoldings(csvText, (ticker) =>
    stockMap.has(ticker)
  );

  const previewRows: CsvPreviewRow[] = parseResult.validRows.map((row) => {
    const stockId = stockMap.get(row.ticker)?.id ?? "";
    const isDuplicate = existingKeys.has(`${stockId}:${row.accountType}`);
    return {
      ...row,
      stockName: stockMap.get(row.ticker)?.name ?? row.ticker,
      isDuplicate
    };
  });

  return { ...parseResult, previewRows };
}

export async function commitCsvHoldings(
  csvText: string
): Promise<{ insertedCount: number; skippedCount: number }> {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/auth/login");
  }

  const [stockMap, existingKeys] = await Promise.all([
    resolveSupportedStocks(supabase),
    buildExistingHoldingKeys(supabase, user.id)
  ]);

  const parseResult = await parseCsvHoldings(csvText, (ticker) =>
    stockMap.has(ticker)
  );

  if (parseResult.errors.length > 0) {
    throw new Error(
      `CSVにエラーが${parseResult.errors.length}件あります。プレビューで確認してください。`
    );
  }

  const allRows = parseResult.validRows;
  const nonDuplicateRows = allRows.filter((row) => {
    const stockId = stockMap.get(row.ticker)?.id ?? "";
    return !existingKeys.has(`${stockId}:${row.accountType}`);
  });
  const skippedCount = allRows.length - nonDuplicateRows.length;

  if (nonDuplicateRows.length > 0) {
    const rows = nonDuplicateRows.map((row) => ({
      user_id: user.id,
      stock_id: stockMap.get(row.ticker)!.id,
      quantity: row.quantity,
      average_purchase_price: row.averagePurchasePrice,
      account_type: row.accountType,
      memo: row.memo ?? null
    }));

    const { error } = await supabase.from("holdings").insert(rows);
    if (error) throw new Error(error.message);
  }

  revalidatePath("/app/portfolio");
  return { insertedCount: nonDuplicateRows.length, skippedCount };
}

export async function createHolding(formData: FormData): Promise<void> {
  const supabase = await createClient();

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const parsed = holdingFormSchema.safeParse({
    stockId: formData.get("stockId"),
    quantity: formData.get("quantity"),
    averagePurchasePrice: formData.get("averagePurchasePrice"),
    accountType: formData.get("accountType")
  });

  if (!parsed.success) {
    throw new Error(parsed.error.errors[0]?.message ?? "Validation error");
  }

  const { stockId, quantity, averagePurchasePrice, accountType } = parsed.data;

  // Verify stock exists and is not delisted
  const { data: stock, error: stockError } = await supabase
    .from("stocks")
    .select("id, support_status")
    .eq("id", stockId)
    .single();

  if (stockError || !stock) {
    throw new Error("銘柄が見つかりません");
  }

  if (stock.support_status === "delisted") {
    throw new Error("この銘柄は上場廃止のため、ポートフォリオに追加できません。");
  }

  const { error } = await supabase.from("holdings").insert({
    user_id: user.id,
    stock_id: stockId,
    quantity,
    average_purchase_price: averagePurchasePrice,
    account_type: accountType
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/app/portfolio");
}

export async function updateHolding(
  holdingId: string,
  formData: FormData
): Promise<void> {
  const supabase = await createClient();

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const updateSchema = z.object({
    quantity: positiveQuantitySchema,
    averagePurchasePrice: nonNegativePriceSchema,
    accountType: z.enum(ACCOUNT_TYPES, {
      errorMap: () => ({ message: "Invalid account type" })
    })
  });

  const parsed = updateSchema.safeParse({
    quantity: formData.get("quantity"),
    averagePurchasePrice: formData.get("averagePurchasePrice"),
    accountType: formData.get("accountType")
  });

  if (!parsed.success) {
    throw new Error(parsed.error.errors[0]?.message ?? "Validation error");
  }

  const { quantity, averagePurchasePrice, accountType } = parsed.data;

  const { error } = await supabase
    .from("holdings")
    .update({
      quantity,
      average_purchase_price: averagePurchasePrice,
      account_type: accountType
    })
    .eq("id", holdingId)
    .eq("user_id", user.id)
    .is("deleted_at", null);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/app/portfolio");
  redirect("/app/portfolio");
}

export async function softDeleteHolding(holdingId: string): Promise<void> {
  const supabase = await createClient();

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const { error } = await supabase
    .from("holdings")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", holdingId)
    .eq("user_id", user.id)
    .is("deleted_at", null);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/app/portfolio");
  redirect("/app/portfolio");
}
