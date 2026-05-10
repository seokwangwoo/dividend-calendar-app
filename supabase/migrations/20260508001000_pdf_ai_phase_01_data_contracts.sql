-- Phase 01: PDF AI dividend collection data contracts and storage security.

do $$
begin
  create type public.disclosure_type as enum (
    'dividend_forecast_revision',
    'dividend_decision',
    'earnings_release',
    'earnings_revision',
    'correction',
    'other'
  );
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.disclosure_parse_status as enum (
    'pending',
    'downloaded',
    'parsing',
    'parsed',
    'failed',
    'skipped'
  );
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.disclosure_review_priority as enum (
    'low',
    'normal',
    'high',
    'urgent'
  );
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.job_type as enum (
    'collect_disclosures',
    'download_disclosure_pdf',
    'parse_disclosure_pdf_ai',
    'approve_dividend_review',
    'evaluate_notification_rules'
  );
exception when duplicate_object then null;
end $$;

alter type public.dividend_event_type add value if not exists 'annual_total';
alter type public.dividend_change_type add value if not exists 'unknown';
alter type public.review_status add value if not exists 'needs_manual_check';

alter table public.disclosures
  add column if not exists disclosure_type public.disclosure_type not null default 'other',
  add column if not exists parse_status public.disclosure_parse_status not null default 'pending',
  add column if not exists review_priority public.disclosure_review_priority not null default 'normal',
  add column if not exists ai_parse_attempts int not null default 0,
  add column if not exists last_parse_error text,
  add column if not exists raw_payload jsonb not null default '{}'::jsonb;

alter table public.disclosures
  add constraint disclosures_ai_parse_attempts_nonnegative
  check (ai_parse_attempts >= 0) not valid;

alter table public.disclosures
  validate constraint disclosures_ai_parse_attempts_nonnegative;

alter table public.dividend_reviews
  add column if not exists fiscal_year int,
  add column if not exists event_type public.dividend_event_type,
  add column if not exists extracted_record_date date,
  add column if not exists extracted_ex_dividend_date date,
  add column if not exists change_type public.dividend_change_type,
  add column if not exists evidence_text text,
  add column if not exists warning_message text;

alter table public.dividend_reviews
  add constraint dividend_reviews_status_allowed
  check (status in ('pending', 'approved', 'rejected', 'needs_manual_check')) not valid;

alter table public.dividend_reviews
  validate constraint dividend_reviews_status_allowed;

alter table public.dividend_events
  add column if not exists disclosure_id uuid references public.disclosures(id),
  add column if not exists raw_payload jsonb not null default '{}'::jsonb;

alter table public.dividend_events
  add constraint dividend_events_approved_payment_year_required
  check (review_status <> 'approved' or payment_year is not null) not valid;

alter table public.dividend_events
  validate constraint dividend_events_approved_payment_year_required;

alter table public.jobs
  add column if not exists max_attempts int not null default 3;

alter table public.jobs
  add constraint jobs_max_attempts_positive
  check (max_attempts > 0) not valid;

alter table public.jobs
  validate constraint jobs_max_attempts_positive;

comment on column public.dividend_events.payment_year is
  'User-facing calendar-year aggregation key. Derive from expected payment timing when available; do not infer it from fiscal_year for unconfirmed AI review candidates.';
comment on column public.dividend_events.fiscal_year is
  'Company accounting year disclosed by source documents. It is not a safe substitute for payment_year without payment timing/admin confirmation.';
comment on column public.dividend_events.ex_dividend_date is
  'Explicit-only in the PDF AI MVP. Do not derive from record_date by Japanese business-day or calendar-day rules.';
comment on column public.dividend_events.raw_payload is
  'Disclosure/review-derived metadata, including ordinary/special/commemorative dividend component breakdowns.';
comment on column public.dividend_reviews.event_type is
  'annual_total is non-payable validation/reference data. special and commemorative are MVP breakdown metadata on payable interim/year_end events.';
comment on column public.dividend_reviews.change_type is
  'special and commemorative drive review/notification behavior without requiring separately counted payable dividend event rows.';
comment on column public.jobs.type is
  'Allowed PDF AI MVP job types: collect_disclosures, download_disclosure_pdf, parse_disclosure_pdf_ai, approve_dividend_review, evaluate_notification_rules.';

create index if not exists idx_disclosures_parse_status_priority
  on public.disclosures(parse_status, review_priority, published_at desc);
create index if not exists idx_disclosures_type_published
  on public.disclosures(disclosure_type, published_at desc);
create index if not exists idx_dividend_reviews_disclosure_event
  on public.dividend_reviews(disclosure_id, fiscal_year, event_type);
create index if not exists idx_dividend_reviews_priority_status
  on public.dividend_reviews(status, change_type);
create index if not exists idx_dividend_events_approval_match
  on public.dividend_events(stock_id, fiscal_year, event_type, source_published_at);
create index if not exists idx_dividend_events_disclosure
  on public.dividend_events(disclosure_id);
create index if not exists idx_jobs_worker_claim
  on public.jobs(status, run_after, type, attempts);

insert into storage.buckets (id, name, public)
values ('disclosures', 'disclosures', false)
on conflict (id) do update set public = false;

drop policy if exists "Authenticated users can view approved dividend events" on public.dividend_events;
create policy "Authenticated users can view approved dividend events"
on public.dividend_events for select
to authenticated
using (
  review_status = 'approved'
  and payment_year is not null
  and event_type::text not in ('annual_total', 'special', 'commemorative')
);

drop policy if exists "Regular users cannot read disclosure objects" on storage.objects;
create policy "Regular users cannot read disclosure objects"
on storage.objects for select
to authenticated
using (bucket_id = 'disclosures' and false);

grant select, insert, update, delete on public.disclosures to service_role;
grant select, insert, update on public.dividend_reviews to service_role;
grant select, insert, update, delete on public.dividend_events to service_role;
grant select, insert, update, delete on public.jobs to service_role;
