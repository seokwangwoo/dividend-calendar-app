-- Remove the legacy one-argument overload so PostgREST can resolve
-- get_stock_detail calls that omit the optional p_year argument.
drop function if exists public.get_stock_detail(uuid);

revoke all on function public.get_stock_detail(uuid, int) from public;
grant execute on function public.get_stock_detail(uuid, int) to authenticated;

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
  v_annual_goal jsonb;
  v_recent_change jsonb;
  v_goal_amount numeric;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Not authenticated.';
  end if;

  v_current_month := extract(month from now())::int;
  v_currency := 'JPY';

  with holding_events as (
    select
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
      and de.payment_year = p_year
      and de.dividend_per_share is not null
  )
  select
    sum(dividend_per_share * quantity),
    sum(dividend_per_share * quantity * tax_rate),
    sum(dividend_per_share * quantity * (1 - tax_rate))
  into v_annual_before_tax, v_annual_tax, v_annual_after_tax
  from holding_events;

  with holding_events as (
    select
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
      and de.payment_year = p_year
      and de.dividend_per_share is not null
      and coalesce(de.expected_payment_month, extract(month from de.expected_payment_date)::int) = v_current_month
  )
  select
    sum(dividend_per_share * quantity * (1 - tax_rate))
  into v_current_month_after_tax
  from holding_events;

  with candidate_events as (
    select
      de.id as event_id,
      s.ticker,
      s.name as stock_name,
      de.expected_payment_date,
      de.expected_payment_month,
      de.dividend_per_share,
      de.status,
      sum(de.dividend_per_share * h.quantity) as before_tax_amount,
      sum(
        de.dividend_per_share * h.quantity *
        (1 - case h.account_type::text
          when 'nisa'    then 0::numeric
          when 'tokutei' then 0.20315::numeric
          when 'general' then 0.20315::numeric
          else 0::numeric
        end)
      ) as after_tax_amount
    from public.holdings h
    join public.stocks s on s.id = h.stock_id
    join public.dividend_events de on de.stock_id = h.stock_id
    where h.user_id = v_user_id
      and h.deleted_at is null
      and de.review_status = 'approved'
      and de.payment_year = p_year
      and de.dividend_per_share is not null
      and (
        de.expected_payment_date >= current_date
        or (
          de.expected_payment_date is null
          and de.expected_payment_month >= v_current_month
        )
      )
    group by
      de.id,
      s.ticker,
      s.name,
      de.expected_payment_date,
      de.expected_payment_month,
      de.dividend_per_share,
      de.status
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
      'beforeTaxAmount', before_tax_amount,
      'afterTaxAmount', after_tax_amount,
      'status', status::text
    )
  into v_next_dividend
  from candidate_events
  order by
    expected_payment_date asc nulls last,
    expected_payment_month asc nulls last,
    after_tax_amount desc nulls last
  limit 1;

  select annual_dividend_goal_amount
  into v_goal_amount
  from public.user_settings
  where user_id = v_user_id;

  if v_goal_amount is not null then
    v_annual_goal := jsonb_build_object(
      'targetAmount', v_goal_amount,
      'currentAmount', coalesce(v_annual_after_tax, 0),
      'achievementRate',
        case when v_goal_amount > 0
          then round((coalesce(v_annual_after_tax, 0) / v_goal_amount) * 100, 2)
          else null
        end
    );
  end if;

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
    'holdingCount',
      (
        select count(*)::int
        from public.holdings h_count
        where h_count.user_id = v_user_id
          and h_count.deleted_at is null
      ),
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
    'annualGoal', v_annual_goal,
    'recentDividendChange', v_recent_change
  );
end;
$$;

revoke all on function public.get_home_summary(int) from public;
grant execute on function public.get_home_summary(int) to authenticated;
