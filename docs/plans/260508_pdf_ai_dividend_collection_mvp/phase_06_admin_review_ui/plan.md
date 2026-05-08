# Phase 06: Admin Review UI

## Goal

Build the MVP custom `/admin/dividend-reviews` workflow so admins can inspect AI candidates, view source PDFs through signed URLs, edit values, approve valid candidates, and reject bad candidates without relying on direct SQL for normal operations.

## Prerequisites

- Phase 05 Completion Criteria are met.
- Admin route protection already exists or can be reused from the existing `/admin` implementation.
- Private Storage signed URL generation is available from a server-only or Edge Function path.

## Implementation Scope

- Add or replace `/admin/dividend-reviews` list and detail/edit screens for `dividend_reviews`.
- Show disclosure context, stock/ticker, extracted values, previous values, change type, confidence, evidence, warning message, parse status, and priority.
- Provide source PDF viewing via short-lived signed URL for admins only.
- Add edit/override form fields and approve/reject actions wired to Edge Functions or server actions.
- Add filters and sorting for pending/high-priority review work.
- Keep raw AI payload available to admins but never to regular users.

## Core Tasks

1. **Review list**
   - Show pending and needs-manual-check reviews by default; multiple review rows from the same disclosure may be grouped visually, but each row keeps its own approve/reject controls.
   - Include stock name/code, disclosure title, disclosure type, published date, extracted dividend, previous dividend, event type, event index when available, change type, confidence, and review priority.
   - Add filters for status, priority, disclosure type, ticker, and change type.
   - Sort urgent/high priority items ahead of normal items.

2. **Review detail card**
   - Display AI extracted values for fiscal year, event type, dividend per share, previous dividend per share, ordinary/special/commemorative breakdown, record date, ex-dividend date, expected payment date/month, status, change type, confidence, evidence text, warnings, raw payload summary, and whether the event is payable or reference-only.
   - Display disclosure title, source URL, published timestamp, parse status, and last parse error when present.
   - Include investment-data caution copy for admins so they understand AI values are candidates, label `annual_total` as reference-only/not included in user-facing cash totals, and label special/commemorative rows as breakdown components that should not be separately double-counted.

3. **Signed PDF access**
   - Add an admin-only server action or Edge Function that returns a short-lived signed URL for `disclosures.storage_path`.
   - Never expose service-role credentials or permit regular users to request signed URLs.
   - Show an external/open button for source PDF viewing.

4. **Edit and approval workflow**
   - Provide editable fields for values allowed by the Phase 05 override contract, including `payment_year` when a review has only `expected_payment_month` and no full `expected_payment_date`.
   - Validate the form client-side for usability and server-side for authority; block approval of month-only reviews until `payment_year` is provided.
   - Call `approve-dividend-review` with override values when the admin approves.
   - Revalidate admin and affected user-facing paths after approval.

5. **Reject workflow**
   - Require a rejection reason for reject action.
   - Call `reject-dividend-review` and update list/detail state.
   - Revalidate admin routes after rejection.

6. **Tests to add or update**
   - Unit tests for admin review form validation.
   - Server action tests for signed URL authorization.
   - Component/page tests for list filtering and high-priority ordering where project tooling supports it.
   - E2E/admin workflow test covering signed PDF button visibility, override approval, and rejection.

## Test Plan

- Run `npm run lint`.
- Run `npm run typecheck`.
- Run `npm run build`.
- Run `npm run test:unit`.
- Run `npm run test:integration`.
- Run `npx playwright test --workers=1` for affected admin specs.
- Manual verification:
  - Non-admin cannot access `/admin/dividend-reviews` or signed PDF URLs.
  - Admin sees pending reviews sorted by priority.
  - Admin opens the source PDF through a signed URL.
  - Admin edits and approves one review from a multi-event disclosure and sees only that review produce a resulting event.
  - Admin rejects a review with a reason.

## Completion Criteria

- Admins can review AI dividend candidates without Supabase Studio for normal MVP workflow.
- Source PDFs are viewable only through admin-authorized signed URLs.
- Admin edits use the same validation contract as approval Edge Functions.
- Approval and rejection actions update review state and refresh admin UI.
- Regular users cannot access review records, raw AI payloads, private Storage paths, or signed PDF endpoints.

## Excluded From This Phase

- Changing AI prompts or validation.
- Creating new notification rules beyond approval handoff.
- Bulk review actions.
- Audit-log timelines beyond existing reviewed-by/reviewed-at fields.
