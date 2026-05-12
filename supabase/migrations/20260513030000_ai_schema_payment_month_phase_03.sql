-- Phase 03: Approval Pipeline and Server Logic
-- Updates approve_dividend_review_for_reviewer to use expected_payment_year/month and fiscal_month.
-- Drops derive_payment_year_from_review permanently.

-- ---------------------------------------------------------------------------
-- 1. Drop the obsolete helper (idempotent, already dropped in Phase 01)
-- ---------------------------------------------------------------------------
drop function if exists public.derive_payment_year_from_review(date, int);

-- ---------------------------------------------------------------------------
-- 2. Main: approve_dividend_review_for_reviewer (replaces Phase 05 version)
-- ---------------------------------------------------------------------------
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
  -- Verify caller is active admin
  if not exists (
    select 1
    from public.profiles
    where id = p_reviewer_id
      and role = 'admin'
      and status = 'active'
  ) then
    raise exception 'Admin privileges required';
  end if;

  -- Load review row with related disclosure and stock data
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
  left join public.stocks      s on s.id = dr.stock_id
  where dr.id = p_review_id;

  if not found then
    raise exception 'Dividend review not found';
  end if;

  -- Accept pending or needs_manual_check; reject already-decided reviews
  if v_review.status not in ('pending', 'needs_manual_check') then
    raise exception 'Dividend review is not in an approvable state (status: %)', v_review.status;
  end if;

  if v_review.stock_id is null then
    raise exception 'Dividend review has no stock_id';
  end if;

  -- ---------------------------------------------------------------------------
  -- Resolve override fields
  -- Override keys (camelCase for JSON compatibility):
  --   dividendPerShare, previousDividendPerShare, expectedPaymentYear,
  --   expectedPaymentMonth, fiscalMonth, recordDate, exDividendDate,
  --   eventType, status, changeType
  -- ---------------------------------------------------------------------------
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
  -- ex_dividend_date: accept only if explicitly present; never derive from record_date
  v_ex_div_date := coalesce(
    nullif(p_override->>'exDividendDate', '')::date,
    v_review.extracted_ex_dividend_date
  );

  -- Validate override: non-negative dividend amounts
  if v_dividend_per_share is not null and v_dividend_per_share < 0 then
    raise exception 'Override dividendPerShare must be non-negative';
  end if;
  if v_prev_per_share is not null and v_prev_per_share < 0 then
    raise exception 'Override previousDividendPerShare must be non-negative';
  end if;

  -- Validate override: payment month range
  if v_expected_payment_month is not null and (v_expected_payment_month < 1 or v_expected_payment_month > 12) then
    raise exception 'Override expectedPaymentMonth must be between 1 and 12';
  end if;

  -- Validate override: fiscal month range
  if v_fiscal_month is not null and (v_fiscal_month < 1 or v_fiscal_month > 12) then
    raise exception 'Override fiscalMonth must be between 1 and 12';
  end if;

  -- Event type from override or review raw_payload
  v_event_type := coalesce(
    nullif(p_override->>'eventType', '')::public.dividend_event_type,
    v_review.event_type,
    nullif(v_review.raw_payload->>'eventType', '')::public.dividend_event_type,
    'year_end'::public.dividend_event_type
  );

  -- Status from override or review raw_payload
  v_status := coalesce(
    nullif(p_override->>'status', '')::public.dividend_event_status,
    nullif(v_review.raw_payload->>'eventStatus', '')::public.dividend_event_status,
    'estimated'::public.dividend_event_status
  );

  -- Fiscal year from override or review
  v_fiscal_year := coalesce(
    (p_override->>'fiscalYear')::int,
    v_review.fiscal_year,
    nullif(v_review.raw_payload->>'fiscalYear', '')::int,
    extract(year from current_date)::int
  );

  -- Validate override: expected_payment_year range if provided
  if v_expected_payment_year is not null and (v_expected_payment_year < 2000 or v_expected_payment_year > 2100) then
    raise exception 'Override expectedPaymentYear must be between 2000 and 2100';
  end if;

  -- Require expected_payment_year for non-annual_total events
  if v_event_type <> 'annual_total' and v_expected_payment_year is null then
    raise exception
      'expected_payment_year is required for user-facing events; provide override.expectedPaymentYear when the AI parser did not extract a year';
  end if;

  -- Validate dividend amount: unknown amounts only allowed when status = 'undecided'
  if v_dividend_per_share is null and v_status <> 'undecided' then
    raise exception 'Dividend amount is unknown but status is not undecided';
  end if;

  -- Source info from disclosure
  v_source_type         := v_review.disclosure_source_type;
  v_source_url          := v_review.disclosure_document_url;
  v_source_published_at := v_review.disclosure_published_at;

  -- Preserve raw_payload from review and merge any override-adjusted fields for audit
  v_raw_payload := v_review.raw_payload;
  if p_override is not null and p_override <> '{}'::jsonb then
    v_raw_payload := v_raw_payload || jsonb_build_object('approvalOverride', p_override);
  end if;

  -- Derive or override change_type
  if p_override->>'changeType' is not null then
    v_change_type := (p_override->>'changeType')::public.dividend_change_type;
  elsif v_review.change_type is not null then
    v_change_type := v_review.change_type;
  else
    -- Fall back to computing from amounts
    select de.dividend_per_share
    into v_existing_event
    from public.dividend_events de
    where de.stock_id = v_review.stock_id
      and de.review_status = 'approved'
      and de.event_type = v_event_type
    order by de.fiscal_year desc, de.updated_at desc
    limit 1;

    v_change_type := public.derive_dividend_change_type(
      v_dividend_per_share,
      coalesce(v_prev_per_share, v_existing_event.dividend_per_share),
      v_review.raw_payload
    );
  end if;

  -- ---------------------------------------------------------------------------
  -- Upsert: match existing event by stock_id + fiscal_year + event_type
  -- ---------------------------------------------------------------------------
  select id
  into v_existing_event
  from public.dividend_events
  where stock_id    = v_review.stock_id
    and fiscal_year = v_fiscal_year
    and event_type  = v_event_type
  limit 1;

  if found then
    -- Update existing event
    v_is_upsert := true;
    v_event_id := v_existing_event.id;

    update public.dividend_events
    set
      dividend_per_share           = v_dividend_per_share,
      previous_dividend_per_share  = coalesce(v_prev_per_share, dividend_per_share),
      expected_payment_year        = v_expected_payment_year,
      expected_payment_month       = v_expected_payment_month,
      fiscal_month                 = v_fiscal_month,
      record_date                  = v_record_date,
      ex_dividend_date             = v_ex_div_date,
      status                       = v_status,
      change_type                  = v_change_type,
      source_type                  = v_source_type,
      source_url                   = v_source_url,
      source_published_at          = v_source_published_at,
      review_status                = 'approved',
      disclosure_id                = v_review.disclosure_id,
      raw_payload                  = v_raw_payload
    where id = v_event_id;
  else
    -- Insert new event
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
    ) values (
      v_review.stock_id,
      v_fiscal_year,
      v_event_type,
      v_dividend_per_share,
      v_prev_per_share,
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

  -- Update review state
  update public.dividend_reviews
  set
    status                    = 'approved',
    reviewed_by               = p_reviewer_id,
    reviewed_at               = now(),
    created_dividend_event_id = v_event_id
  where id = p_review_id;

  -- ---------------------------------------------------------------------------
  -- Notification handoff
  -- ---------------------------------------------------------------------------
  if v_event_type <> 'annual_total'
    and v_change_type in (
      'increase', 'decrease', 'no_dividend', 'resumed', 'special', 'commemorative'
    )
  then
    v_notification_type := case v_change_type
      when 'increase'      then 'dividend_increase'::public.notification_type
      when 'decrease'      then 'dividend_decrease'::public.notification_type
      when 'no_dividend'   then 'no_dividend'::public.notification_type
      when 'special'       then 'special_dividend'::public.notification_type
      when 'commemorative' then 'special_dividend'::public.notification_type
      else                      'data_update'::public.notification_type
    end;

    insert into public.notifications (
      user_id,
      stock_id,
      type,
      title,
      body,
      payload,
      status,
      channel
    )
    select distinct
      h.user_id,
      v_review.stock_id,
      v_notification_type,
      case v_change_type
        when 'increase'      then '配当予想が増額されました'
        when 'decrease'      then '配当予想が減額されました'
        when 'no_dividend'   then '無配情報が承認されました'
        when 'special'       then '特別配当が承認されました'
        when 'commemorative' then '記念配当が承認されました'
        when 'resumed'       then '配当が再開されました'
        else                      '配当情報が更新されました'
      end,
      concat_ws(E'\n',
        v_review.stock_name || 'の配当情報が承認されました。',
        'これは売買を推奨するものではありません。'
      ),
      jsonb_build_object(
        'changeType',                   v_change_type,
        'stockTicker',                  v_review.stock_ticker,
        'dividendPerShare',             v_dividend_per_share,
        'previousDividendPerShare',     v_prev_per_share,
        'dividendEventId',              v_event_id
      ),
      'unread'::public.notification_status,
      'in_app'::public.notification_channel
    from public.holdings h
    join public.user_settings us on us.user_id = h.user_id
    where h.stock_id  = v_review.stock_id
      and h.deleted_at is null
      and us.in_app_notification_enabled
      and not exists (
        select 1
        from public.notifications n
        where n.user_id   = h.user_id
          and n.stock_id  = v_review.stock_id
          and n.type      = v_notification_type
          and (n.payload->>'dividendEventId')::uuid = v_event_id
      );

    get diagnostics v_notification_count = row_count;
  end if;

  return jsonb_build_object(
    'reviewId',             p_review_id,
    'dividendEventId',      v_event_id,
    'changeType',           v_change_type,
    'expectedPaymentYear',  v_expected_payment_year,
    'isUpsert',             v_is_upsert,
    'notificationCount',    v_notification_count
  );
end;
$$;

revoke all on function public.approve_dividend_review_for_reviewer(uuid, uuid, jsonb) from public;
grant execute on function public.approve_dividend_review_for_reviewer(uuid, uuid, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- 3. Public admin RPC: approve_dividend_review (uses auth.uid())
-- ---------------------------------------------------------------------------
create or replace function public.approve_dividend_review(
  p_review_id uuid,
  p_override  jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.approve_dividend_review_for_reviewer(
    p_review_id,
    public.assert_admin(),
    p_override
  );
end;
$$;

revoke all on function public.approve_dividend_review(uuid, jsonb) from public;
grant execute on function public.approve_dividend_review(uuid, jsonb) to authenticated;

-- Drop old 1-argument variant that may exist from earlier phases
drop function if exists public.approve_dividend_review(uuid);

-- Drop old 2-argument reviewer variant that may exist from earlier phases
drop function if exists public.approve_dividend_review_for_reviewer(uuid, uuid);

-- ---------------------------------------------------------------------------
-- 4. Rejection functions: verify they do not reference old columns
--     (they don't, but recreate to be safe and drop old variants)
-- ---------------------------------------------------------------------------
create or replace function public.reject_dividend_review_for_reviewer(
  p_review_id   uuid,
  p_reason      text,
  p_reviewer_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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

  update public.dividend_reviews
  set
    status           = 'rejected',
    reviewed_by      = p_reviewer_id,
    reviewed_at      = now(),
    rejection_reason = nullif(trim(p_reason), '')
  where id = p_review_id
    and status in ('pending', 'needs_manual_check');

  if not found then
    raise exception 'Approvable dividend review not found (must be pending or needs_manual_check)';
  end if;

  return jsonb_build_object('reviewId', p_review_id, 'status', 'rejected');
end;
$$;

revoke all on function public.reject_dividend_review_for_reviewer(uuid, text, uuid) from public;
grant execute on function public.reject_dividend_review_for_reviewer(uuid, text, uuid) to service_role;

create or replace function public.reject_dividend_review(
  p_review_id uuid,
  p_reason    text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.reject_dividend_review_for_reviewer(
    p_review_id,
    p_reason,
    public.assert_admin()
  );
end;
$$;

revoke all on function public.reject_dividend_review(uuid, text) from public;
grant execute on function public.reject_dividend_review(uuid, text) to authenticated;
