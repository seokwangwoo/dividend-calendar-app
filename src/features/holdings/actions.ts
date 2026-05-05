"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ACCOUNT_TYPES } from "@/lib/constants/dividends";
import { positiveQuantitySchema, nonNegativePriceSchema } from "@/lib/validators/numbers";
import { z } from "zod";

const holdingFormSchema = z.object({
  stockId: z.string().uuid("Invalid stock ID"),
  quantity: positiveQuantitySchema,
  averagePurchasePrice: nonNegativePriceSchema,
  accountType: z.enum(ACCOUNT_TYPES, {
    errorMap: () => ({ message: "Invalid account type" })
  })
});

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

  // Verify stock is supported
  const { data: stock, error: stockError } = await supabase
    .from("stocks")
    .select("id, support_status")
    .eq("id", stockId)
    .single();

  if (stockError || !stock) {
    throw new Error("Stock not found");
  }

  if (stock.support_status !== "supported") {
    throw new Error("This stock is not supported in the current MVP.");
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
