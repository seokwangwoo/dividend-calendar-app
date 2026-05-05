-- Phase 03: Portfolio RPC functions

-- calculate_holding_dividend
-- Calculates before-tax, tax, and after-tax annual dividend amounts and yields for a holding.
-- Uses SECURITY INVOKER so RLS on stocks is enforced.
create or replace function public.calculate_holding_dividend(
  p_stock_id uuid,
  p_quantity numeric,
  p_average_purchase_price numeric,
  p_account_type text
)
returns table (
  before_tax_amount numeric,
  estimated_tax_amount numeric,
  after_tax_amount numeric,
  before_tax_yield numeric,
  after_tax_yield numeric,
  currency text
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_stock public.stocks%rowtype;
  v_tax_rate numeric;
  v_before_tax_amount numeric;
  v_estimated_tax_amount numeric;
  v_after_tax_amount numeric;
  v_before_tax_yield numeric;
  v_after_tax_yield numeric;
begin
  -- Validate account_type
  if p_account_type not in ('nisa', 'tokutei', 'general') then
    raise exception 'Invalid account_type: %. Must be one of nisa, tokutei, general.', p_account_type;
  end if;

  -- Validate quantity
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Quantity must be greater than zero.';
  end if;

  -- Validate average_purchase_price
  if p_average_purchase_price is null or p_average_purchase_price < 0 then
    raise exception 'Average purchase price must be greater than or equal to zero.';
  end if;

  -- Fetch stock
  select * into v_stock
  from public.stocks
  where id = p_stock_id;

  if not found then
    raise exception 'Stock not found: %', p_stock_id;
  end if;

  -- Reject unsupported stocks
  if v_stock.support_status = 'unsupported' then
    raise exception 'Stock % is not supported in the current MVP.', v_stock.ticker;
  end if;

  -- Determine tax rate
  v_tax_rate := case p_account_type
    when 'nisa'    then 0
    when 'tokutei' then 0.20315
    when 'general' then 0.20315
  end;

  -- Calculate amounts
  if v_stock.expected_annual_dividend_per_share is null then
    v_before_tax_amount    := null;
    v_estimated_tax_amount := null;
    v_after_tax_amount     := null;
  else
    v_before_tax_amount    := v_stock.expected_annual_dividend_per_share * p_quantity;
    v_estimated_tax_amount := v_before_tax_amount * v_tax_rate;
    v_after_tax_amount     := v_before_tax_amount - v_estimated_tax_amount;
  end if;

  -- Calculate yields (null when current_price is null or zero)
  if v_stock.current_price is null or v_stock.current_price = 0
     or v_stock.expected_annual_dividend_per_share is null then
    v_before_tax_yield := null;
    v_after_tax_yield  := null;
  else
    v_before_tax_yield := (v_stock.expected_annual_dividend_per_share / v_stock.current_price) * 100;
    v_after_tax_yield  := (v_stock.expected_annual_dividend_per_share * (1 - v_tax_rate) / v_stock.current_price) * 100;
  end if;

  return query select
    v_before_tax_amount,
    v_estimated_tax_amount,
    v_after_tax_amount,
    v_before_tax_yield,
    v_after_tax_yield,
    v_stock.currency;
end;
$$;

revoke all on function public.calculate_holding_dividend(uuid, numeric, numeric, text) from public;
grant execute on function public.calculate_holding_dividend(uuid, numeric, numeric, text) to authenticated;


-- get_portfolio_summary
-- Returns aggregated dividend summary for the authenticated user's active holdings.
-- Uses auth.uid() for user identity; no p_user_id parameter to avoid privilege escalation.
-- SECURITY DEFINER is used only to allow reading stocks (which are readable by authenticated
-- users via RLS anyway); holdings are filtered by auth.uid() explicitly.
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

  -- Validate p_account_type when provided
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
      s.currency,
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
      currency,
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
    count(*)::bigint as holding_count,
    sum(before_tax_amount) as annual_before_tax_amount,
    sum(tax_amount) as annual_estimated_tax_amount,
    sum(after_tax_amount) as annual_after_tax_amount,
    avg(after_tax_yield) as average_after_tax_yield,
    -- Use most common currency; default to 'JPY' when no holdings
    coalesce(
      (select ha2.currency
       from holding_amounts ha2
       where ha2.currency is not null
       group by ha2.currency
       order by count(*) desc
       limit 1),
      'JPY'
    ) as currency
  from holding_amounts;
end;
$$;

revoke all on function public.get_portfolio_summary(text) from public;
grant execute on function public.get_portfolio_summary(text) to authenticated;
