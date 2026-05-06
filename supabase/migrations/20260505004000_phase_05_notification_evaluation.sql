-- Phase 05: Notification rule evaluation RPC

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
  v_rule record;
  v_account_type public.account_type;
  v_before_tax_yield numeric;
  v_evaluated_yield numeric;
  v_channels public.notification_channel[];
  v_payload jsonb;
  v_body text;
  v_evaluated int := 0;
  v_matched int := 0;
  v_inserted int := 0;
  v_deduplicated int := 0;
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

    if v_rule.last_triggered_at is not null
      and v_rule.last_triggered_at > v_now - interval '24 hours'
    then
      v_deduplicated := v_deduplicated + 1;
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'ruleId', v_rule.id,
        'status', 'deduplicated'
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

    if not (
      (v_rule.operator = 'gte' and v_evaluated_yield >= v_rule.target_yield)
      or (v_rule.operator = 'lte' and v_evaluated_yield <= v_rule.target_yield)
    ) then
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'ruleId', v_rule.id,
        'status', 'not_matched',
        'evaluatedYield', round(v_evaluated_yield, 4)
      ));
      continue;
    end if;

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
    set last_triggered_at = v_now
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
    'results', v_results
  );
end;
$$;

revoke all on function public.evaluate_notification_rules(uuid, uuid, boolean) from public;
grant execute on function public.evaluate_notification_rules(uuid, uuid, boolean) to authenticated;
