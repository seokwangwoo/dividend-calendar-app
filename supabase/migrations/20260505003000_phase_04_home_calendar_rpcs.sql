-- Phase 04: Home and Calendar RPC functions

-- get_home_summary
-- Returns a JSONB summary for the home screen including annual dividends,
-- current month dividends, next upcoming dividend, monthly goal progress,
-- and recent dividend change event for the authenticated user.
create or replace function public.get_home_summary(
  p_year int
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid;
  v_current_month int;
  v_annual_before_tax numeric;
  v_annual_tax numeric;
  v_annual_after_tax numeric;
  v_currency text;
  v_current_month_after_tax numeric;
  v_next_dividend jsonb;
  v_monthly_goal jsonb;
  v_recent_change jsonb;
  v_goal_amount numeric;
  v_goal_current numeric;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Not authenticated.';
  end if;

  v_current_month := extract(month from now())::int;
  v_currency := 'JPY';

  -- Annual dividend totals across all approved events for the year
  with holding_events as (
    select
      h.quantity,
      h.account_type,
      de.dividend_per_share,
      de.expected_payment_month,
      de.expected_payment_date,
      case h.account_type::text
        when 'nisa'    then 0::numeric
        when 'tokutei' then 0.20315::numeric
        when 'general' then 0.20315::numeric
        else 0::numeric
      end as tax_rate
    from public.holdings h
    join public.stocks s on s.id = h.stock_id
    join public.dividend_events de on de.stock_id = h.stock_id
    where h.user_id = v_user_id
      and h.deleted_at is null
      and de.review_status = 'approved'
      and de.fiscal_year = p_year
      and de.dividend_per_share is not null
  ),
  amounts as (
    select
      dividend_per_share * quantity as before_tax,
      dividend_per_share * quantity * tax_rate as tax,
      dividend_per_share * quantity * (1 - tax_rate) as after_tax,
      expected_payment_month,
      expected_payment_date
    from holding_events
  )
  select
    sum(before_tax),
    sum(tax),
    sum(after_tax)
  into v_annual_before_tax, v_annual_tax, v_annual_after_tax
  from amounts;

  -- Current month after-tax
  with holding_events as (
    select
      h.quantity,
      de.dividend_per_share,
      de.expected_payment_month,
      case h.account_type::text
        when 'nisa'    then 0::numeric
        when 'tokutei' then 0.20315::numeric
        when 'general' then 0.20315::numeric
        else 0::numeric
      end as tax_rate
    from public.holdings h
    join public.dividend_events de on de.stock_id = h.stock_id
    where h.user_id = v_user_id
      and h.deleted_at is null
      and de.review_status = 'approved'
      and de.fiscal_year = p_year
      and de.dividend_per_share is not null
      and de.expected_payment_month = v_current_month
  )
  select
    sum(dividend_per_share * quantity * (1 - tax_rate))
  into v_current_month_after_tax
  from holding_events;

  -- Next upcoming dividend (closest future expected_payment_date)
  with next_evt as (
    select
      s.ticker,
      s.name as stock_name,
      de.expected_payment_date,
      de.expected_payment_month,
      h.quantity,
      de.dividend_per_share,
      de.status,
      case h.account_type::text
        when 'nisa'    then 0::numeric
        when 'tokutei' then 0.20315::numeric
        when 'general' then 0.20315::numeric
        else 0::numeric
      end as tax_rate
    from public.holdings h
    join public.stocks s on s.id = h.stock_id
    join public.dividend_events de on de.stock_id = h.stock_id
    where h.user_id = v_user_id
      and h.deleted_at is null
      and de.review_status = 'approved'
      and de.fiscal_year = p_year
      and de.expected_payment_date >= current_date
    order by de.expected_payment_date asc
    limit 1
  )
  select
    jsonb_build_object(
      'ticker', ticker,
      'stockName', stock_name,
      'displayDateText',
        case when expected_payment_date is not null
          then to_char(expected_payment_date, 'YYYY年MM月DD日')
          else to_char(expected_payment_month, 'FM9') || '月予定'
        end,
      'beforeTaxAmount',
        case when dividend_per_share is not null
          then dividend_per_share * quantity
          else null
        end,
      'afterTaxAmount',
        case when dividend_per_share is not null
          then dividend_per_share * quantity * (1 - tax_rate)
          else null
        end,
      'status', status::text
    )
  into v_next_dividend
  from next_evt;

  -- Monthly goal
  select monthly_dividend_goal_amount
  into v_goal_amount
  from public.user_settings
  where user_id = v_user_id;

  if v_goal_amount is not null then
    v_goal_current := coalesce(v_current_month_after_tax, 0);
    v_monthly_goal := jsonb_build_object(
      'targetAmount', v_goal_amount,
      'currentAmount', v_goal_current,
      'achievementRate',
        case when v_goal_amount > 0
          then round((v_goal_current / v_goal_amount) * 100, 2)
          else null
        end
    );
  end if;

  -- Recent dividend change for user-held stocks
  with recent_evt as (
    select
      de.change_type,
      s.ticker,
      s.name as stock_name,
      de.dividend_per_share,
      de.previous_dividend_per_share
    from public.holdings h
    join public.stocks s on s.id = h.stock_id
    join public.dividend_events de on de.stock_id = h.stock_id
    where h.user_id = v_user_id
      and h.deleted_at is null
      and de.review_status = 'approved'
      and de.change_type in ('increase', 'decrease', 'no_dividend', 'special', 'commemorative', 'resumed')
    order by de.updated_at desc
    limit 1
  )
  select
    jsonb_build_object(
      'changeType', change_type::text,
      'ticker', ticker,
      'stockName', stock_name,
      'dividendPerShare', dividend_per_share,
      'previousDividendPerShare', previous_dividend_per_share
    )
  into v_recent_change
  from recent_evt;

  return jsonb_build_object(
    'year', p_year,
    'annualDividend', jsonb_build_object(
      'beforeTaxAmount', v_annual_before_tax,
      'estimatedTaxAmount', v_annual_tax,
      'afterTaxAmount', v_annual_after_tax,
      'currency', v_currency
    ),
    'currentMonthDividend', jsonb_build_object(
      'month', v_current_month,
      'afterTaxAmount', v_current_month_after_tax
    ),
    'nextDividend', v_next_dividend,
    'monthlyGoal', v_monthly_goal,
    'recentDividendChange', v_recent_change
  );
end;
$$;

revoke all on function public.get_home_summary(int) from public;
grant execute on function public.get_home_summary(int) to authenticated;


-- get_dividend_calendar
-- Returns 12 rows (one per month) with aggregated dividend amounts and event counts.
-- Supports before_tax / after_tax basis and optional account_type filter.
create or replace function public.get_dividend_calendar(
  p_year int,
  p_basis text,
  p_account_type text
)
returns table (
  month int,
  amount numeric,
  event_count bigint
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Not authenticated.';
  end if;

  if p_basis not in ('before_tax', 'after_tax') then
    raise exception 'Invalid basis: %. Must be before_tax or after_tax.', p_basis;
  end if;

  if p_account_type not in ('all', 'nisa', 'tokutei', 'general') then
    raise exception 'Invalid account_type: %.', p_account_type;
  end if;

  return query
  with months_series as (
    select generate_series(1, 12) as m
  ),
  holding_events as (
    select
      coalesce(de.expected_payment_month,
        extract(month from de.expected_payment_date)::int) as pay_month,
      h.quantity,
      de.dividend_per_share,
      case h.account_type::text
        when 'nisa'    then 0::numeric
        when 'tokutei' then 0.20315::numeric
        when 'general' then 0.20315::numeric
        else 0::numeric
      end as tax_rate
    from public.holdings h
    join public.dividend_events de on de.stock_id = h.stock_id
    where h.user_id = v_user_id
      and h.deleted_at is null
      and de.review_status = 'approved'
      and de.fiscal_year = p_year
      and de.dividend_per_share is not null
      and (p_account_type = 'all' or h.account_type::text = p_account_type)
      and (
        de.expected_payment_month is not null
        or de.expected_payment_date is not null
      )
  ),
  event_amounts as (
    select
      pay_month,
      case p_basis
        when 'before_tax' then dividend_per_share * quantity
        when 'after_tax'  then dividend_per_share * quantity * (1 - tax_rate)
      end as event_amount
    from holding_events
    where pay_month between 1 and 12
  ),
  monthly_agg as (
    select
      pay_month,
      sum(event_amount) as total_amount,
      count(*) as cnt
    from event_amounts
    group by pay_month
  )
  select
    ms.m::int as month,
    ma.total_amount as amount,
    coalesce(ma.cnt, 0) as event_count
  from months_series ms
  left join monthly_agg ma on ma.pay_month = ms.m
  order by ms.m;
end;
$$;

revoke all on function public.get_dividend_calendar(int, text, text) from public;
grant execute on function public.get_dividend_calendar(int, text, text) to authenticated;


-- get_dividend_month_detail
-- Returns JSONB with per-event breakdown for a given year/month.
create or replace function public.get_dividend_month_detail(
  p_year int,
  p_month int,
  p_basis text,
  p_account_type text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid;
  v_events jsonb;
  v_total_before numeric;
  v_total_tax numeric;
  v_total_after numeric;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Not authenticated.';
  end if;

  with holding_events as (
    select
      h.id as holding_id,
      s.id as stock_id,
      s.ticker,
      s.name as stock_name,
      h.account_type,
      h.quantity,
      de.event_type,
      de.expected_payment_date,
      coalesce(de.expected_payment_month,
        extract(month from de.expected_payment_date)::int) as pay_month,
      de.dividend_per_share,
      de.status,
      de.review_status,
      de.source_type,
      de.source_url,
      case h.account_type::text
        when 'nisa'    then 0::numeric
        when 'tokutei' then 0.20315::numeric
        when 'general' then 0.20315::numeric
        else 0::numeric
      end as tax_rate
    from public.holdings h
    join public.stocks s on s.id = h.stock_id
    join public.dividend_events de on de.stock_id = h.stock_id
    where h.user_id = v_user_id
      and h.deleted_at is null
      and de.review_status = 'approved'
      and de.fiscal_year = p_year
      and (p_account_type = 'all' or h.account_type::text = p_account_type)
      and (
        de.expected_payment_month = p_month
        or extract(month from de.expected_payment_date)::int = p_month
      )
  ),
  event_calcs as (
    select
      holding_id,
      stock_id,
      ticker,
      stock_name,
      account_type,
      quantity,
      event_type,
      expected_payment_date,
      pay_month,
      dividend_per_share,
      status,
      review_status,
      source_type,
      source_url,
      case when dividend_per_share is not null
        then dividend_per_share * quantity
        else null
      end as before_tax_amount,
      case when dividend_per_share is not null
        then dividend_per_share * quantity * tax_rate
        else null
      end as estimated_tax_amount,
      case when dividend_per_share is not null
        then dividend_per_share * quantity * (1 - tax_rate)
        else null
      end as after_tax_amount
    from holding_events
  )
  select
    sum(before_tax_amount),
    sum(estimated_tax_amount),
    sum(after_tax_amount),
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'holdingId', holding_id,
          'stockId', stock_id,
          'ticker', ticker,
          'stockName', stock_name,
          'accountType', account_type::text,
          'quantity', quantity,
          'eventType', event_type::text,
          'displayDateText',
            case when expected_payment_date is not null
              then to_char(expected_payment_date, 'YYYY年MM月DD日')
              else to_char(pay_month, 'FM9') || '月予定'
            end,
          'beforeTaxAmount', before_tax_amount,
          'estimatedTaxAmount', estimated_tax_amount,
          'afterTaxAmount', after_tax_amount,
          'status', status::text,
          'reviewStatus', review_status::text,
          'sourceType', source_type,
          'sourceUrl', source_url
        )
        order by expected_payment_date asc nulls last
      ),
      '[]'::jsonb
    )
  into v_total_before, v_total_tax, v_total_after, v_events
  from event_calcs;

  return jsonb_build_object(
    'year', p_year,
    'month', p_month,
    'basis', p_basis,
    'totalBeforeTaxAmount', v_total_before,
    'totalEstimatedTaxAmount', v_total_tax,
    'totalAfterTaxAmount', v_total_after,
    'events', coalesce(v_events, '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_dividend_month_detail(int, int, text, text) from public;
grant execute on function public.get_dividend_month_detail(int, int, text, text) to authenticated;


-- get_stock_detail
-- Returns JSONB with stock info, user holdings, dividend schedule, and source metadata.
create or replace function public.get_stock_detail(
  p_stock_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid;
  v_stock public.stocks%rowtype;
  v_user_holdings jsonb;
  v_dividend_schedule jsonb;
  v_source jsonb;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Not authenticated.';
  end if;

  select * into v_stock
  from public.stocks
  where id = p_stock_id;

  if not found then
    return null;
  end if;

  -- User holdings for this stock
  with h_calcs as (
    select
      h.account_type,
      h.quantity,
      case h.account_type::text
        when 'nisa'    then 0::numeric
        when 'tokutei' then 0.20315::numeric
        when 'general' then 0.20315::numeric
        else 0::numeric
      end as tax_rate
    from public.holdings h
    where h.user_id = v_user_id
      and h.stock_id = p_stock_id
      and h.deleted_at is null
  )
  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'accountType', account_type::text,
          'quantity', quantity,
          'annualBeforeTaxAmount',
            case when v_stock.expected_annual_dividend_per_share is not null
              then v_stock.expected_annual_dividend_per_share * quantity
              else null
            end,
          'annualAfterTaxAmount',
            case when v_stock.expected_annual_dividend_per_share is not null
              then v_stock.expected_annual_dividend_per_share * quantity * (1 - tax_rate)
              else null
            end
        )
      ),
      '[]'::jsonb
    )
  into v_user_holdings
  from h_calcs;

  -- Dividend schedule (approved events only)
  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'eventType', event_type::text,
          'expectedPaymentDate', expected_payment_date,
          'expectedPaymentMonth', expected_payment_month,
          'dividendPerShare', dividend_per_share,
          'status', status::text
        )
        order by expected_payment_date asc nulls last
      ),
      '[]'::jsonb
    )
  into v_dividend_schedule
  from public.dividend_events
  where stock_id = p_stock_id
    and review_status = 'approved';

  -- Most recent approved event source info
  select
    jsonb_build_object(
      'sourceType', source_type,
      'sourceUrl', source_url,
      'sourcePublishedAt', source_published_at,
      'reviewStatus', review_status::text
    )
  into v_source
  from public.dividend_events
  where stock_id = p_stock_id
    and review_status = 'approved'
    and source_type is not null
  order by updated_at desc
  limit 1;

  return jsonb_build_object(
    'stock', jsonb_build_object(
      'id', v_stock.id,
      'ticker', v_stock.ticker,
      'name', v_stock.name,
      'currency', v_stock.currency,
      'currentPrice', v_stock.current_price,
      'expectedAnnualDividendPerShare', v_stock.expected_annual_dividend_per_share,
      'expectedDividendYield', v_stock.expected_dividend_yield
    ),
    'userHoldings', v_user_holdings,
    'dividendSchedule', v_dividend_schedule,
    'source', v_source
  );
end;
$$;

revoke all on function public.get_stock_detail(uuid) from public;
grant execute on function public.get_stock_detail(uuid) to authenticated;
