# Phase 02: Database, Auth, and RLS

## Goal

Create the Supabase database foundation, authentication flow, row-level security policies, and seed data required for user-specific portfolio management.

## Prerequisites

- Phase 01 is complete.
- Supabase project URL and anon key are available.
- Supabase CLI is available for local migrations or remote migration management.

## Implementation Scope

- Configure Supabase Auth.
- Create core tables.
- Enable RLS.
- Add policies for user-owned data.
- Add admin role helper.
- Seed supported and unsupported Japanese stocks.
- Wire login, signup, logout, password reset, and route protection.

## Database Tables

Create these tables first:

- `profiles`
- `user_settings`
- `stocks`
- `holdings`
- `dividend_events`
- `notification_rules`
- `notifications`

Add `disclosures`, `dividend_reviews`, and `jobs` in Phase 06 unless the migration order is easier with all tables in one migration. If added early, keep them unused until Phase 06.

## Required Enums Or Check Constraints

Use native Postgres enums for all listed constraints. This ensures type safety at the database level and simplifies validation in RPC functions. If the project already uses check constraints throughout, maintain consistency with that convention.

- `profiles.role`: `user`, `admin`
- `profiles.status`: `active`, `deleted`
- `stocks.support_status`: `supported`, `unsupported`
- `holdings.account_type`: `nisa`, `tokutei`, `general`
- `dividend_events.event_type`: `interim`, `year_end`, `special`, `commemorative`, `other`
- `dividend_events.status`: `estimated`, `confirmed`, `paid`, `undecided`
- `dividend_events.change_type`: `increase`, `decrease`, `no_dividend`, `resumed`, `special`, `commemorative`, `unchanged`
- `dividend_events.review_status`: `pending`, `approved`, `rejected`
- `notification_rules.basis`: `before_tax_yield`, `after_tax_yield` — Note: these values represent the yield-based rule evaluation basis and are distinct from the calendar display filter (`before_tax` / `after_tax`), which is a separate concept.
- `notification_rules.operator`: `gte`, `lte`
- `notification_rules.status`: `active`, `disabled`
- `notifications.type`: `yield_target`, `dividend_increase`, `dividend_decrease`, `no_dividend`, `special_dividend`, `data_update`
- `notifications.status`: `unread`, `read`, `failed`
- `notifications.channel`: `in_app`, `email`

## Core Schema Requirements

### `profiles`

- `id uuid primary key references auth.users(id) on delete cascade`
- `email text not null`
- `role text not null default 'user'`
- `status text not null default 'active'`
- timestamps

Create a trigger so a profile and user settings row are created after auth signup.

### `user_settings`

- `user_id uuid unique references profiles(id) on delete cascade`
- `email_notification_enabled boolean default true`
- `in_app_notification_enabled boolean default true`
- `default_amount_basis text default 'after_tax'`
- `currency text default 'JPY'`
- `monthly_dividend_goal_amount numeric(18,2)`
- timestamps

### `stocks`

- `ticker text unique not null`, for example `9433`
- `exchange text default 'TSE'`
- `name text not null`
- `name_en text`
- `currency text default 'JPY'`
- `support_status text default 'unsupported'`
- `current_price numeric(18,2)`
- `price_updated_at timestamptz`
- `expected_annual_dividend_per_share numeric(18,2)`
- `expected_dividend_yield numeric(8,4)`
- timestamps

### `holdings`

- `user_id uuid references profiles(id) on delete cascade`
- `stock_id uuid references stocks(id)`
- `quantity numeric(18,4) not null`
- `average_purchase_price numeric(18,2) not null`
- `account_type text not null`
- `memo text`
- `deleted_at timestamptz`
- timestamps

Allow the same stock to be registered multiple times for different account types.

### `dividend_events`

- `stock_id uuid references stocks(id)`
- `fiscal_year int not null`
- `event_type text not null`
- `dividend_per_share numeric(18,2)`
- `previous_dividend_per_share numeric(18,2)`
- `expected_payment_date date`
- `expected_payment_month int`
- `record_date date`
- `ex_dividend_date date`
- `status text default 'estimated'`
- `change_type text`
- `source_type text`
- `source_url text`
- `source_published_at timestamptz`
- `review_status text default 'pending'`
- timestamps

Do not store `未定` as `0`. Use null amount plus `status = 'undecided'`.

### `notification_rules`

- `user_id uuid references profiles(id) on delete cascade`
- `stock_id uuid references stocks(id)`
- `basis text not null`
- `operator text not null`
- `target_yield numeric(8,4) not null`
- `notify_in_app boolean default true`
- `notify_email boolean default false`
- `status text default 'active'`
- `last_triggered_at timestamptz`
- timestamps

### `notifications`

- `user_id uuid references profiles(id) on delete cascade`
- `stock_id uuid references stocks(id)`
- `notification_rule_id uuid references notification_rules(id)`
- `type text not null`
- `title text not null`
- `body text not null`
- `payload jsonb default '{}'`
- `status text default 'unread'`
- `channel text default 'in_app'`
- `sent_at timestamptz`
- `read_at timestamptz`
- `created_at timestamptz default now()`

## RLS Policies

Enable RLS on all app tables.

User policies:

- `profiles`: user can select and update own profile.
- `user_settings`: user can select and update own settings.
- `holdings`: user can select, insert, update, and soft-delete own holdings.
- `notification_rules`: user can select, insert, update, and disable own rules.
- `notifications`: user can select own notifications and update `read_at` and `status` on own rows. Users cannot insert or delete notifications directly; insertions are performed by Edge Functions using the service role.
- `stocks`: authenticated users can select all rows.
- `dividend_events`: authenticated users can select only rows where `review_status = 'approved'`.

Admin policies:

- Add `is_admin()` security definer function that checks `profiles.role = 'admin'` for the calling user.
- Admin can select, insert, update, and delete `stocks`.
- Admin can select, insert, update, and delete `dividend_events`.
- Admin can select all rows in `dividend_reviews`.
- Admin can select and update status on `disclosures`.
- Admin can select and update status on `jobs`.

Pipeline and service role policies:

- `disclosures`: service role can insert and update. Authenticated users cannot access directly.
- `dividend_reviews`: service role and admin only. No user access.
- `jobs`: service role can insert and update `status` and `last_error`. Admin can select, update, and delete. No authenticated user access.

If `disclosures`, `dividend_reviews`, and `jobs` tables are created in Phase 02 to simplify migration order, apply these policies immediately and leave the tables unused until Phase 06.

## Indexes

Create indexes:

- `stocks(ticker)`
- `stocks(name)`
- `stocks(support_status)`
- `holdings(user_id)`
- `holdings(user_id, stock_id)`
- `dividend_events(stock_id, fiscal_year)`
- `dividend_events(fiscal_year, expected_payment_month)`
- `dividend_events(review_status)`
- `notification_rules(user_id)`
- `notification_rules(status)`
- `notifications(user_id, created_at desc)`
- `notifications(user_id, status)`

## Seed Data

Seed 30 to 50 Japanese dividend stocks.

Minimum seed fields:

- ticker
- exchange
- name
- name_en
- support_status
- current_price
- expected_annual_dividend_per_share
- expected_dividend_yield

Include at least a few unsupported search-visible rows so the UI can show “currently unsupported” instead of appearing broken.

## Auth Implementation

Implement:

- Signup with email and password.
- Login with email and password.
- Logout.
- Password reset request.
- Auth callback/session refresh if required by Supabase SSR.
- Protected route redirect for `/app/*`.
- Admin route guard for `/admin/*`.

## Test Plan

- Verify a new auth user creates `profiles` and `user_settings`.
- Verify logged-out users cannot access `/app/home`.
- Verify logged-in users can access `/app/home`.
- Verify user A cannot select, update, or delete user B holdings.
- Verify `stocks` can be searched by authenticated users.
- Verify pending or rejected dividend events are not visible through normal user reads.
- Verify admin-only policies reject non-admin users.

## Completion Criteria

- Database migrations apply cleanly.
- Seed data is available in `stocks`.
- Auth pages perform real signup/login/logout.
- Protected app routes enforce authentication.
- RLS blocks cross-user data access.
- Build, lint, and typecheck pass.

## Excluded From This Phase

- Portfolio screens beyond basic auth-protected placeholders.
- Dividend calculation RPCs.
- Calendar summary RPCs.
- Notification rule evaluation.
- Admin review approval functions.
