# Phase 02: Minimal Admin Review UI

## Goal

Add the minimum custom admin workflow needed to enter, review, approve, and reject dividend data without relying on direct Supabase Studio edits for normal MVP operations.

## Prerequisites

- Phase 01 Completion Criteria are met.
- Admin role is represented by `profiles.role = 'admin'`.
- `dividend_events.payment_year` is available and used by user-facing RPCs.

## Implementation Scope

- Build `/admin` routes inside the Next.js App Router for dividend event review operations.
- Enforce admin access using server-side auth and `profiles.role = 'admin'`; non-admin users must receive a 403-style page or redirect.
- Show a dividend event table with stock, ticker, fiscal year, payment year, payment month, dividend per share, status, review status, source type, and source URL.
- Add a dividend event form for manual entry and correction.
- Add review status actions for `pending`, `approved`, and `rejected`.
- Keep confidence score, PDF/XBRL rendering, and review history out of this phase.
- Preserve Supabase Studio as a fallback for rare operational fixes.

## Core Tasks

1. **Admin route protection**
   - Add a reusable server helper that checks the current user profile role.
   - Protect all `/admin` pages and server actions with the same admin check.
   - Ensure browser code never receives service-role credentials.

2. **Dividend event list**
   - Implement an admin table with filters for review status, ticker, payment year, and event status.
   - Display uncertain payment dates as payment month text, not as fake dates.
   - Link source URLs as external links when present.

3. **Dividend event form**
   - Provide stock selection, `fiscal_year`, `payment_year`, `estimated_payment_month`, optional `payment_start_date`, `event_type`, `status`, `change_type`, `dividend_per_share`, `previous_dividend_per_share`, `source_type`, and `source_url`.
   - Validate month range, non-negative dividend amounts, and required payment year.
   - Default new manual entries to `review_status = 'pending'` unless the action is explicitly approve.

4. **Review actions**
   - Use existing Edge Functions or RPCs where available for approve/reject side effects.
   - Ensure approval updates user-facing event availability immediately through existing approved-event RPCs.
   - Ensure rejection removes the event from user-facing totals.

5. **Unit tests to add**

   `src/features/admin/auth.test.ts` (new):
   - `requireAdminUser` throws or redirects when profile role is not `'admin'`.
   - `requireAdminUser` resolves for a profile with role `'admin'`.
   - Called with no session (unauthenticated) it throws or redirects to login.

   `src/features/admin/actions.test.ts` (new):
   - `createDividendEvent` rejects `estimated_payment_month` outside 1–12.
   - `createDividendEvent` rejects negative `dividend_per_share`.
   - `createDividendEvent` rejects missing `payment_year`.
   - `createDividendEvent` defaults `review_status` to `'pending'`.
   - `approveDividendEvent` sets `review_status = 'approved'` and fails for non-admin caller.
   - `rejectDividendEvent` sets `review_status = 'rejected'` and stores `rejection_reason`.
   - Both approve and reject actions call `revalidatePath` for affected user-facing routes.

   `src/features/admin/validation.test.ts` (new):
   - Month validation: 0, 13, and non-integer values are invalid; 1–12 are valid.
   - Dividend amount: 0 is valid (zero dividend), negative is invalid.
   - `payment_year` must be a four-digit integer in the range 2000–2100.

## Test Plan

- Run `npm run lint`.
- Run `npm run typecheck`.
- Run `npm run build`.
- Run `npm run test:unit` — new admin auth, actions, and validation tests must pass.
- Run `npm run test:integration` — existing admin review pipeline integration tests must continue to pass.
- Run `npx playwright test --workers=1` for affected admin and value verification specs.
- Manual verification:
  - Non-admin cannot access `/admin`.
  - Admin can create a pending dividend event.
  - Admin can approve the event and see it reflected in `/app/home`.
  - Admin can reject the event and confirm it is excluded from user totals.

## Completion Criteria

- `/admin` is inaccessible to non-admin users.
- Admins can list and filter dividend events.
- Admins can create valid dividend events with both `fiscal_year` and `payment_year`.
- Admins can approve and reject events, and user-facing screens react according to `review_status`.
- Source URL and source type are visible in admin and preserved for user source metadata after approval.

## Excluded From This Phase

- PDF/XBRL document rendering.
- Confidence score UI.
- Review history audit log.
- Full custom disclosure parser dashboard.
- Bulk upload or CSV import.
