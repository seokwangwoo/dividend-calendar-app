# Phase 05: Review Approval Pipeline

## Goal

Turn admin-approved AI review candidates into canonical `dividend_events`, support rejection with reasons, and keep approval side effects idempotent and audit-friendly.

## Prerequisites

- Phase 04 Completion Criteria are met.
- Admin identity is represented by `profiles.role = 'admin'` and active profile status where the existing app requires it.
- Existing notification tables and approved-event user queries are available.

## Implementation Scope

- Extend `approve-dividend-review` to accept optional override values and approve `pending` or `needs_manual_check` review records.
- Upsert exactly one `dividend_event` from one approved review row using the MVP matching strategy while preserving existing `payment_year` requirements, `annual_total` reference-only semantics, and special/commemorative breakdown metadata.
- Extend `reject-dividend-review` to store rejection reason and reviewer metadata.
- Ensure approval creates or enqueues notification work only for eligible change types and only after the event is approved; any async approval/notification work must use the existing `process-jobs` runner rather than a separate dispatcher.
- Keep approval and rejection available from Supabase Studio-compatible table state and Edge Functions.

## Core Tasks

1. **Admin authorization contract**
   - Reuse a single admin-check helper for approval and rejection Edge Functions where possible.
   - Require authenticated active admin users for all review state changes.
   - Use service-role only after user authorization succeeds.

2. **Approval input and override validation**
   - Accept request shape with `review_id` or existing camelCase equivalent plus optional `override` object.
   - Validate override fields for non-negative dividend amounts, valid dates, valid months, valid `payment_year`, valid event type, valid status, and valid change type.
   - Apply override values only to the event write and persisted review raw payload/audit fields as appropriate.

3. **Dividend event upsert**
   - Match existing events by `stock_id`, `fiscal_year`, `event_type`, and source publication context for the single event represented by the review row.
   - Derive `payment_year` from `expected_payment_date` when a full payment date exists.
   - If no full `expected_payment_date` exists and only `expected_payment_month` is available, require admin override/confirmation of `payment_year` before approval.
   - Do not derive `payment_year` from `source_published_at` or `fiscal_year` automatically; those values can differ from the user-facing cash receipt year.
   - Fail approval with a validation error when the final event payload lacks `payment_year`, so approved user-facing events are never unusable by calendar-year queries.
   - Insert new event when no match exists.
   - Update dividend amount, previous amount, expected payment date, expected payment month, record date, explicit ex-dividend date, status, change type, source type, source URL, source published timestamp, disclosure ID, review status, and raw payload breakdown metadata when a match exists.
   - Set `review_status = 'approved'` for created/updated events; when `event_type = 'annual_total'`, mark/preserve it so user-facing cash total and payment-calendar queries exclude it and use it only for validation/reference.

4. **Review state update**
   - Set `dividend_reviews.status = 'approved'` and store `reviewed_by`, `reviewed_at`, and the single `created_dividend_event_id` after successful event upsert.
   - Prevent approving already approved or rejected reviews unless an explicit safe reapproval policy is documented and tested.
   - Set `dividend_reviews.status = 'rejected'`, `rejection_reason`, `reviewed_by`, and `reviewed_at` on rejection.

5. **Notification handoff**
   - For approved reviews with `change_type` in `increase`, `decrease`, `no_dividend`, `resumed`, `special`, or `commemorative`, create notification work or direct notification rows according to existing notification architecture; if asynchronous, add the handler to `process-jobs`. Special/commemorative notifications should use breakdown metadata from the payable event, not a separately counted event row.
   - Deduplicate by disclosure/review/event identity so repeat approval attempts do not create duplicate notifications.
   - Do not notify for `unchanged`, `unknown`, or `annual_total` reference-only approvals.

6. **Tests to add or update**
   - Unit tests for override validation, `payment_year` derivation/required-confirmation behavior, and admin authorization failures.
   - Integration tests for approve creating a new event, approve updating an existing event, reject storing reason, duplicate approval idempotency, and approving one of several sibling reviews from the same disclosure without changing the others.
   - Integration tests proving pending and rejected reviews remain hidden from user-facing app queries, approved `annual_total` events do not change user-facing cash total/calendar amounts, special/commemorative breakdowns do not double-count as separate payable rows, and approval does not auto-fill `ex_dividend_date` from `record_date`.
   - Tests for notification handoff only after approval and only for eligible change types.

## Test Plan

- Run `npm run lint`.
- Run `npm run typecheck`.
- Run `npm run build`.
- Run `npm run test:unit`.
- Run `npm run test:integration`.
- Manual verification:
  - Approve a pending review with a full `expected_payment_date` and confirm a `dividend_event` is created with `payment_year = year(expected_payment_date)`.
  - Approve a month-only review with explicit `payment_year` override and confirm override values are reflected in the event.
  - Approve an `annual_total` review and confirm it is stored for admin/reference use but excluded from user-facing cash total/calendar aggregation.
  - Approve a payable review with a special/commemorative breakdown and confirm the total amount is counted once while notification metadata preserves the component.
  - Reject a pending review and confirm no event is created.
  - Repeat approval/rejection attempts and confirm safe errors or idempotent behavior.

## Completion Criteria

- Admin-only approval creates or updates one approved `dividend_event` per approved review, with source and disclosure linkage.
- Admin overrides, including required `payment_year` confirmation for month-only payment timing, are validated and applied safely.
- Rejection records reviewer, timestamp, and reason without creating user-facing event data.
- Eligible dividend changes trigger deduplicated notification work only after approval.
- Existing user-facing home/calendar calculations immediately reflect approved payable events, count special/commemorative components only through their parent payable event, exclude approved `annual_total` reference events from cash total/payment-calendar aggregation, and exclude unapproved reviews.

## Excluded From This Phase

- Building the custom `/admin/dividend-reviews` UI.
- Sending email/push delivery beyond existing notification architecture.
- AI parsing changes except fields required for approval compatibility.
- XBRL reconciliation.
