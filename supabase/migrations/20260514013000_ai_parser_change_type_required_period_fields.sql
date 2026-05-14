-- Phase 06: AI parser required period fields + approval-time change_type derivation
-- 1. Allow server-side neutral value `none`
-- 2. Stop trusting review.change_type during approval
-- 3. Compare against prior-year same event type for approved dividend_events

alter type public.dividend_change_type add value if not exists 'none';

create or replace function public.approve_dividend_review_for_reviewer(
  p_review_id     uuid,
  p_reviewer_id   uuid,
  p_override      jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_review                  record;
  v_existing_event          record;
  v_prior_year_event        record;
  v_event_id                uuid;
  v_status                  public.dividend_event_status;
  v_event_type              public.dividend_event_type;
  v_fiscal_year             int;
  v_expected_payment_year   int;
  v_expected_payment_month  int;
  v_fiscal_month            int;
  v_change_type             public.dividend_change_type;
  v_dividend_per_share      numeric;
  v_prev_per_share          numeric;
  v_record_date             date;
  v_ex_div_date             date;
  v_source_type             text;
  v_source_url              text;
  v_source_published_at     timestamptz;
  v_raw_payload             jsonb;
  v_notification_type       public.notification_type;
  v_notification_count      int := 0;
  v_is_upsert               boolean := false;
begin
  if not exists (
    select 1
    from public.profiles
    where id = p_reviewer_id
      and role = 'admin'
      and status = 'active'
  ) then
    raise exception 'Admin privileges required';
  end if;

  select
    dr.*,
    d.source_type  as disclosure_source_type,
    d.document_url as disclosure_document_url,
    d.published_at as disclosure_published_at,
    s.ticker       as stock_ticker,
    s.name         as stock_name
  into v_review
  from public.dividend_reviews dr
  left join public.disclosures d on d.id = dr.disclosure_id
  left join public.stocks s on s.id = dr.stock_id
  where dr.id = p_review_id;

  if not found then
    raise exception 'Dividend review not found';
  end if;

  if v_review.status not in ('pending', 'needs_manual_check') then
    raise exception 'Dividend review is not in an approvable state (status: %)', v_review.status;
  end if;

  if v_review.stock_id is null then
    raise exception 'Dividend review has no stock_id';
  end if;

  v_dividend_per_share := coalesce(
    (p_override->>'dividendPerShare')::numeric,
    v_review.extracted_dividend_per_share
  );
  v_prev_per_share := coalesce(
    (p_override->>'previousDividendPerShare')::numeric,
    v_review.previous_dividend_per_share
  );
  v_expected_payment_year := coalesce(
    (p_override->>'expectedPaymentYear')::int,
    v_review.extracted_payment_year
  );
  v_expected_payment_month := coalesce(
    (p_override->>'expectedPaymentMonth')::int,
    v_review.extracted_payment_month
  );
  v_fiscal_month := coalesce(
    (p_override->>'fiscalMonth')::int,
    v_review.extracted_fiscal_month
  );
  v_record_date := coalesce(
    nullif(p_override->>'recordDate', '')::date,
    v_review.extracted_record_date
  );
  v_ex_div_date := coalesce(
    nullif(p_override->>'exDividendDate', '')::date,
    v_review.extracted_ex_dividend_date
  );

  if v_dividend_per_share is not null and v_dividend_per_share < 0 then
    raise exception 'Override dividendPerShare must be non-negative';
  end if;
  if v_prev_per_share is not null and v_prev_per_share < 0 then
    raise exception 'Override previousDividendPerShare must be non-negative';
  end if;
  if v_expected_payment_month is not null and (v_expected_payment_month < 1 or v_expected_payment_month > 12) then
    raise exception 'Override expectedPaymentMonth must be between 1 and 12';
  end if;
  if v_fiscal_month is null or v_fiscal_month < 1 or v_fiscal_month > 12 then
    raise exception 'fiscal_month is required and must be between 1 and 12';
  end if;

  v_event_type := coalesce(
    (p_override->>'eventType')::public.dividend_event_type,
    v_review.event_type,
    nullif(v_review.raw_payload->>'eventType', '')::public.dividend_event_type
  );
  if v_event_type is null then
    raise exception 'Dividend review has no event_type';
  end if;

  v_status := coalesce(
    (p_override->>'status')::public.dividend_event_status,
    nullif(v_review.raw_payload->>'eventStatus', '')::public.dividend_event_status,
    'estimated'::public.dividend_event_status
  );

  v_fiscal_year := coalesce(
    (p_override->>'fiscalYear')::int,
    v_review.fiscal_year,
    nullif(v_review.raw_payload->>'fiscalYear', '')::int,
    extract(year from current_date)::int
  );

  if v_expected_payment_year is not null and (v_expected_payment_year < 2000 or v_expected_payment_year > 2100) then
    raise exception 'Override expectedPaymentYear must be between 2000 and 2100';
  end if;

  if v_event_type <> 'annual_total' and v_expected_payment_year is null then
    raise exception
      'expected_payment_year is required for user-facing events; provide override.expectedPaymentYear when the AI parser did not extract a year';
  end if;

  if v_dividend_per_share is null and v_status <> 'undecided' then
    raise exception 'Dividend amount is unknown but status is not undecided';
  end if;

  v_source_type         := v_review.disclosure_source_type;
  v_source_url          := v_review.disclosure_document_url;
  v_source_published_at := v_review.disclosure_published_at;

  v_raw_payload := coalesce(v_review.raw_payload, '{}'::jsonb);
  if p_override is not null and p_override <> '{}'::jsonb then
    v_raw_payload := v_raw_payload || jsonb_build_object('approvalOverride', p_override);
  end if;

  if p_override->>'changeType' is not null then
    v_change_type := (p_override->>'changeType')::public.dividend_change_type;
  else
    select de.*
    into v_prior_year_event
    from public.dividend_events de
    where de.stock_id = v_review.stock_id
      and de.review_status = 'approved'
      and de.event_type = v_event_type
      and de.fiscal_year = v_fiscal_year - 1
    order by de.updated_at desc
    limit 1;

    if v_dividend_per_share = 0 then
      v_change_type := 'no_dividend'::public.dividend_change_type;
    elsif v_prior_year_event.id is null then
      v_change_type := 'none'::public.dividend_change_type;
    elsif v_dividend_per_share > v_prior_year_event.dividend_per_share then
      v_change_type := 'increase'::public.dividend_change_type;
    elsif v_dividend_per_share < v_prior_year_event.dividend_per_share then
      v_change_type := 'decrease'::public.dividend_change_type;
    else
      v_change_type := 'none'::public.dividend_change_type;
    end if;
  end if;

  select id
  into v_existing_event
  from public.dividend_events
  where stock_id = v_review.stock_id
    and fiscal_year = v_fiscal_year
    and event_type = v_event_type
  limit 1;

  if found then
    v_is_upsert := true;
    v_event_id := v_existing_event.id;

    update public.dividend_events
    set
      dividend_per_share          = v_dividend_per_share,
      previous_dividend_per_share = coalesce(v_prev_per_share, dividend_per_share),
      expected_payment_year       = v_expected_payment_year,
      expected_payment_month      = v_expected_payment_month,
      fiscal_month                = v_fiscal_month,
      record_date                 = v_record_date,
      ex_dividend_date            = v_ex_div_date,
      status                      = v_status,
      change_type                 = v_change_type,
      source_type                 = v_source_type,
      source_url                  = v_source_url,
      source_published_at         = v_source_published_at,
      review_status               = 'approved',
      disclosure_id               = v_review.disclosure_id,
      raw_payload                 = v_raw_payload
    where id = v_event_id;
  else
    insert into public.dividend_events (
      stock_id,
      fiscal_year,
      event_type,
      dividend_per_share,
      previous_dividend_per_share,
      expected_payment_year,
      expected_payment_month,
      fiscal_month,
      record_date,
      ex_dividend_date,
      status,
      change_type,
      source_type,
      source_url,
      source_published_at,
      review_status,
      disclosure_id,
      raw_payload
    )
    values (
      v_review.stock_id,
      v_fiscal_year,
      v_event_type,
      v_dividend_per_share,
      coalesce(v_prev_per_share, v_prior_year_event.dividend_per_share),
      v_expected_payment_year,
      v_expected_payment_month,
      v_fiscal_month,
      v_record_date,
      v_ex_div_date,
      v_status,
      v_change_type,
      v_source_type,
      v_source_url,
      v_source_published_at,
      'approved',
      v_review.disclosure_id,
      v_raw_payload
    )
    returning id into v_event_id;
  end if;

  update public.dividend_reviews
  set
    status = 'approved',
    reviewed_at = now(),
    reviewed_by = p_reviewer_id
  where id = v_review.id;

  if v_existing_event.id is not null and v_change_type in (
    'increase'::public.dividend_change_type,
    'decrease'::public.dividend_change_type,
    'no_dividend'::public.dividend_change_type
  ) then
    v_notification_type := case v_change_type
      when 'increase'::public.dividend_change_type then 'dividend_increase'
      when 'decrease'::public.dividend_change_type then 'dividend_decrease'
      when 'no_dividend'::public.dividend_change_type then 'dividend_no_dividend'
      else null
    end;
  end if;

  return jsonb_build_object(
    'dividendEventId', v_event_id,
    'reviewId', v_review.id,
    'changeType', v_change_type,
    'expectedPaymentYear', v_expected_payment_year,
    'expectedPaymentMonth', v_expected_payment_month,
    'fiscalMonth', v_fiscal_month,
    'wasUpsert', v_is_upsert,
    'notificationsCreated', coalesce(v_notification_count, 0)
  );
end;
$$;

revoke all on function public.approve_dividend_review_for_reviewer(uuid, uuid, jsonb) from public;
grant execute on function public.approve_dividend_review_for_reviewer(uuid, uuid, jsonb) to service_role;

create or replace function public.approve_dividend_review(
  p_review_id uuid,
  p_override jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.approve_dividend_review_for_reviewer(
    p_review_id,
    auth.uid(),
    p_override
  );
end;
$$;

revoke all on function public.approve_dividend_review(uuid, jsonb) from public;
grant execute on function public.approve_dividend_review(uuid, jsonb) to authenticated;
