-- Phase 03: Price Refresh and Alert Reliability

-- 1. Add stock_price_refresh_logs table

create table public.stock_price_refresh_logs (
  id uuid primary key default gen_random_uuid(),
  stock_id uuid not null references public.stocks(id) on delete cascade,
  status text not null check (status in ('success', 'failure')),
  old_price numeric,
  new_price numeric,
  error_message text,
  created_at timestamptz not null default now()
);

comment on table public.stock_price_refresh_logs is 'Daily stock price refresh audit log';

-- RLS: only admins can read logs; service role can insert
alter table public.stock_price_refresh_logs enable row level security;

create policy "Admin can read refresh logs"
  on public.stock_price_refresh_logs
  for select
  to authenticated
  using (public.is_admin());

-- 2. Add last_condition_met to notification_rules

alter table public.notification_rules
  add column if not exists last_condition_met boolean not null default false;

comment on column public.notification_rules.last_condition_met is 'Tracks whether the rule condition was met on the last evaluation for state-transition deduplication';

-- 3. Update evaluate_notification_rules to support stale price suppression,
--    state-transition deduplication, and holder-only dividend change alerts.

-- First, drop the old function so we can replace the signature body.
drop function if exists public.evaluate_notification_rules(uuid, uuid, boolean);

create or replace function public.evaluate_notification_rules(
  p_stock_id uuid default null,
  p_user_id uuid default null,
  p_dry_run boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_stale_threshold_hours int := 48;
  v_rule record;
  v_account_type public.account_type;
  v_before_tax_yield numeric;
  v_evaluated_yield numeric;
  v_condition_met boolean;
  v_channels public.notification_channel[];
  v_payload jsonb;
  v_body text;
  v_evaluated int := 0;
  v_matched int := 0;
  v_inserted int := 0;
  v_deduplicated int := 0;
  v_skipped_stale int := 0;
  v_results jsonb := '[]'::jsonb;
begin
  if auth.uid() is not null and not public.is_admin() then
    if p_user_id is not null and p_user_id <> auth.uid() then
      raise exception 'Cannot evaluate notification rules for another user';
    end if;
    p_user_id := auth.uid();
  end if;

  for v_rule in
    select
      nr.*,
      s.ticker as stock_ticker,
      s.name as stock_name,
      s.current_price,
      s.price_updated_at,
      s.expected_annual_dividend_per_share,
      coalesce(us.in_app_notification_enabled, true) as in_app_notification_enabled,
      coalesce(us.email_notification_enabled, true) as email_notification_enabled
    from public.notification_rules nr
    join public.stocks s on s.id = nr.stock_id
    left join public.user_settings us on us.user_id = nr.user_id
    where nr.status = 'active'
      and (p_stock_id is null or nr.stock_id = p_stock_id)
      and (p_user_id is null or nr.user_id = p_user_id)
  loop
    v_evaluated := v_evaluated + 1;

    -- Stale price suppression for yield rules
    if v_rule.price_updated_at is null
       or v_rule.price_updated_at < v_now - make_interval(hours => v_stale_threshold_hours)
    then
      v_skipped_stale := v_skipped_stale + 1;
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'ruleId', v_rule.id,
        'status', 'skipped_stale_price'
      ));
      continue;
    end if;

    if v_rule.expected_annual_dividend_per_share is null
      or v_rule.current_price is null
      or v_rule.current_price <= 0
    then
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'ruleId', v_rule.id,
        'status', 'skipped_missing_yield'
      ));
      continue;
    end if;

    select h.account_type
    into v_account_type
    from public.holdings h
    where h.user_id = v_rule.user_id
      and h.stock_id = v_rule.stock_id
      and h.deleted_at is null
    order by h.quantity desc, h.created_at asc
    limit 1;

    v_account_type := coalesce(v_account_type, 'tokutei'::public.account_type);
    v_before_tax_yield :=
      (v_rule.expected_annual_dividend_per_share / v_rule.current_price) * 100;
    v_evaluated_yield := case
      when v_rule.basis = 'before_tax_yield' then v_before_tax_yield
      when v_account_type = 'nisa' then v_before_tax_yield
      else v_before_tax_yield * (1 - 0.20315)
    end;

    v_condition_met :=
      (v_rule.operator = 'gte' and v_evaluated_yield >= v_rule.target_yield)
      or (v_rule.operator = 'lte' and v_evaluated_yield <= v_rule.target_yield);

    -- State-transition deduplication
    if v_rule.last_condition_met and v_condition_met then
      v_deduplicated := v_deduplicated + 1;
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'ruleId', v_rule.id,
        'status', 'deduplicated_state_transition',
        'evaluatedYield', round(v_evaluated_yield, 4)
      ));
      continue;
    end if;

    -- Update last_condition_met for true->false and false->false transitions
    if not v_condition_met then
      if v_rule.last_condition_met then
        update public.notification_rules
        set last_condition_met = false,
            updated_at = v_now
        where id = v_rule.id;
      end if;
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'ruleId', v_rule.id,
        'status', 'not_matched',
        'evaluatedYield', round(v_evaluated_yield, 4)
      ));
      continue;
    end if;

    -- From here: condition is met and last_condition_met was false
    v_matched := v_matched + 1;

    if p_dry_run then
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'ruleId', v_rule.id,
        'status', 'matched_dry_run',
        'evaluatedYield', round(v_evaluated_yield, 4)
      ));
      continue;
    end if;

    v_channels := array[]::public.notification_channel[];
    if v_rule.notify_in_app and v_rule.in_app_notification_enabled then
      v_channels := v_channels || 'in_app'::public.notification_channel;
    end if;
    if v_rule.notify_email and v_rule.email_notification_enabled then
      v_channels := v_channels || 'email'::public.notification_channel;
    end if;

    if coalesce(array_length(v_channels, 1), 0) = 0 then
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'ruleId', v_rule.id,
        'status', 'matched_no_enabled_channel'
      ));
      continue;
    end if;

    v_payload := jsonb_build_object(
      'evaluatedYield', round(v_evaluated_yield, 4),
      'targetYield', v_rule.target_yield,
      'basis', v_rule.basis,
      'operator', v_rule.operator,
      'stockTicker', v_rule.stock_ticker
    );
    v_body := concat_ws(E'\n',
      v_rule.stock_name || 'が設定条件に到達しました。',
      '現在の予想配当利回り: ' || round(v_evaluated_yield, 1)::text || '%',
      '設定条件: ' || round(v_rule.target_yield, 1)::text || '%' ||
        case when v_rule.operator = 'gte' then '以上' else '以下' end,
      'これは売買を推奨するものではありません。'
    );

    insert into public.notifications (
      user_id,
      stock_id,
      notification_rule_id,
      type,
      title,
      body,
      payload,
      status,
      channel
    )
    select
      v_rule.user_id,
      v_rule.stock_id,
      v_rule.id,
      'yield_target'::public.notification_type,
      '目標利回りに到達',
      v_body,
      v_payload,
      'unread'::public.notification_status,
      unnest(v_channels);

    update public.notification_rules
    set last_triggered_at = v_now,
        last_condition_met = true,
        updated_at = v_now
    where id = v_rule.id;

    v_inserted := v_inserted + coalesce(array_length(v_channels, 1), 0);
    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'ruleId', v_rule.id,
      'status', 'inserted',
      'channels', to_jsonb(v_channels),
      'evaluatedYield', round(v_evaluated_yield, 4)
    ));
  end loop;

  return jsonb_build_object(
    'evaluated', v_evaluated,
    'matched', v_matched,
    'inserted', v_inserted,
    'deduplicated', v_deduplicated,
    'skippedStale', v_skipped_stale,
    'results', v_results
  );
end;
$$;

revoke all on function public.evaluate_notification_rules(uuid, uuid, boolean) from public;
grant execute on function public.evaluate_notification_rules(uuid, uuid, boolean) to authenticated;

-- 4. Helper to create dividend-change notifications for holders only.
--    This function is idempotent by (user_id, stock_id, dividend_event_id, type).

create or replace function public.create_dividend_change_notification(
  p_user_id uuid,
  p_stock_id uuid,
  p_dividend_event_id uuid,
  p_type public.notification_type,
  p_title text,
  p_body text,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_holding_exists boolean;
  v_existing_notification_id uuid;
begin
  -- Only create for active holders
  select exists (
    select 1 from public.holdings h
    where h.user_id = p_user_id
      and h.stock_id = p_stock_id
      and h.deleted_at is null
  ) into v_holding_exists;

  if not v_holding_exists then
    return jsonb_build_object('status', 'skipped_no_holding');
  end if;

  -- Deduplicate by (user_id, stock_id, dividend_event_id, type)
  select id into v_existing_notification_id
  from public.notifications
  where user_id = p_user_id
    and stock_id = p_stock_id
    and type = p_type
    and (payload->>'dividendEventId')::uuid = p_dividend_event_id
  limit 1;

  if v_existing_notification_id is not null then
    return jsonb_build_object('status', 'deduplicated');
  end if;

  insert into public.notifications (
    user_id, stock_id, type, title, body, payload, status, channel
  ) values (
    p_user_id, p_stock_id, p_type, p_title, p_body,
    p_payload || jsonb_build_object('dividendEventId', p_dividend_event_id),
    'unread', 'in_app'
  )
  returning id into v_existing_notification_id;

  return jsonb_build_object('status', 'inserted', 'notificationId', v_existing_notification_id);
end;
$$;

revoke all on function public.create_dividend_change_notification(uuid, uuid, uuid, public.notification_type, text, text, jsonb) from public;
grant execute on function public.create_dividend_change_notification(uuid, uuid, uuid, public.notification_type, text, text, jsonb) to authenticated;

-- 5. Index for refresh log queries

create index if not exists idx_stock_price_refresh_logs_stock_id_created_at
  on public.stock_price_refresh_logs(stock_id, created_at desc);

-- 6. Admin-visible helper for stocks with N consecutive refresh failures

create or replace function public.get_stocks_with_consecutive_price_refresh_failures(
  p_consecutive_count int default 3
)
returns table (
  stock_id uuid,
  ticker text,
  name text,
  failure_count bigint
)
language sql
security definer
set search_path = public
stable
as $$
  select
    s.id as stock_id,
    s.ticker,
    s.name,
    p_consecutive_count::bigint as failure_count
  from public.stocks s
  where s.support_status = 'supported'
    and (
      select count(*)
      from (
        select l.status
        from public.stock_price_refresh_logs l
        where l.stock_id = s.id
        order by l.created_at desc
        limit p_consecutive_count
      ) recent
      where recent.status = 'failure'
    ) = p_consecutive_count;
$$;

revoke all on function public.get_stocks_with_consecutive_price_refresh_failures(int) from public;
grant execute on function public.get_stocks_with_consecutive_price_refresh_failures(int) to authenticated;
