-- Recreate reject_dividend_review_for_reviewer after it was accidentally dropped
-- by 20260510131911_fix_approve_overload.sql.
-- This is the 3-arg Phase 05 variant that accepts both pending and needs_manual_check.

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

-- Recreate the 2-arg wrapper
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
