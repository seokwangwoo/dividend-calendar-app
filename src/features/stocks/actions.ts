"use server";

import { searchStocks as serverSearchStocks } from "@/features/stocks/queries";
import type { StockRow } from "@/features/stocks/queries";

export async function searchStocksAction(query: string): Promise<StockRow[]> {
  return serverSearchStocks(query);
}
