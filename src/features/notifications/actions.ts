"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  NOTIFICATION_OPERATORS,
  NOTIFICATION_RULE_BASES
} from "@/features/notifications/constants";

const ruleSchema = z
  .object({
    stockId: z.string().uuid(),
    ruleId: z.string().uuid().optional(),
    basis: z.enum(NOTIFICATION_RULE_BASES),
    operator: z.enum(NOTIFICATION_OPERATORS),
    targetYield: z.coerce.number().positive("Target yield must be greater than zero"),
    notifyInApp: z.boolean(),
    notifyEmail: z.boolean()
  })
  .refine((value) => value.notifyInApp || value.notifyEmail, {
    message: "At least one notification channel must be enabled"
  });

export async function saveNotificationRule(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const parsed = ruleSchema.safeParse({
    stockId: formData.get("stockId"),
    ruleId: formData.get("ruleId") || undefined,
    basis: formData.get("basis"),
    operator: formData.get("operator"),
    targetYield: formData.get("targetYield"),
    notifyInApp: formData.get("notifyInApp") === "on",
    notifyEmail: formData.get("notifyEmail") === "on"
  });

  if (!parsed.success) {
    throw new Error(parsed.error.errors[0]?.message ?? "Validation error");
  }

  const {
    stockId,
    ruleId,
    basis,
    operator,
    targetYield,
    notifyInApp,
    notifyEmail
  } = parsed.data;

  const payload = {
    basis,
    operator,
    target_yield: targetYield,
    notify_in_app: notifyInApp,
    notify_email: notifyEmail,
    status: "active" as const
  };

  const query = ruleId
    ? supabase
        .from("notification_rules")
        .update(payload)
        .eq("id", ruleId)
        .eq("user_id", user.id)
        .eq("stock_id", stockId)
    : supabase.from("notification_rules").insert({
        ...payload,
        stock_id: stockId,
        user_id: user.id
      });

  const { error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath(`/app/stocks/${stockId}/notification-rule`);
}

export async function disableNotificationRule(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const ruleId = z.string().uuid().parse(formData.get("ruleId"));
  const stockId = z.string().uuid().parse(formData.get("stockId"));

  const { error } = await supabase
    .from("notification_rules")
    .update({ status: "disabled" })
    .eq("id", ruleId)
    .eq("user_id", user.id)
    .eq("stock_id", stockId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath(`/app/stocks/${stockId}/notification-rule`);
}

export async function markNotificationRead(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const notificationId = z.string().uuid().parse(formData.get("notificationId"));

  const { error } = await supabase
    .from("notifications")
    .update({ status: "read", read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .eq("user_id", user.id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/app/notifications");
}

export async function markAllNotificationsRead(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const { error } = await supabase
    .from("notifications")
    .update({ status: "read", read_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .eq("status", "unread");

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/app/notifications");
}
