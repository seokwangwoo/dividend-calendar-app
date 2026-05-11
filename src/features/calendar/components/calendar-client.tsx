"use client";

import { useState, useCallback, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatCurrencyJpy } from "@/lib/formatting/number";
import { formatYearMonth } from "@/lib/formatting/date";
import {
  formatAccountType,
  formatDividendStatus
} from "@/lib/formatting/dividends";
import {
  AMOUNT_BASIS_OPTIONS,
  CALENDAR_ACCOUNT_FILTERS
} from "@/lib/constants/dividends";
import {
  CALENDAR_BASIS_OPTIONS,
  getCalendarBasisLabel
} from "@/features/calendar/basis";
import type { CalendarMonth, MonthDetail } from "@/features/dividends/types";
import { createClient } from "@/lib/supabase/client";

const ACCOUNT_FILTER_LABELS: Record<string, string> = {
  all: "全口座",
  nisa: "NISA",
  tokutei: "特定口座",
  general: "一般口座"
};

import { EmptyState } from "@/components/ui/empty-state";

interface CalendarClientProps {
  initialYear: number;
  initialCalendar: CalendarMonth[];
  initialBasis: string;
  initialAccountType: string;
  initialCalendarBasis: string;
  initialHoldingCount: number;
}

export function CalendarClient({
  initialYear,
  initialCalendar,
  initialBasis,
  initialAccountType,
  initialCalendarBasis,
  initialHoldingCount
}: CalendarClientProps) {
  const [year, setYear] = useState(initialYear);
  const [basis, setBasis] = useState(initialBasis);
  const [accountType, setAccountType] = useState(initialAccountType);
  const [calendarBasis, setCalendarBasis] = useState(initialCalendarBasis);
  const [calendar, setCalendar] = useState<CalendarMonth[]>(initialCalendar);
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [monthDetail, setMonthDetail] = useState<MonthDetail | null>(null);
  const [loadingCalendar, setLoadingCalendar] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  // Generation counter to discard stale responses when requests are fired rapidly
  const calendarGenRef = useRef(0);

  const supabase = createClient();

  const fetchCalendar = useCallback(
    async (
      newYear: number,
      newBasis: string,
      newAccountType: string,
      newCalendarBasis: string
    ) => {
      const gen = ++calendarGenRef.current;
      setLoadingCalendar(true);
      try {
        const { data, error } = await supabase.rpc("get_dividend_calendar", {
          p_year: newYear,
          p_amount_basis: newBasis,
          p_account_type: newAccountType,
          p_calendar_basis: newCalendarBasis
        });
        // Discard result if a newer request has already been issued
        if (gen !== calendarGenRef.current) return;
        if (error) throw error;
        setCalendar(
          (data ?? []).map((row: { month: number; amount: number | null; event_count: number }) => ({
            month: row.month,
            amount: row.amount ?? null,
            eventCount: Number(row.event_count)
          }))
        );
        setSelectedMonth(null);
        setMonthDetail(null);
      } finally {
        if (gen === calendarGenRef.current) {
          setLoadingCalendar(false);
        }
      }
    },
    [supabase]
  );

  const fetchMonthDetail = useCallback(
    async (month: number) => {
      setLoadingDetail(true);
      try {
        const { data, error } = await supabase.rpc(
          "get_dividend_month_detail",
          {
            p_year: year,
            p_month: month,
            p_amount_basis: basis,
            p_account_type: accountType,
            p_calendar_basis: calendarBasis
          }
        );
        if (error) throw error;
        setMonthDetail(data as unknown as MonthDetail);
      } finally {
        setLoadingDetail(false);
      }
    },
    [supabase, year, basis, accountType, calendarBasis]
  );

  function handleYearChange(delta: number) {
    const newYear = year + delta;
    setYear(newYear);
    fetchCalendar(newYear, basis, accountType, calendarBasis);
  }

  function handleBasisChange(newBasis: string) {
    setBasis(newBasis);
    fetchCalendar(year, newBasis, accountType, calendarBasis);
  }

  function handleAccountTypeChange(newAccountType: string) {
    setAccountType(newAccountType);
    fetchCalendar(year, basis, newAccountType, calendarBasis);
  }

  function handleCalendarBasisChange(newCalendarBasis: string) {
    setCalendarBasis(newCalendarBasis);
    fetchCalendar(year, basis, accountType, newCalendarBasis);
  }

  function handleMonthClick(month: number) {
    if (selectedMonth === month) {
      setSelectedMonth(null);
      setMonthDetail(null);
      return;
    }
    setSelectedMonth(month);
    fetchMonthDetail(month);
  }

  return (
    <div className="space-y-5">
      {/* Year selector */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => handleYearChange(-1)}
          className="flex h-9 w-9 items-center justify-center rounded-md border border-line text-muted hover:bg-paper"
        >
          ‹
        </button>
        <span className="text-lg font-semibold">{year}年</span>
        <button
          type="button"
          onClick={() => handleYearChange(1)}
          className="flex h-9 w-9 items-center justify-center rounded-md border border-line text-muted hover:bg-paper"
        >
          ›
        </button>
      </div>

      {/* Basis selector */}
      <div className="flex rounded-lg border border-line bg-white p-1">
        {AMOUNT_BASIS_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => handleBasisChange(option.value)}
            className={`h-9 flex-1 rounded-md text-sm font-medium ${
              basis === option.value
                ? "bg-paper text-ink"
                : "text-muted"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {/* Account type filter */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {CALENDAR_ACCOUNT_FILTERS.map((filter) => (
          <button
            key={filter}
            type="button"
            onClick={() => handleAccountTypeChange(filter)}
            className={`shrink-0 rounded-full border px-3 py-1 text-sm font-medium transition-colors ${
              accountType === filter
                ? "border-brand bg-brand/10 text-brand"
                : "border-line text-muted hover:bg-paper"
            }`}
          >
            {ACCOUNT_FILTER_LABELS[filter]}
          </button>
        ))}
      </div>

      {/* Calendar basis selector */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {CALENDAR_BASIS_OPTIONS.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => handleCalendarBasisChange(option)}
            className={`shrink-0 rounded-full border px-3 py-1 text-sm font-medium transition-colors ${
              calendarBasis === option
                ? "border-brand bg-brand/10 text-brand"
                : "border-line text-muted hover:bg-paper"
            }`}
          >
            {getCalendarBasisLabel(option)}
          </button>
        ))}
      </div>

      {/* Monthly summary list */}
      <Card className={`divide-y divide-line ${loadingCalendar ? "opacity-60" : ""}`}>
        {!loadingCalendar && calendar.every((row) => row.eventCount === 0) ? (
          initialHoldingCount === 0 ? (
            <EmptyState
              title="保有銘柄がありません"
              description="カレンダーに配当予定を表示するには、まず銘柄を追加してください。"
              actionHref="/app/portfolio/new"
              actionLabel="銘柄を追加"
            />
          ) : (
            <EmptyState
              title="該当する配当予定はありません"
              description={`${year}年の選択条件に一致する配当イベントがありません。フィルターや口座区分を変更してみてください。`}
            />
          )
        ) : (
          calendar.map((row) => (
          <button
            key={row.month}
            type="button"
            onClick={() => handleMonthClick(row.month)}
            className={`flex w-full items-center justify-between p-4 text-left transition-colors hover:bg-paper ${
              selectedMonth === row.month ? "bg-paper" : ""
            }`}
          >
            <div>
              <p className="font-medium">{formatYearMonth(year, row.month)}</p>
              <p className="text-sm text-muted">
                入金予定 {row.eventCount}件
              </p>
            </div>
            <div className="text-right">
              <p className="font-semibold">
                {row.amount !== null ? formatCurrencyJpy(row.amount) : "—"}
              </p>
              <Badge variant="neutral">
                {basis === "after_tax" ? "税引後" : "税引前"}
              </Badge>
            </div>
          </button>
        )))}
      </Card>

      {/* Month detail */}
      {selectedMonth !== null && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">
            {formatYearMonth(year, selectedMonth)} 明細
          </h2>

          {loadingDetail && (
            <p className="text-center text-sm text-muted">読み込み中…</p>
          )}

          {!loadingDetail && monthDetail !== null && (
            <>
              {/* Month totals */}
              <Card className="p-4">
                <div className="flex justify-between text-sm text-muted">
                  <span>税引前合計</span>
                  <span>{formatCurrencyJpy(monthDetail.totalBeforeTaxAmount)}</span>
                </div>
                <div className="flex justify-between text-sm text-muted">
                  <span>税額</span>
                  <span>{formatCurrencyJpy(monthDetail.totalEstimatedTaxAmount)}</span>
                </div>
                <div className="mt-2 flex justify-between font-semibold">
                  <span>税引後合計</span>
                  <span>{formatCurrencyJpy(monthDetail.totalAfterTaxAmount)}</span>
                </div>
              </Card>

              {/* Event cards */}
              {monthDetail.events.length === 0 ? (
                <p className="text-center text-sm text-muted">
                  この月の配当イベントはありません。
                </p>
              ) : (
                <div className="space-y-3">
                  {monthDetail.events.map((evt, idx) => (
                    <Card key={`${evt.holdingId}-${idx}`} className="p-4 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold">{evt.stockName}</p>
                          <p className="text-sm text-muted">{evt.ticker}</p>
                        </div>
                        <Badge
                          variant={
                            evt.status === "confirmed" || evt.status === "paid"
                              ? "success"
                              : evt.status === "undecided"
                                ? "warning"
                                : "neutral"
                          }
                        >
                          {formatDividendStatus(
                            evt.status as Parameters<
                              typeof formatDividendStatus
                            >[0]
                          )}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted">{evt.displayDateText}</p>
                      <div className="flex gap-4 text-sm">
                        <span>
                          税引後{" "}
                          <span className="font-semibold">
                            {formatCurrencyJpy(evt.afterTaxAmount)}
                          </span>
                        </span>
                        <span className="text-muted">
                          税引前 {formatCurrencyJpy(evt.beforeTaxAmount)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted">
                        <span>
                          {formatAccountType(
                            evt.accountType as Parameters<
                              typeof formatAccountType
                            >[0]
                          )}
                        </span>
                        <span>・</span>
                        <span>{evt.quantity}株</span>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
