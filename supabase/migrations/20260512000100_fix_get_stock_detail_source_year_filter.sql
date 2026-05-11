-- Fix get_stock_detail: add payment_year filter to the source metadata query
-- so it returns source info from the requested year, not from stale events in other years.
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
          and de.payment_year = p_year
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
    and review_status = 'approved'
    and payment_year = p_year;

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
    and payment_year = p_year
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
