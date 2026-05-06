import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/supabase";
import type { NotificationFilter } from "@/features/notifications/constants";

export type NotificationRuleRow =
  Database["public"]["Tables"]["notification_rules"]["Row"];

export type NotificationWithStock =
  Database["public"]["Tables"]["notifications"]["Row"] & {
    stocks: Pick<
      Database["public"]["Tables"]["stocks"]["Row"],
      "ticker" | "name"
    > | null;
  };

export async function getNotificationRulesForStock(
  stockId: string
): Promise<NotificationRuleRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notification_rules")
    .select("*")
    .eq("stock_id", stockId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

export async function getNotifications(
  filter: NotificationFilter
): Promise<NotificationWithStock[]> {
  const supabase = await createClient();
  let query = supabase
    .from("notifications")
    .select("*, stocks(ticker, name)")
    .eq("channel", "in_app")
    .order("created_at", { ascending: false })
    .limit(100);

  if (filter === "yield_target") {
    query = query.eq("type", "yield_target");
  } else if (filter === "data_update") {
    query = query.eq("type", "data_update");
  } else if (filter === "dividend_change") {
    query = query.in("type", [
      "dividend_increase",
      "dividend_decrease",
      "no_dividend",
      "special_dividend"
    ]);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as NotificationWithStock[];
}
