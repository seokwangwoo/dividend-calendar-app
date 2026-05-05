drop policy if exists "Users can delete own holdings" on public.holdings;

revoke all on public.profiles from authenticated;
grant select on public.profiles to authenticated;
grant update(email) on public.profiles to authenticated;

revoke all on public.user_settings from authenticated;
grant select, update on public.user_settings to authenticated;

revoke all on public.stocks from authenticated;
grant select, insert, update, delete on public.stocks to authenticated;

revoke all on public.holdings from authenticated;
grant select, insert, update on public.holdings to authenticated;

revoke all on public.dividend_events from authenticated;
grant select, insert, update, delete on public.dividend_events to authenticated;

revoke all on public.notification_rules from authenticated;
grant select, insert, update on public.notification_rules to authenticated;

revoke all on public.notifications from authenticated;
grant select on public.notifications to authenticated;
grant update(status, read_at) on public.notifications to authenticated;
