-- Phase 06: Performance Monitoring and Validation
-- Admin monitoring functions and views for operational visibility

-- 1. Admin disclosure daily summary
-- Returns counts by day for disclosures collected, parsed, failed,
-- AI cost, and review queue depth.

create or replace function public.get_admin_disclosure_summary(
  p_start_date date default current_date - interval '7 days',
  p_end_date date default current_date
)
returns table (
  day date,
  collected_count bigint,
  parsed_count bigint,
  failed_count bigint,
  skipped_count bigint,
  total_ai_cost_usd numeric,
  total_input_tokens bigint,
  total_output_tokens bigint,
  pending_reviews bigint,
  approved_reviews bigint,
  rejected_reviews bigint
)
language sql
security definer
set search_path = public
stable
as $$
  with disclosure_day as (
    select
      date(d.collected_at) as day,
      count(*) filter (where true) as collected_count,
      count(*) filter (where d.parse_status = 'parsed') as parsed_count,
      count(*) filter (where d.parse_status = 'failed') as failed_count,
      count(*) filter (where d.parse_status = 'skipped') as skipped_count,
      coalesce(sum(d.ai_parse_cost_usd), 0) as total_ai_cost_usd,
      coalesce(sum(d.ai_parse_input_tokens), 0) as total_input_tokens,
      coalesce(sum(d.ai_parse_output_tokens), 0) as total_output_tokens
    from public.disclosures d
    where date(d.collected_at) between p_start_date and p_end_date
    group by date(d.collected_at)
  ),
  review_day as (
    select
      date(dr.created_at) as day,
      count(*) filter (where dr.status in ('pending', 'needs_manual_check')) as pending_reviews,
      count(*) filter (where dr.status = 'approved') as approved_reviews,
      count(*) filter (where dr.status = 'rejected') as rejected_reviews
    from public.dividend_reviews dr
    where date(dr.created_at) between p_start_date and p_end_date
    group by date(dr.created_at)
  )
  select
    d.day,
    d.collected_count,
    d.parsed_count,
    d.failed_count,
    d.skipped_count,
    d.total_ai_cost_usd,
    d.total_input_tokens,
    d.total_output_tokens,
    coalesce(r.pending_reviews, 0) as pending_reviews,
    coalesce(r.approved_reviews, 0) as approved_reviews,
    coalesce(r.rejected_reviews, 0) as rejected_reviews
  from disclosure_day d
  left join review_day r on r.day = d.day
  order by d.day desc;
$$;

revoke all on function public.get_admin_disclosure_summary(date, date) from public;
grant execute on function public.get_admin_disclosure_summary(date, date) to authenticated;

comment on function public.get_admin_disclosure_summary is
  'Admin-only daily disclosure and review summary. p_start_date defaults to 7 days ago.';

-- 2. Admin price refresh failure summary by batch (day)
-- Returns success/failure counts and failure rate per day.

create or replace function public.get_admin_price_refresh_summary(
  p_start_date date default current_date - interval '7 days',
  p_end_date date default current_date
)
returns table (
  day date,
  total_attempts bigint,
  success_count bigint,
  failure_count bigint,
  failure_rate numeric,
  unique_stocks bigint,
  avg_new_price numeric
)
language sql
security definer
set search_path = public
stable
as $$
  select
    date(l.created_at) as day,
    count(*) as total_attempts,
    count(*) filter (where l.status = 'success') as success_count,
    count(*) filter (where l.status = 'failure') as failure_count,
    round(
      (count(*) filter (where l.status = 'failure')::numeric / nullif(count(*), 0)) * 100,
      2
    ) as failure_rate,
    count(distinct l.stock_id) as unique_stocks,
    round(avg(l.new_price), 2) as avg_new_price
  from public.stock_price_refresh_logs l
  where date(l.created_at) between p_start_date and p_end_date
  group by date(l.created_at)
  order by day desc;
$$;

revoke all on function public.get_admin_price_refresh_summary(date, date) from public;
grant execute on function public.get_admin_price_refresh_summary(date, date) to authenticated;

comment on function public.get_admin_price_refresh_summary is
  'Admin-only daily price refresh batch summary. p_start_date defaults to 7 days ago.';

-- 3. Admin job queue depth snapshot
-- Returns current queue depth by status and type.

create or replace function public.get_admin_job_queue_depth()
returns table (
  job_type text,
  status text,
  count bigint,
  oldest_pending timestamptz,
  newest_pending timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select
    j.type as job_type,
    j.status,
    count(*) as count,
    min(j.created_at) filter (where j.status = 'pending') as oldest_pending,
    max(j.created_at) filter (where j.status = 'pending') as newest_pending
  from public.jobs j
  group by j.type, j.status
  order by j.type, j.status;
$$;

revoke all on function public.get_admin_job_queue_depth() from public;
grant execute on function public.get_admin_job_queue_depth() to authenticated;

comment on function public.get_admin_job_queue_depth is
  'Admin-only snapshot of current job queue depth by type and status.';
