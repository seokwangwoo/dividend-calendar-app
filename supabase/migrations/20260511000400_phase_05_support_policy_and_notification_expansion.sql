-- Phase 05: Support Policy and Notification Expansion
-- Auto-promote stocks to supported, relax holding restrictions

-- 1. Trigger: auto-promote stock to 'supported' when first dividend event is approved
create or replace function public.auto_promote_stock_on_approval()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.review_status = 'approved' then
    update public.stocks
    set support_status = 'supported'
    where id = new.stock_id
      and support_status = 'unsupported';
  end if;
  return new;
end;
$$;

drop trigger if exists auto_promote_stock_trigger on public.dividend_events;
create trigger auto_promote_stock_trigger
  after insert or update on public.dividend_events
  for each row
  execute function public.auto_promote_stock_on_approval();

-- 2. Update calculate_holding_dividend: reject delisted instead of unsupported
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

  -- Reject delisted stocks
  if v_stock.support_status = 'delisted' then
    raise exception 'Stock % is delisted.', v_stock.ticker;
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
  if v_stock.current_price is null or v_stock.current_price <= 0 then
    v_before_tax_yield := null;
    v_after_tax_yield  := null;
  else
    v_before_tax_yield := (v_before_tax_amount / (v_stock.current_price * p_quantity)) * 100;
    v_after_tax_yield  := (v_after_tax_amount / (v_stock.current_price * p_quantity)) * 100;
  end if;

  return query
  select
    v_before_tax_amount,
    v_estimated_tax_amount,
    v_after_tax_amount,
    v_before_tax_yield,
    v_after_tax_yield,
    coalesce(v_stock.currency, 'JPY');
end;
$$;
