-- Phase 01: Full Market Stock Master Import
-- Extend stocks schema, add import logging, and support delisted status

-- 1. Extend stock_support_status enum to include 'delisted'
alter type public.stock_support_status add value if not exists 'delisted';

-- 2. Add market_segment column to stocks (if not already present)
alter table public.stocks
  add column if not exists market_segment text;

-- 3. Add index on market_segment for Phase 04 filtering
create index if not exists idx_stocks_market_segment on public.stocks(market_segment);

-- 4. Create stock_import_logs table
create table if not exists public.stock_import_logs (
  id uuid primary key default gen_random_uuid(),
  file_path text not null,
  dry_run boolean not null default false,
  processed_count int not null default 0,
  inserted_count int not null default 0,
  updated_count int not null default 0,
  delisted_count int not null default 0,
  failed_count int not null default 0,
  status text not null check (status in ('running', 'success', 'failed')),
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

-- 5. Enable RLS on stock_import_logs
alter table public.stock_import_logs enable row level security;

-- 6. Only admins can view import logs
drop policy if exists "Admins can view stock import logs" on public.stock_import_logs;
create policy "Admins can view stock import logs"
  on public.stock_import_logs for select
  to authenticated
  using (public.is_admin());

-- 7. Service role insert only (no direct authenticated insert)
revoke all on public.stock_import_logs from authenticated;
grant select on public.stock_import_logs to authenticated;

-- 8. Auto-update updated_at on stocks (already exists, but ensure market_segment is covered by trigger)
-- The existing set_stocks_updated_at trigger already covers all columns on the stocks table.
