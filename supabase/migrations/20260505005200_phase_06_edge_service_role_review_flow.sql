-- Phase 06: service-role review helpers for Edge Function wrappers.

create or replace function public.approve_dividend_review_for_reviewer(
  p_review_id uuid,
  p_reviewer_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_review record;
  v_latest record;
  v_event_id uuid;
  v_status public.dividend_event_status;
  v_event_type public.dividend_event_type;
  v_fiscal_year int;
  v_change_type public.dividend_change_type;
  v_notification_type public.notification_type;
  v_notification_count int := 0;
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
    d.source_type as disclosure_source_type,
    d.document_url as disclosure_document_url,
    d.published_at as disclosure_published_at,
    s.ticker as stock_ticker,
    s.name as stock_name
  into v_review
  from public.dividend_reviews dr
  left join public.disclosures d on d.id = dr.disclosure_id
  left join public.stocks s on s.id = dr.stock_id
  where dr.id = p_review_id;

  if not found then
    raise exception 'Dividend review not found';
  end if;

  if v_review.status <> 'pending' then
    raise exception 'Dividend review is not pending';
  end if;

  if v_review.stock_id is null then
    raise exception 'Dividend review has no stock_id';
  end if;

  if v_review.extracted_dividend_per_share is null
    and nullif(v_review.raw_payload->>'eventStatus', '') is distinct from 'undecided'
  then
    raise exception 'Dividend amount is unknown but status is not undecided';
  end if;

  v_status := coalesce(
    nullif(v_review.raw_payload->>'eventStatus', '')::public.dividend_event_status,
    'estimated'::public.dividend_event_status
  );
  v_event_type := coalesce(
    nullif(v_review.raw_payload->>'eventType', '')::public.dividend_event_type,
    'year_end'::public.dividend_event_type
  );
  v_fiscal_year := coalesce(
    nullif(v_review.raw_payload->>'fiscalYear', '')::int,
    extract(year from coalesce(v_review.extracted_payment_date, current_date))::int
  );

  select de.dividend_per_share, de.id
  into v_latest
  from public.dividend_events de
  where de.stock_id = v_review.stock_id
    and de.review_status = 'approved'
    and de.event_type = v_event_type
  order by de.fiscal_year desc, de.updated_at desc
  limit 1;

  v_change_type := public.derive_dividend_change_type(
    v_review.extracted_dividend_per_share,
    coalesce(v_review.previous_dividend_per_share, v_latest.dividend_per_share),
    v_review.raw_payload
  );

  insert into public.dividend_events (
    stock_id,
    fiscal_year,
    event_type,
    dividend_per_share,
    previous_dividend_per_share,
    expected_payment_date,
    expected_payment_month,
    status,
    change_type,
    source_type,
    source_url,
    source_published_at,
    review_status
  ) values (
    v_review.stock_id,
    v_fiscal_year,
    v_event_type,
    v_review.extracted_dividend_per_share,
    coalesce(v_review.previous_dividend_per_share, v_latest.dividend_per_share),
    v_review.extracted_payment_date,
    v_review.extracted_payment_month,
    v_status,
    v_change_type,
    v_review.disclosure_source_type,
    v_review.disclosure_document_url,
    v_review.disclosure_published_at,
    'approved'
  )
  returning id into v_event_id;

  update public.dividend_reviews
  set
    status = 'approved',
    reviewed_by = p_reviewer_id,
    reviewed_at = now(),
    created_dividend_event_id = v_event_id
  where id = p_review_id;

  if v_latest.id is not null and v_change_type in (
    'increase',
    'decrease',
    'no_dividend',
    'resumed',
    'special',
    'commemorative'
  ) then
    v_notification_type := case v_change_type
      when 'increase' then 'dividend_increase'::public.notification_type
      when 'decrease' then 'dividend_decrease'::public.notification_type
      when 'no_dividend' then 'no_dividend'::public.notification_type
      when 'special' then 'special_dividend'::public.notification_type
      else 'data_update'::public.notification_type
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
        when 'increase' then '配当予想が増額されました'
        when 'decrease' then '配当予想が減額されました'
        when 'no_dividend' then '無配情報が承認されました'
        when 'special' then '特別配当が承認されました'
        when 'commemorative' then '記念配当が承認されました'
        else '配当情報が更新されました'
      end,
      concat_ws(E'\n',
        v_review.stock_name || 'の配当情報が承認されました。',
        'これは売買を推奨するものではありません。'
      ),
      jsonb_build_object(
        'changeType', v_change_type,
        'stockTicker', v_review.stock_ticker,
        'dividendPerShare', v_review.extracted_dividend_per_share,
        'previousDividendPerShare', coalesce(v_review.previous_dividend_per_share, v_latest.dividend_per_share),
        'dividendEventId', v_event_id
      ),
      'unread'::public.notification_status,
      'in_app'::public.notification_channel
    from public.holdings h
    join public.user_settings us on us.user_id = h.user_id
    where h.stock_id = v_review.stock_id
      and h.deleted_at is null
      and us.in_app_notification_enabled;

    get diagnostics v_notification_count = row_count;
  end if;

  return jsonb_build_object(
    'reviewId', p_review_id,
    'dividendEventId', v_event_id,
    'changeType', v_change_type,
    'notificationCount', v_notification_count
  );
end;
$$;

revoke all on function public.approve_dividend_review_for_reviewer(uuid, uuid) from public;

create or replace function public.approve_dividend_review(
  p_review_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.approve_dividend_review_for_reviewer(
    p_review_id,
    public.assert_admin()
  );
end;
$$;

revoke all on function public.approve_dividend_review(uuid) from public;
grant execute on function public.approve_dividend_review(uuid) to authenticated;

create or replace function public.reject_dividend_review_for_reviewer(
  p_review_id uuid,
  p_reason text,
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
    status = 'rejected',
    reviewed_by = p_reviewer_id,
    reviewed_at = now(),
    rejection_reason = nullif(trim(p_reason), '')
  where id = p_review_id
    and status = 'pending';

  if not found then
    raise exception 'Pending dividend review not found';
  end if;

  return jsonb_build_object('reviewId', p_review_id, 'status', 'rejected');
end;
$$;

revoke all on function public.reject_dividend_review_for_reviewer(uuid, text, uuid) from public;

create or replace function public.reject_dividend_review(
  p_review_id uuid,
  p_reason text
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
