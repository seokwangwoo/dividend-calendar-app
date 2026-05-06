-- Phase 04: Email Notification Delivery

-- 1. Add email delivery state columns to notifications

alter table public.notifications
  add column if not exists sent_via_email_at timestamptz,
  add column if not exists email_delivery_status text,
  add column if not exists email_delivery_error text;

comment on column public.notifications.sent_via_email_at is 'Timestamp when the notification was successfully delivered by email';
comment on column public.notifications.email_delivery_status is 'Email delivery status: pending, sent, failed';
comment on column public.notifications.email_delivery_error is 'Summary of the last email delivery error, without secrets';

-- 2. Add RPC to find pending email notifications for a user

create or replace function public.get_pending_email_notifications(
  p_user_id uuid
)
returns setof public.notifications
language sql
security definer
set search_path = public
stable
as $$
  select *
  from public.notifications n
  where n.user_id = p_user_id
    and n.channel = 'email'
    and n.sent_via_email_at is null
    and (n.email_delivery_status is null or n.email_delivery_status <> 'sent')
  order by n.created_at asc;
$$;

revoke all on function public.get_pending_email_notifications(uuid) from public;
grant execute on function public.get_pending_email_notifications(uuid) to authenticated;

-- 3. Add RPC to mark notification email delivery result (idempotent)

create or replace function public.mark_notification_email_delivered(
  p_notification_id uuid,
  p_status text,
  p_error text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status not in ('sent', 'failed') then
    raise exception 'Invalid email delivery status: %', p_status;
  end if;

  update public.notifications
  set
    sent_via_email_at = case when p_status = 'sent' then now() else sent_via_email_at end,
    email_delivery_status = p_status,
    email_delivery_error = p_error,
    updated_at = now()
  where id = p_notification_id
    and (sent_via_email_at is null or p_status = 'failed');

  if not found then
    return jsonb_build_object('status', 'skipped_already_sent');
  end if;

  return jsonb_build_object('status', 'updated', 'deliveryStatus', p_status);
end;
$$;

revoke all on function public.mark_notification_email_delivered(uuid, text, text) from public;
grant execute on function public.mark_notification_email_delivered(uuid, text, text) to authenticated;
