-- Phase 05: User-facing RPC migration
-- Updates all user-facing RPCs to use expected_payment_year / expected_payment_month
-- instead of payment_year / expected_payment_date.

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
      and de.expected_payment_year = p_year
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
      and de.expected_payment_year = p_year
      and de.dividend_per_share is not null
      and de.expected_payment_month = v_current_month
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
      de.expected_payment_year,
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
      and de.expected_payment_year = p_year
      and de.dividend_per_share is not null
      and (
        de.expected_payment_year > extract(year from current_date)
        or (
          de.expected_payment_year = extract(year from current_date)
          and de.expected_payment_month >= extract(month from current_date)
        )
      )
    group by
      de.id,
      s.ticker,
      s.name,
      de.expected_payment_year,
      de.expected_payment_month,
      de.dividend_per_share,
      de.status
  )
  select
    jsonb_build_object(
      'ticker', ticker,
      'stockName', stock_name,
      'displayDateText',
        case
          when expected_payment_year is not null and expected_payment_month is not null
            then expected_payment_year || '年' || expected_payment_month || '月'
          when expected_payment_month is not null
            then expected_payment_month || '月予定'
          else '未定'
        end,
      'beforeTaxAmount', before_tax_amount,
      'afterTaxAmount', after_tax_amount,
      'status', status::text
    )
  into v_next_dividend
  from candidate_events
  order by
    expected_payment_year asc nulls last,
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


create or replace function public.get_dividend_calendar(
  p_year int,
  p_amount_basis text,
  p_account_type text,
  p_calendar_basis text default 'payment_month'
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

  if p_amount_basis not in ('before_tax', 'after_tax') then
    raise exception 'Invalid amount_basis: %. Must be before_tax or after_tax.', p_amount_basis;
  end if;

  if p_account_type not in ('all', 'nisa', 'tokutei', 'general') then
    raise exception 'Invalid account_type: %.', p_account_type;
  end if;

  if p_calendar_basis not in ('payment_month', 'record_date', 'ex_dividend_date') then
    raise exception 'Invalid calendar_basis: %.', p_calendar_basis;
  end if;

  return query
  with months_series as (
    select generate_series(1, 12) as m
  ),
  holding_events as (
    select
      case p_calendar_basis
        when 'payment_month' then de.expected_payment_month
        when 'record_date' then extract(month from de.record_date)::int
        when 'ex_dividend_date' then extract(month from de.ex_dividend_date)::int
      end as event_month,
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
      and de.expected_payment_year = p_year
      and de.dividend_per_share is not null
      and (p_account_type = 'all' or h.account_type::text = p_account_type)
      and (
        (p_calendar_basis = 'payment_month' and de.expected_payment_month is not null)
        or (p_calendar_basis = 'record_date' and de.record_date is not null)
        or (p_calendar_basis = 'ex_dividend_date' and de.ex_dividend_date is not null)
      )
  ),
  event_amounts as (
    select
      event_month,
      case p_amount_basis
        when 'before_tax' then dividend_per_share * quantity
        when 'after_tax'  then dividend_per_share * quantity * (1 - tax_rate)
      end as event_amount
    from holding_events
    where event_month between 1 and 12
  ),
  monthly_agg as (
    select
      event_month,
      sum(event_amount) as total_amount,
      count(*) as cnt
    from event_amounts
    group by event_month
  )
  select
    ms.m::int as month,
    ma.total_amount as amount,
    coalesce(ma.cnt, 0) as event_count
  from months_series ms
  left join monthly_agg ma on ma.event_month = ms.m
  order by ms.m;
end;
$$;

revoke all on function public.get_dividend_calendar(int, text, text, text) from public;
grant execute on function public.get_dividend_calendar(int, text, text, text) to authenticated;


create or replace function public.get_dividend_month_detail(
  p_year int,
  p_month int,
  p_amount_basis text,
  p_account_type text,
  p_calendar_basis text default 'payment_month'
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid;
  v_result jsonb;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Not authenticated.';
  end if;

  if p_amount_basis not in ('before_tax', 'after_tax') then
    raise exception 'Invalid amount_basis: %. Must be before_tax or after_tax.', p_amount_basis;
  end if;

  if p_account_type not in ('all', 'nisa', 'tokutei', 'general') then
    raise exception 'Invalid account_type: %.', p_account_type;
  end if;

  if p_calendar_basis not in ('payment_month', 'record_date', 'ex_dividend_date') then
    raise exception 'Invalid calendar_basis: %.', p_calendar_basis;
  end if;

  select jsonb_build_object(
    'year', p_year,
    'month', p_month,
    'basis', p_amount_basis,
    'totalBeforeTaxAmount', sum(de.dividend_per_share * h.quantity),
    'totalEstimatedTaxAmount', sum(de.dividend_per_share * h.quantity * case h.account_type::text when 'nisa' then 0 else 0.20315 end),
    'totalAfterTaxAmount', sum(de.dividend_per_share * h.quantity * (1 - case h.account_type::text when 'nisa' then 0 else 0.20315 end)),
    'events', coalesce(jsonb_agg(jsonb_build_object(
      'holdingId', h.id,
      'stockId', s.id,
      'ticker', s.ticker,
      'stockName', s.name,
      'accountType', h.account_type,
      'quantity', h.quantity,
      'eventType', de.event_type,
      'displayDateText', coalesce(
        case p_calendar_basis
          when 'payment_month' then
            case
              when de.expected_payment_year is not null and de.expected_payment_month is not null
                then de.expected_payment_year || '年' || de.expected_payment_month || '月'
              when de.expected_payment_month is not null
                then de.expected_payment_month || '月予定'
              else '未定'
            end
          when 'record_date' then to_char(de.record_date, 'YYYY年MM月DD日')
          when 'ex_dividend_date' then to_char(de.ex_dividend_date, 'YYYY年MM月DD日')
        end,
        '未定'
      ),
      'beforeTaxAmount', de.dividend_per_share * h.quantity,
      'estimatedTaxAmount', de.dividend_per_share * h.quantity * case h.account_type::text when 'nisa' then 0 else 0.20315 end,
      'afterTaxAmount', de.dividend_per_share * h.quantity * (1 - case h.account_type::text when 'nisa' then 0 else 0.20315 end),
      'status', de.status,
      'sourceType', de.source_type,
      'sourceUrl', de.source_url
    ) order by de.dividend_per_share * h.quantity desc), '[]'::jsonb)
  )
  into v_result
  from public.holdings h
  join public.dividend_events de on de.stock_id = h.stock_id
  join public.stocks s on s.id = h.stock_id
  where h.user_id = v_user_id
    and h.deleted_at is null
    and de.review_status = 'approved'
    and de.expected_payment_year = p_year
    and de.dividend_per_share is not null
    and (p_account_type = 'all' or h.account_type::text = p_account_type)
    and (
      (p_calendar_basis = 'payment_month' and de.expected_payment_month = p_month)
      or (p_calendar_basis = 'record_date' and extract(month from de.record_date)::int = p_month)
      or (p_calendar_basis = 'ex_dividend_date' and extract(month from de.ex_dividend_date)::int = p_month)
    );

  return v_result;
end;
$$;

revoke all on function public.get_dividend_month_detail(int, int, text, text, text) from public;
grant execute on function public.get_dividend_month_detail(int, int, text, text, text) to authenticated;


create or replace function public.get_stock_detail(
  p_stock_id uuid,
  p_year int default extract(year from now())::int
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

  with h_calcs as (
    select
      h.account_type,
      h.quantity,
      case h.account_type::text
        when 'nisa'    then 0::numeric
        when 'tokutei' then 0.20315::numeric
        when 'general' then 0.20315::numeric
        else 0::numeric
      end as tax_rate,
      (
        select sum(de.dividend_per_share)
        from public.dividend_events de
        where de.stock_id = h.stock_id
          and de.review_status = 'approved'
          and de.expected_payment_year = p_year
          and de.dividend_per_share is not null
      ) as annual_dividend_per_share
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
            case when annual_dividend_per_share is not null
              then annual_dividend_per_share * quantity
              else null
            end,
          'annualAfterTaxAmount',
            case when annual_dividend_per_share is not null
              then annual_dividend_per_share * quantity * (1 - tax_rate)
              else null
            end
        )
      ),
      '[]'::jsonb
    )
  into v_user_holdings
  from h_calcs;

  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'eventType', event_type::text,
          'expectedPaymentYear', expected_payment_year,
          'expectedPaymentMonth', expected_payment_month,
          'dividendPerShare', dividend_per_share,
          'status', status::text
        )
        order by expected_payment_year asc nulls last, expected_payment_month asc nulls last
      ),
      '[]'::jsonb
    )
  into v_dividend_schedule
  from public.dividend_events
  where stock_id = p_stock_id
    and review_status = 'approved'
    and expected_payment_year = p_year;

  -- Source metadata: pick the most recently updated approved event for the
  -- requested year that carries source information.
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
    and expected_payment_year = p_year
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

revoke all on function public.get_stock_detail(uuid, int) from public;
grant execute on function public.get_stock_detail(uuid, int) to authenticated;


create or replace function public.get_portfolio_summary(
  p_account_type text default null,
  p_year int default extract(year from now())::int
)
returns table (
  holding_count bigint,
  annual_before_tax_amount numeric,
  annual_estimated_tax_amount numeric,
  annual_after_tax_amount numeric,
  average_after_tax_yield numeric,
  currency text
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

  if p_account_type is not null and p_account_type not in ('nisa', 'tokutei', 'general') then
    raise exception 'Invalid account_type: %. Must be one of nisa, tokutei, general.', p_account_type;
  end if;

  return query
  with holding_calcs as (
    select
      h.id,
      h.quantity,
      h.average_purchase_price,
      h.account_type,
      s.currency as stock_currency,
      case h.account_type::text
        when 'nisa'    then 0::numeric
        when 'tokutei' then 0.20315::numeric
        when 'general' then 0.20315::numeric
        else 0::numeric
      end as tax_rate,
      (
        select sum(de.dividend_per_share)
        from public.dividend_events de
        where de.stock_id = h.stock_id
          and de.review_status = 'approved'
          and de.expected_payment_year = p_year
          and de.dividend_per_share is not null
      ) as annual_dividend_per_share
    from public.holdings h
    join public.stocks s on s.id = h.stock_id
    where h.user_id = v_user_id
      and h.deleted_at is null
      and (p_account_type is null or h.account_type::text = p_account_type)
  ),
  holding_amounts as (
    select
      id,
      stock_currency,
      quantity * average_purchase_price as acquisition_cost,
      case when annual_dividend_per_share is not null
        then annual_dividend_per_share * quantity
        else null
      end as before_tax_amount,
      case when annual_dividend_per_share is not null
        then annual_dividend_per_share * quantity * tax_rate
        else null
      end as tax_amount,
      case when annual_dividend_per_share is not null
        then annual_dividend_per_share * quantity * (1 - tax_rate)
        else null
      end as after_tax_amount
    from holding_calcs
  ),
  totals as (
    select
      count(*)::bigint as holding_count,
      sum(before_tax_amount) as before_tax_total,
      sum(tax_amount) as tax_total,
      sum(after_tax_amount) as after_tax_total,
      sum(acquisition_cost) as acquisition_cost_total
    from holding_amounts
  )
  select
    t.holding_count,
    t.before_tax_total,
    t.tax_total,
    t.after_tax_total,
    case when t.after_tax_total is not null and t.acquisition_cost_total > 0
      then (t.after_tax_total / t.acquisition_cost_total) * 100
      else null
    end,
    coalesce(
      (select ha2.stock_currency
       from holding_amounts ha2
       where ha2.stock_currency is not null
       group by ha2.stock_currency
       order by count(*) desc
       limit 1),
      'JPY'
    )
  from totals t;
end;
$$;

revoke all on function public.get_portfolio_summary(text, int) from public;
grant execute on function public.get_portfolio_summary(text, int) to authenticated;
