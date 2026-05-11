"use client";

import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import type { StockRow } from "@/features/stocks/queries";

const DEBOUNCE_MS = 250;

export function useStockSearch(onSearch: (query: string) => Promise<StockRow[]>) {
  const [input, setInput] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(input.trim());
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [input]);

  const { data: results = [], isLoading } = useQuery({
    queryKey: ["stockSearch", debouncedQuery],
    queryFn: async () => {
      if (!debouncedQuery) return [];
      return onSearch(debouncedQuery);
    },
    enabled: debouncedQuery.length > 0,
    staleTime: 30_000
  });

  return {
    query: input,
    setQuery: setInput,
    results,
    isLoading,
    clearResults: () => setInput("")
  };
}
