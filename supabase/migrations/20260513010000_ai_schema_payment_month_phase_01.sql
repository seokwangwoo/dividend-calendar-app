-- Phase 01: AI Schema Payment Month — Database Schema Migration
-- Removes expected_payment_date / payment_year and adds expected_payment_year / fiscal_month.

-- ============================================================================
-- 1. Add new columns (before dropping old ones so we can migrate data)
-- ============================================================================

alter table public.dividend_reviews
  add column if not exists extracted_payment_year int,
  add column if not exists extracted_fiscal_month int;

alter table public.dividend_events
  add column if not exists expected_payment_year int,
  add column if not exists fiscal_month int;

-- ============================================================================
-- 2. Migrate existing data
-- ============================================================================

-- dividend_reviews: extracted_payment_date → extracted_payment_year + extracted_payment_month
update public.dividend_reviews
set
  extracted_payment_year = extract(year from extracted_payment_date)::int,
  extracted_payment_month = extract(month from extracted_payment_date)::int
where extracted_payment_year is null
  and extracted_payment_date is not null;

-- dividend_events: expected_payment_date → expected_payment_year + expected_payment_month
--                 payment_year → expected_payment_year (fallback)
update public.dividend_events
set
  expected_payment_year = coalesce(
    extract(year from expected_payment_date)::int,
    payment_year
  ),
  expected_payment_month = coalesce(
    expected_payment_month,
    extract(month from expected_payment_date)::int
  )
where expected_payment_year is null
  and (expected_payment_date is not null or payment_year is not null);

-- ============================================================================
-- 3. Remove dependencies on columns being dropped
-- ============================================================================

-- Trigger that references payment_year and expected_payment_date
drop trigger if exists set_dividend_events_payment_year on public.dividend_events;
drop function if exists public.set_dividend_event_payment_year();

-- Constraint that references payment_year
alter table public.dividend_events
  drop constraint if exists dividend_events_approved_payment_year_required;

-- Indexes that reference old columns
drop index if exists idx_dividend_events_stock_payment_year;
drop index if exists idx_dividend_events_payment_year_month;

-- RLS policy that references payment_year
drop policy if exists "Authenticated users can view approved dividend events" on public.dividend_events;

-- ============================================================================
-- 4. Drop old columns
-- ============================================================================

alter table public.dividend_reviews
  drop column if exists extracted_payment_date;

alter table public.dividend_events
  drop column if exists expected_payment_date,
  drop column if exists payment_year;

-- ============================================================================
-- 5. Add CHECK constraints
-- ============================================================================

alter table public.dividend_reviews
  add constraint dividend_reviews_extracted_payment_year_range
  check (extracted_payment_year is null or (extracted_payment_year between 2000 and 2100)) not valid;

alter table public.dividend_reviews
  validate constraint dividend_reviews_extracted_payment_year_range;

alter table public.dividend_reviews
  add constraint dividend_reviews_extracted_fiscal_month_range
  check (extracted_fiscal_month is null or (extracted_fiscal_month between 1 and 12)) not valid;

alter table public.dividend_reviews
  validate constraint dividend_reviews_extracted_fiscal_month_range;

alter table public.dividend_events
  add constraint dividend_events_expected_payment_year_range
  check (expected_payment_year is null or (expected_payment_year between 2000 and 2100)) not valid;

alter table public.dividend_events
  validate constraint dividend_events_expected_payment_year_range;

alter table public.dividend_events
  add constraint dividend_events_fiscal_month_range
  check (fiscal_month is null or (fiscal_month between 1 and 12)) not valid;

alter table public.dividend_events
  validate constraint dividend_events_fiscal_month_range;

-- ============================================================================
-- 6. Recreate indexes
-- ============================================================================

create index if not exists idx_dividend_events_stock_expected_year
  on public.dividend_events(stock_id, expected_payment_year);

create index if not exists idx_dividend_events_expected_year_month
  on public.dividend_events(expected_payment_year, expected_payment_month);

-- ============================================================================
-- 7. Recreate RLS policy
-- ============================================================================

create policy "Authenticated users can view approved dividend events"
on public.dividend_events for select
to authenticated
using (
  review_status = 'approved'
  and expected_payment_year is not null
  and event_type::text not in ('annual_total', 'special', 'commemorative')
);

-- ============================================================================
-- 8. Drop now-invalid helper function (will be recreated in Phase 03)
-- ============================================================================

drop function if exists public.derive_payment_year_from_review(date, int);
