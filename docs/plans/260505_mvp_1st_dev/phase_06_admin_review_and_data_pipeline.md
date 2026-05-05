# Phase 06: Admin Review and Data Pipeline

## Goal

Add the minimum data quality workflow for MVP: disclosure records, parser review records, admin approval/rejection, dividend event creation, and dividend change notifications based only on approved data.

## Prerequisites

- Phase 05 is complete.
- Admin role checks work.
- `dividend_events` drives user-facing home and calendar screens.

## Implementation Scope

- Add data pipeline tables if not already created.
- Define Supabase Studio operating flow for MVP admin review.
- Add approve and reject Edge Functions.
- Add minimal disclosure collection function shape.
- Add minimal parser function shape.
- Generate dividend change notifications on approved changes.
- Keep manual review mandatory for risky cases.

## Additional Tables

### `disclosures`

Fields:

- `id uuid primary key`
- `stock_id uuid references stocks(id)`
- `external_id text unique`
- `source_type text not null`
- `title text not null`
- `document_url text`
- `storage_path text`
- `published_at timestamptz`
- `collected_at timestamptz default now()`
- `status text default 'collected'`
- timestamps

### `dividend_reviews`

Fields:

- `id uuid primary key`
- `stock_id uuid references stocks(id)`
- `disclosure_id uuid references disclosures(id)`
- `extracted_dividend_per_share numeric(18,2)`
- `previous_dividend_per_share numeric(18,2)`
- `extracted_payment_date date`
- `extracted_payment_month int`
- `confidence_score numeric(5,4)`
- `status text default 'pending'`
- `reviewed_by uuid references profiles(id)`
- `reviewed_at timestamptz`
- `rejection_reason text`
- `created_dividend_event_id uuid references dividend_events(id)`
- `raw_payload jsonb default '{}'`
- timestamps

### `jobs`

Fields:

- `id uuid primary key`
- `type text not null`
- `status text default 'pending'`
- `payload jsonb default '{}'`
- `run_after timestamptz default now()`
- `attempts int default 0`
- `last_error text`
- timestamps

## RLS And Permissions

- `disclosures`: admin can select, insert, update, and delete. Authenticated users cannot access directly; source metadata is exposed only through approved dividend event joins in RPCs.
- `dividend_reviews`: admin can select, insert, and update. No authenticated user access.
- `jobs`: admin can select, update, and delete. Service role can insert and update `status` and `last_error`. No authenticated user access.

Edge Function security:

- Edge Functions that mutate review state initialize a Supabase admin client using `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')`. This key is a Supabase project secret and is never exposed to the browser.
- Each function verifies the caller JWT and checks `profiles.role = 'admin'` before processing. Requests from non-admin users are rejected with 403.

## Admin MVP Operating Model

Use Supabase Studio for MVP 1st:

- Admin filters `dividend_reviews.status = pending`.
- Admin opens linked `disclosures.document_url` or private storage signed URL.
- Admin edits extracted values if needed.
- Admin invokes approve or reject Edge Function.
- Approved review creates or updates a `dividend_events` row.
- Rejected review is never used in user-facing calculations.

## Edge Function: `approve-dividend-review`

Request:

```json
{
  "reviewId": "uuid"
}
```

Required checks:

- Verify JWT.
- Verify caller `profiles.role = admin`.
- Load review.
- Reject if review is not `pending`.
- Reject if review has no `stock_id`.
- Reject if dividend amount is unknown and status is not explicitly undecided.

Processing:

- Compare `extracted_dividend_per_share` with latest approved dividend event for same stock and comparable event.
- Derive `change_type`:
  - increase
  - decrease
  - no_dividend
  - resumed
  - special
  - commemorative
  - unchanged
- Insert `dividend_events` with `review_status = 'approved'`.
- Update review:
  - `status = 'approved'`
  - `reviewed_by`
  - `reviewed_at`
  - `created_dividend_event_id`
- Find users with active holdings for the stock.
- Create dividend change notifications when `change_type` is one of: `increase`, `decrease`, `no_dividend`, `resumed`, `special`, `commemorative`. Do not create a notification when `change_type` is `unchanged` or when there is no prior event to compare against.
- Do not create notifications on re-approval of a review that already has an approved event.

Dividend change notification types:

- `dividend_increase`
- `dividend_decrease`
- `no_dividend`
- `special_dividend`
- `data_update`

## Edge Function: `reject-dividend-review`

Request:

```json
{
  "reviewId": "uuid",
  "reason": "text"
}
```

Processing:

- Verify admin.
- Load pending review.
- Set status to `rejected`.
- Store rejection reason.
- Store reviewer and reviewed time.
- Do not create dividend events.
- Do not create user notifications.

## Edge Function: `collect-disclosures`

MVP 1st target:

- Store TDnet candidate metadata.
- Do not require perfect scraping coverage.
- Prefer idempotent inserts using `external_id`.
- Create `jobs` rows for parsing.

Collected fields:

- stock ticker when identifiable.
- company name.
- title.
- published time.
- source URL.
- document URL.

Dividend keyword filter:

```text
配当
配当予想
配当予想の修正
剰余金の配当
期末配当
中間配当
増配
減配
無配
復配
記念配当
特別配当
株式分割
決算短信
業績予想及び配当予想
```

## Edge Function: `parse-disclosure`

MVP 1st target:

- Accept a `disclosureId`.
- Extract candidate values when possible.
- Store raw extraction evidence in `dividend_reviews.raw_payload`.
- Assign `confidence_score`.
- Always create review rows as `pending`. Confidence score is informational only; it aids admin triage but does not auto-approve any review regardless of score value.

Parsing priority:

1. XBRL facts.
2. HTML text.
3. PDF text around dividend keywords.
4. PDF table extraction.
5. Manual admin input.

Manual review is mandatory for:

- `未定`
- `0円`
- `無配`
- `復配`
- `特別配当`
- `記念配当`
- Change greater than or equal to plus or minus 50%.
- Dividend yield greater than 10%.
- Stock split-related dividend change.
- PDF-only extraction.

## Storage

Use Supabase Storage bucket:

- `disclosures`

Rules:

- Private bucket.
- Admin accesses files with signed URLs generated with 1-hour expiry. If a file is deleted after a review is created, display "Document no longer available" in Supabase Studio.
- System functions can upload and download using the service role.
- User-facing UI shows source metadata and public source URL only, not private storage files.

## GitHub Actions Cron

Add workflow after manual function calls are stable. Suggested schedule (JST):

- `collect-disclosures`: daily at 23:00 JST.
- Parser job for pending `jobs` rows: hourly.
- `evaluate-notification-rules`: daily at 09:00 JST.

Sequencing: run collection first, then parsing, then evaluation in separate jobs to avoid coupling. Use `SUPABASE_SERVICE_ROLE_KEY` as a GitHub Actions secret only. Do not commit or log this key.

When `dividend_events.status = 'undecided'` and `dividend_per_share` is null, portfolio RPCs treat the event as unknown and exclude it from before-tax and after-tax totals. Yield values derived from null dividend amounts are also null. This behavior is confirmed and consistent with Phase 03 and Phase 04 RPC specifications.

## Test Plan

- Non-admin cannot approve review.
- Admin can approve pending review.
- Approving review creates approved dividend event.
- Approving review updates review metadata.
- Rejecting review does not create dividend event.
- Pending and rejected reviews are not visible as user-facing approved dividend data.
- Approved increase creates dividend increase notifications for users holding the stock.
- Approved decrease creates dividend decrease notifications.
- `未定` is not stored as zero. Verify `dividend_events.dividend_per_share` is null and `status = 'undecided'`.
- Duplicate disclosure collection does not create duplicate records. Collect the same disclosure twice (same `external_id`) and verify only one row exists in `disclosures`.

## Completion Criteria

- Admin review lifecycle works from pending to approved or rejected.
- Approved reviews create user-facing dividend events.
- Dividend change notifications are created only from approved data.
- Disclosure and parser records are stored with source metadata.
- Supabase Studio can operate as the admin tool for MVP 1st.
- Build, lint, typecheck, and admin workflow scenarios pass.

## Excluded From This Phase

- Full custom admin dashboard beyond placeholder route.
- High-accuracy production TDnet parser.
- Paid TDnet API integration.
- LLM-assisted parsing by default.
- Web Push.
