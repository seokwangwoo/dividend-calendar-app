-- Phase 03: Scaled Dividend Data Collection
-- Add job priority, AI cost tracking, and queue indexes

-- 1. Add priority column to jobs table
alter table public.jobs
  add column if not exists priority int not null default 3
  check (priority between 1 and 3);

comment on column public.jobs.priority is 'Parse job priority: 1=held stock, 2=supported with dividends, 3=other';

-- 2. Add AI cost tracking columns to disclosures table
alter table public.disclosures
  add column if not exists ai_parse_input_tokens int,
  add column if not exists ai_parse_output_tokens int,
  add column if not exists ai_parse_cost_usd numeric(10,6);

comment on column public.disclosures.ai_parse_input_tokens is 'Input tokens consumed by AI parser';
comment on column public.disclosures.ai_parse_output_tokens is 'Output tokens consumed by AI parser';
comment on column public.disclosures.ai_parse_cost_usd is 'Estimated USD cost of AI parse call';

-- 3. Add indexes for priority queue and queue depth queries
create index if not exists idx_jobs_priority_run_after on public.jobs(priority asc, run_after asc)
  where status = 'pending';

create index if not exists idx_jobs_status_type on public.jobs(status, type);

-- 4. Add index on disclosures for daily cost aggregation
create index if not exists idx_disclosures_ai_parsed_at on public.disclosures(ai_parse_cost_usd, updated_at)
  where parse_status in ('parsed', 'failed') and ai_parse_cost_usd is not null;
