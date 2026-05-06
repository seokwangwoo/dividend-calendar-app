-- Phase 06: CSV Import and Calendar Expansion
-- Update calendar RPCs to support calendar basis (payment_month, record_date, ex_dividend_date)

-- Clean up old overloads
 drop function if exists public.get_dividend_calendar(int, text, text);
 drop function if exists public.get_dividend_month_detail(int, int, text, text);

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
        when 'payment_month' then
          coalesce(de.expected_payment_month,
            extract(month from de.expected_payment_date)::int)
        when 'record_date' then
          extract(month from de.record_date)::int
        when 'ex_dividend_date' then
          extract(month from de.ex_dividend_date)::int
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
      and de.payment_year = p_year
      and de.dividend_per_share is not null
      and (p_account_type = 'all' or h.account_type::text = p_account_type)
      and (
        (p_calendar_basis = 'payment_month' and
          (de.expected_payment_month is not null or de.expected_payment_date is not null))
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
            case when de.expected_payment_date is not null
              then to_char(de.expected_payment_date, 'YYYY年MM月DD日')
              else coalesce(de.expected_payment_month::text, extract(month from de.expected_payment_date)::text) || '月予定'
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
    and de.payment_year = p_year
    and de.dividend_per_share is not null
    and (p_account_type = 'all' or h.account_type::text = p_account_type)
    and (
      (p_calendar_basis = 'payment_month' and
        coalesce(de.expected_payment_month, extract(month from de.expected_payment_date)::int) = p_month)
      or (p_calendar_basis = 'record_date' and extract(month from de.record_date)::int = p_month)
      or (p_calendar_basis = 'ex_dividend_date' and extract(month from de.ex_dividend_date)::int = p_month)
    );

  return v_result;
end;
$$;

revoke all on function public.get_dividend_month_detail(int, int, text, text, text) from public;
grant execute on function public.get_dividend_month_detail(int, int, text, text, text) to authenticated;
