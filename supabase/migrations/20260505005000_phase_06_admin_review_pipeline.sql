-- Phase 06: Admin review and data pipeline foundation

create table if not exists public.disclosures (
  id uuid primary key default gen_random_uuid(),
  stock_id uuid references public.stocks(id),
  external_id text unique,
  source_type text not null,
  title text not null,
  document_url text,
  storage_path text,
  published_at timestamptz,
  collected_at timestamptz not null default now(),
  status text not null default 'collected',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.dividend_reviews (
  id uuid primary key default gen_random_uuid(),
  stock_id uuid references public.stocks(id),
  disclosure_id uuid references public.disclosures(id),
  extracted_dividend_per_share numeric(18,2),
  previous_dividend_per_share numeric(18,2),
  extracted_payment_date date,
  extracted_payment_month int check (extracted_payment_month between 1 and 12),
  confidence_score numeric(5,4),
  status text not null default 'pending',
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  rejection_reason text,
  created_dividend_event_id uuid references public.dividend_events(id),
  raw_payload jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  status text not null default 'pending',
  payload jsonb not null default '{}',
  run_after timestamptz not null default now(),
  attempts int not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_disclosures_updated_at on public.disclosures;
create trigger set_disclosures_updated_at
before update on public.disclosures
for each row execute function public.set_updated_at();

drop trigger if exists set_dividend_reviews_updated_at on public.dividend_reviews;
create trigger set_dividend_reviews_updated_at
before update on public.dividend_reviews
for each row execute function public.set_updated_at();

drop trigger if exists set_jobs_updated_at on public.jobs;
create trigger set_jobs_updated_at
before update on public.jobs
for each row execute function public.set_updated_at();

alter table public.disclosures enable row level security;
alter table public.dividend_reviews enable row level security;
alter table public.jobs enable row level security;

drop policy if exists "Admins can manage disclosures" on public.disclosures;
create policy "Admins can manage disclosures"
on public.disclosures for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins can read dividend reviews" on public.dividend_reviews;
create policy "Admins can read dividend reviews"
on public.dividend_reviews for select
to authenticated
using (public.is_admin());

drop policy if exists "Admins can insert dividend reviews" on public.dividend_reviews;
create policy "Admins can insert dividend reviews"
on public.dividend_reviews for insert
to authenticated
with check (public.is_admin());

drop policy if exists "Admins can update dividend reviews" on public.dividend_reviews;
create policy "Admins can update dividend reviews"
on public.dividend_reviews for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins can read jobs" on public.jobs;
create policy "Admins can read jobs"
on public.jobs for select
to authenticated
using (public.is_admin());

drop policy if exists "Admins can update jobs" on public.jobs;
create policy "Admins can update jobs"
on public.jobs for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins can delete jobs" on public.jobs;
create policy "Admins can delete jobs"
on public.jobs for delete
to authenticated
using (public.is_admin());

revoke all on public.disclosures from authenticated;
grant select, insert, update, delete on public.disclosures to authenticated;

revoke all on public.dividend_reviews from authenticated;
grant select, insert, update on public.dividend_reviews to authenticated;

revoke all on public.jobs from authenticated;
grant select, update, delete on public.jobs to authenticated;

create index if not exists idx_disclosures_stock_published on public.disclosures(stock_id, published_at desc);
create index if not exists idx_disclosures_external_id on public.disclosures(external_id);
create index if not exists idx_dividend_reviews_status on public.dividend_reviews(status);
create index if not exists idx_dividend_reviews_stock on public.dividend_reviews(stock_id);
create index if not exists idx_jobs_status_run_after on public.jobs(status, run_after);

insert into storage.buckets (id, name, public)
values ('disclosures', 'disclosures', false)
on conflict (id) do update set public = false;

create or replace function public.assert_admin()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if not public.is_admin() then
    raise exception 'Admin privileges required';
  end if;

  return v_user_id;
end;
$$;

revoke all on function public.assert_admin() from public;
grant execute on function public.assert_admin() to authenticated;

create or replace function public.derive_dividend_change_type(
  p_current numeric,
  p_previous numeric,
  p_raw_payload jsonb default '{}'::jsonb
)
returns public.dividend_change_type
language plpgsql
immutable
set search_path = public
as $$
declare
  v_kind text := coalesce(p_raw_payload->>'changeType', p_raw_payload->>'dividendKind');
begin
  if v_kind in ('special', 'special_dividend') then
    return 'special'::public.dividend_change_type;
  elsif v_kind in ('commemorative', 'commemorative_dividend') then
    return 'commemorative'::public.dividend_change_type;
  elsif v_kind = 'resumed' then
    return 'resumed'::public.dividend_change_type;
  elsif v_kind in ('no_dividend', 'noDividend') then
    return 'no_dividend'::public.dividend_change_type;
  end if;

  if p_current is null then
    return 'unchanged'::public.dividend_change_type;
  elsif p_current = 0 then
    return 'no_dividend'::public.dividend_change_type;
  elsif p_previous is null then
    return 'unchanged'::public.dividend_change_type;
  elsif p_previous = 0 and p_current > 0 then
    return 'resumed'::public.dividend_change_type;
  elsif p_current > p_previous then
    return 'increase'::public.dividend_change_type;
  elsif p_current < p_previous then
    return 'decrease'::public.dividend_change_type;
  else
    return 'unchanged'::public.dividend_change_type;
  end if;
end;
$$;

revoke all on function public.derive_dividend_change_type(numeric, numeric, jsonb) from public;
grant execute on function public.derive_dividend_change_type(numeric, numeric, jsonb) to authenticated;

create or replace function public.approve_dividend_review(
  p_review_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reviewer_id uuid;
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
  v_reviewer_id := public.assert_admin();

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
    reviewed_by = v_reviewer_id,
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

revoke all on function public.approve_dividend_review(uuid) from public;
grant execute on function public.approve_dividend_review(uuid) to authenticated;

create or replace function public.reject_dividend_review(
  p_review_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reviewer_id uuid;
begin
  v_reviewer_id := public.assert_admin();

  update public.dividend_reviews
  set
    status = 'rejected',
    reviewed_by = v_reviewer_id,
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

revoke all on function public.reject_dividend_review(uuid, text) from public;
grant execute on function public.reject_dividend_review(uuid, text) to authenticated;

create or replace function public.collect_disclosure_candidate(
  p_candidate jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing_id uuid;
  v_stock_id uuid;
  v_disclosure_id uuid;
  v_external_id text := coalesce(nullif(p_candidate->>'externalId', ''), nullif(p_candidate->>'external_id', ''));
  v_ticker text := nullif(p_candidate->>'ticker', '');
begin
  perform public.assert_admin();

  if v_external_id is null then
    raise exception 'externalId is required';
  end if;

  select id into v_existing_id
  from public.disclosures
  where external_id = v_external_id;

  if v_existing_id is not null then
    return jsonb_build_object('disclosureId', v_existing_id, 'inserted', false);
  end if;

  if v_ticker is not null then
    select id into v_stock_id from public.stocks where ticker = v_ticker;
  end if;

  insert into public.disclosures (
    stock_id,
    external_id,
    source_type,
    title,
    document_url,
    published_at,
    status
  ) values (
    v_stock_id,
    v_external_id,
    coalesce(nullif(p_candidate->>'sourceType', ''), 'tdnet'),
    coalesce(nullif(p_candidate->>'title', ''), 'Untitled disclosure'),
    nullif(p_candidate->>'documentUrl', ''),
    nullif(p_candidate->>'publishedAt', '')::timestamptz,
    'collected'
  )
  returning id into v_disclosure_id;

  insert into public.jobs (type, payload)
  values ('parse-disclosure', jsonb_build_object('disclosureId', v_disclosure_id));

  return jsonb_build_object('disclosureId', v_disclosure_id, 'inserted', true);
end;
$$;

revoke all on function public.collect_disclosure_candidate(jsonb) from public;
grant execute on function public.collect_disclosure_candidate(jsonb) to authenticated;

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

  insert into public.dividend_reviews (
    stock_id,
    disclosure_id,
    extracted_dividend_per_share,
    confidence_score,
    status,
    raw_payload
  ) values (
    v_disclosure.stock_id,
    v_disclosure.id,
    v_amount,
    case when v_amount is not null then 0.5000 else 0.1000 end,
    'pending',
    jsonb_build_object(
      'parser', 'phase06-minimal',
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
