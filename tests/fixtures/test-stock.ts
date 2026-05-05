import { createAdminClient } from "../helpers/supabase";

export interface TestStock {
  id: string;
  ticker: string;
  name: string;
  support_status: "supported" | "unsupported";
  expected_annual_dividend_per_share: number | null;
  current_price: number | null;
}

let _supported: TestStock | null = null;
let _unsupported: TestStock | null = null;

export async function getTestStocks(): Promise<{
  supported: TestStock;
  unsupported: TestStock | null;
}> {
  if (_supported) return { supported: _supported, unsupported: _unsupported };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("stocks")
    .select(
      "id, ticker, name, support_status, expected_annual_dividend_per_share, current_price"
    )
    .limit(100);

  if (error) throw new Error(`getTestStocks: ${error.message}`);

  const stocks = data as TestStock[];
  const supported = stocks.find(
    (s) => s.support_status === "supported" && s.expected_annual_dividend_per_share
  );
  if (!supported) throw new Error("No supported stock with dividend data in seed");

  _supported = supported;
  _unsupported = stocks.find((s) => s.support_status === "unsupported") ?? null;

  return { supported: _supported, unsupported: _unsupported };
}
