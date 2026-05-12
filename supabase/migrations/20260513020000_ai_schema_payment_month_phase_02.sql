-- Phase 02: Update parse_disclosure SQL function to reflect new schema columns
-- The minimal fallback parser now explicitly sets extracted_payment_year/month
-- and extracted_fiscal_month (nullable) so the INSERT matches the current schema.

create or replace function public.parse_disclosure(
  p_disclosure_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_disclosure record;
  v_review_id uuid;
  v_amount numeric;
  v_status text := 'estimated';
  v_fiscal_year int;
  v_fiscal_month int;
  v_event_type public.dividend_event_type;
begin
  perform public.assert_admin();

  select * into v_disclosure
  from public.disclosures
  where id = p_disclosure_id;

  if not found then
    raise exception 'Disclosure not found';
  end if;

  if v_disclosure.title like '%未定%' then
    v_status := 'undecided';
    v_amount := null;
  else
    v_amount := nullif(substring(v_disclosure.title from '([0-9]+(?:\\.[0-9]+)?)円'), '')::numeric;
  end if;

  -- Derive fiscal_year from raw_payload or published_at fallback
  v_fiscal_year := coalesce(
    nullif(v_disclosure.raw_payload->>'fiscalYear', '')::int,
    extract(year from coalesce(v_disclosure.published_at, current_date))::int
  );

  -- Derive fiscal_month from raw_payload when available
  v_fiscal_month := nullif(v_disclosure.raw_payload->>'fiscalMonth', '')::int;

  -- Default event_type for minimal parser
  v_event_type := 'year_end'::public.dividend_event_type;

  insert into public.dividend_reviews (
    stock_id,
    disclosure_id,
    fiscal_year,
    event_type,
    extracted_dividend_per_share,
    extracted_payment_year,
    extracted_payment_month,
    extracted_fiscal_month,
    confidence_score,
    status,
    raw_payload
  ) values (
    v_disclosure.stock_id,
    v_disclosure.id,
    v_fiscal_year,
    v_event_type,
    v_amount,
    null,  -- minimal parser cannot infer payment year from title alone
    null,  -- minimal parser cannot infer payment month from title alone
    v_fiscal_month,
    case when v_amount is not null then 0.5000 else 0.1000 end,
    'pending',
    jsonb_build_object(
      'parser', 'phase02-minimal',
      'title', v_disclosure.title,
      'eventStatus', v_status,
      'manualReviewRequired', true
    )
  )
  returning id into v_review_id;

  return jsonb_build_object('reviewId', v_review_id, 'status', 'pending');
end;
$$;

revoke all on function public.parse_disclosure(uuid) from public;
grant execute on function public.parse_disclosure(uuid) to authenticated;
