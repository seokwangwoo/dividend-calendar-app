-- Fix: column reference "currency" was ambiguous in get_portfolio_summary.
-- RETURNS TABLE declares implicit OUT variables; renaming the CTE column
-- to stock_currency removes the conflict.
create or replace function public.get_portfolio_summary(
  p_account_type text default null
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
      s.expected_annual_dividend_per_share,
      h.quantity,
      h.account_type,
      s.current_price,
      s.currency as stock_currency,  -- renamed to avoid OUT variable conflict
      case h.account_type::text
        when 'nisa'    then 0::numeric
        when 'tokutei' then 0.20315::numeric
        when 'general' then 0.20315::numeric
        else 0::numeric
      end as tax_rate
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
      case when expected_annual_dividend_per_share is not null
        then expected_annual_dividend_per_share * quantity
        else null
      end as before_tax_amount,
      case when expected_annual_dividend_per_share is not null
        then expected_annual_dividend_per_share * quantity * tax_rate
        else null
      end as tax_amount,
      case when expected_annual_dividend_per_share is not null
        then expected_annual_dividend_per_share * quantity * (1 - tax_rate)
        else null
      end as after_tax_amount,
      case when current_price is not null and current_price > 0 and expected_annual_dividend_per_share is not null
        then (expected_annual_dividend_per_share * (1 - tax_rate) / current_price) * 100
        else null
      end as after_tax_yield
    from holding_calcs
  )
  select
    count(*)::bigint,
    sum(before_tax_amount),
    sum(tax_amount),
    sum(after_tax_amount),
    avg(after_tax_yield),
    coalesce(
      (select ha2.stock_currency
       from holding_amounts ha2
       where ha2.stock_currency is not null
       group by ha2.stock_currency
       order by count(*) desc
       limit 1),
      'JPY'
    )
  from holding_amounts;
end;
$$;
