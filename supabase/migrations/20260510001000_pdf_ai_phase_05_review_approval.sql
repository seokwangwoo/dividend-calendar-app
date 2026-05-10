-- Phase 05: Review Approval Pipeline
-- Extends approval and rejection to support:
--   * Overrides (amounts, dates, payment_year, event_type, status, change_type)
--   * payment_year derivation from expected_payment_date and required-confirmation
--     when only expected_payment_month is known
--   * Accepting pending OR needs_manual_check reviews
--   * Upsert semantics: update existing event when stock_id/fiscal_year/event_type match
--   * disclosure_id and raw_payload breakdown metadata stored on approved events
--   * Notification deduplication by dividend_event_id to prevent double-notifications

-- ---------------------------------------------------------------------------
-- Helper: derive_payment_year_from_review
-- Derives payment_year from a full expected_payment_date when available.
-- Returns NULL when only expected_payment_month is known so callers can
-- require an explicit admin override.
-- ---------------------------------------------------------------------------
create or replace function public.derive_payment_year_from_review(
  p_expected_payment_date date,
  p_override_payment_year int
)
returns int
language plpgsql
immutable
set search_path = public
as $$
begin
  -- Override always wins when provided
  if p_override_payment_year is not null then
    return p_override_payment_year;
  end if;
  -- Full date present: extract year
  if p_expected_payment_date is not null then
    return extract(year from p_expected_payment_date)::int;
  end if;
  -- No full date and no override: caller must require confirmation
  return null;
end;
$$;

revoke all on function public.derive_payment_year_from_review(date, int) from public;
grant execute on function public.derive_payment_year_from_review(date, int) to service_role;

-- ---------------------------------------------------------------------------
-- Main: approve_dividend_review_for_reviewer  (extended, replaces Phase 06 version)
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
  v_review                record;
  v_existing_event        record;
  v_event_id              uuid;
  v_status                public.dividend_event_status;
  v_event_type            public.dividend_event_type;
  v_fiscal_year           int;
  v_payment_year          int;
  v_change_type           public.dividend_change_type;
  v_dividend_per_share    numeric;
  v_prev_per_share        numeric;
  v_payment_date          date;
  v_payment_month         int;
  v_record_date           date;
  v_ex_div_date           date;
  v_source_type           text;
  v_source_url            text;
  v_source_published_at   timestamptz;
  v_raw_payload           jsonb;
  v_notification_type     public.notification_type;
  v_notification_count    int := 0;
  v_is_upsert             boolean := false;
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
  --   dividendPerShare, previousDividendPerShare, expectedPaymentDate,
  --   expectedPaymentMonth, recordDate, exDividendDate, paymentYear,
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
  v_payment_date := coalesce(
    nullif(p_override->>'expectedPaymentDate', '')::date,
    v_review.extracted_payment_date
  );
  v_payment_month := coalesce(
    (p_override->>'expectedPaymentMonth')::int,
    v_review.extracted_payment_month
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
  if v_payment_month is not null and (v_payment_month < 1 or v_payment_month > 12) then
    raise exception 'Override expectedPaymentMonth must be between 1 and 12';
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
    extract(year from coalesce(v_payment_date, current_date))::int
  );

  -- payment_year: derive from full date, then from override, else require confirmation
  v_payment_year := public.derive_payment_year_from_review(
    v_payment_date,
    (p_override->>'paymentYear')::int
  );

  -- Validate override: payment_year range if provided
  if v_payment_year is not null and (v_payment_year < 2000 or v_payment_year > 2100) then
    raise exception 'Override paymentYear must be between 2000 and 2100';
  end if;

  -- Require payment_year for non-annual_total events (annual_total is reference-only)
  if v_event_type <> 'annual_total' and v_payment_year is null then
    raise exception
      'payment_year is required for user-facing events; provide override.paymentYear when only expected_payment_month is known';
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
  -- (source_published_at used as tiebreaker context but not part of PK)
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
      expected_payment_date        = v_payment_date,
      expected_payment_month       = v_payment_month,
      record_date                  = v_record_date,
      ex_dividend_date             = v_ex_div_date,
      payment_year                 = v_payment_year,
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
      payment_year,
      event_type,
      dividend_per_share,
      previous_dividend_per_share,
      expected_payment_date,
      expected_payment_month,
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
      v_payment_year,
      v_event_type,
      v_dividend_per_share,
      v_prev_per_share,
      v_payment_date,
      v_payment_month,
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
    status                   = 'approved',
    reviewed_by              = p_reviewer_id,
    reviewed_at              = now(),
    created_dividend_event_id = v_event_id
  where id = p_review_id;

  -- ---------------------------------------------------------------------------
  -- Notification handoff
  -- Eligible change types: increase, decrease, no_dividend, resumed, special, commemorative
  -- Exclude: unchanged, unknown, annual_total reference-only approvals
  -- Deduplicate by (user_id, stock_id, type, dividend_event_id) via payload
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

    -- Insert deduplicated notifications (skip if notification for same event already exists)
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
      -- Deduplication: skip if a notification for this event already exists for this user
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
    'paymentYear',          v_payment_year,
    'isUpsert',             v_is_upsert,
    'notificationCount',    v_notification_count
  );
end;
$$;

revoke all on function public.approve_dividend_review_for_reviewer(uuid, uuid, jsonb) from public;
grant execute on function public.approve_dividend_review_for_reviewer(uuid, uuid, jsonb) to service_role;

-- Drop the old 2-argument variant that may exist from Phase 06
drop function if exists public.approve_dividend_review_for_reviewer(uuid, uuid);

-- ---------------------------------------------------------------------------
-- Public admin RPC: approve_dividend_review (uses auth.uid())
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

-- Drop old 1-argument variant that may exist from Phase 06
drop function if exists public.approve_dividend_review(uuid);

-- ---------------------------------------------------------------------------
-- Rejection: accept pending OR needs_manual_check reviews
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

-- ---------------------------------------------------------------------------
-- Notification deduplication index for approval idempotency
-- ---------------------------------------------------------------------------
create index if not exists idx_notifications_event_dedup
  on public.notifications ((payload->>'dividendEventId'), user_id, type);
