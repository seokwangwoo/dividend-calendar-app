"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { AMOUNT_BASIS } from "@/lib/constants/dividends";
import { createClient } from "@/lib/supabase/server";

const settingsSchema = z.object({
  emailNotificationEnabled: z.boolean(),
  inAppNotificationEnabled: z.boolean(),
  defaultAmountBasis: z.enum(AMOUNT_BASIS),
  monthlyDividendGoalAmount: z.preprocess(
    (value) => (value === "" || value == null ? null : value),
    z.coerce.number().min(0).nullable()
  )
});

export async function updateSettings(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const parsed = settingsSchema.safeParse({
    emailNotificationEnabled: formData.get("emailNotificationEnabled") === "on",
    inAppNotificationEnabled: formData.get("inAppNotificationEnabled") === "on",
    defaultAmountBasis: formData.get("defaultAmountBasis"),
    monthlyDividendGoalAmount: formData.get("monthlyDividendGoalAmount")
  });

  if (!parsed.success) {
    throw new Error(parsed.error.errors[0]?.message ?? "Validation error");
  }

  const { error } = await supabase
    .from("user_settings")
    .update({
      email_notification_enabled: parsed.data.emailNotificationEnabled,
      in_app_notification_enabled: parsed.data.inAppNotificationEnabled,
      default_amount_basis: parsed.data.defaultAmountBasis,
      monthly_dividend_goal_amount: parsed.data.monthlyDividendGoalAmount,
      currency: "JPY"
    })
    .eq("user_id", user.id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/app/settings");
}
