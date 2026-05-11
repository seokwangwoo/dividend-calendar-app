-- Phase 02: Bulk Price Refresh Pipeline
-- Add refresh_stock_prices job type and update consecutive failure detection

-- 1. Extend job_type enum to include refresh_stock_prices
alter type public.job_type add value if not exists 'refresh_stock_prices';

-- 2. Update consecutive failure detection to cover all non-delisted stocks
-- (previously only checked support_status = 'supported')
create or replace function public.get_stocks_with_consecutive_price_refresh_failures(
  p_consecutive_count int default 3
)
returns table (
  stock_id uuid,
  ticker text,
  name text,
  failure_count bigint
)
language sql
security definer
set search_path = public
stable
as $$
  select
    s.id as stock_id,
    s.ticker,
    s.name,
    p_consecutive_count::bigint as failure_count
  from public.stocks s
  where s.support_status in ('supported', 'unsupported')
    and (
      select count(*)
      from (
        select l.status
        from public.stock_price_refresh_logs l
        where l.stock_id = s.id
        order by l.created_at desc
        limit p_consecutive_count
      ) recent
      where recent.status = 'failure'
    ) = p_consecutive_count;
$$;
