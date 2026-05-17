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

export type ActiveYieldTarget = {
  ruleId: string;
  stockId: string;
  stockName: string;
  ticker: string;
  operator: "gte" | "lte";
  targetYield: number;
  expectedDividendYield: number | null;
};

type ActiveYieldTargetRow = Pick<
  NotificationRuleRow,
  "id" | "stock_id" | "operator" | "target_yield"
> & {
  stocks:
    | Pick<
        Database["public"]["Tables"]["stocks"]["Row"],
        "id" | "name" | "ticker" | "expected_dividend_yield"
      >
    | Pick<
        Database["public"]["Tables"]["stocks"]["Row"],
        "id" | "name" | "ticker" | "expected_dividend_yield"
      >[]
    | null;
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

export async function getActiveYieldTargets(): Promise<ActiveYieldTarget[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notification_rules")
    .select(
      "id, stock_id, operator, target_yield, stocks(id, name, ticker, expected_dividend_yield)"
    )
    .eq("status", "active")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as ActiveYieldTargetRow[]).flatMap((row) => {
    const stock = Array.isArray(row.stocks) ? row.stocks[0] : row.stocks;

    if (!stock) {
      return [];
    }

    return {
      ruleId: row.id,
      stockId: stock.id,
      stockName: stock.name,
      ticker: stock.ticker,
      operator: row.operator,
      targetYield: row.target_yield,
      expectedDividendYield: stock.expected_dividend_yield
    };
  });
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
