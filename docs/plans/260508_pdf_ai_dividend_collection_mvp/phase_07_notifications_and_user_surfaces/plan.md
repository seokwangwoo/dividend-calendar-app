# Phase 07: Notifications and User Surfaces

## Goal

Ensure approved disclosure-derived dividend events are reflected in home, calendar, and notification surfaces while unapproved AI data remains hidden and user-facing copy avoids investment-recommendation ambiguity.

## Prerequisites

- Phase 06 Completion Criteria are met.
- Existing home, calendar, portfolio, and notification features are passing their baseline tests.
- Existing notification deduplication and holder-targeting decisions remain available.

## Implementation Scope

- Verify and update user-facing queries so approved payable disclosure-derived `dividend_events` appear in all intended surfaces while approved `annual_total` reference events are excluded from cash total/payment-calendar aggregation.
- Ensure pending/rejected/needs-manual-check `dividend_reviews` never appear in user-facing output.
- Add notification creation and display copy for approval-time dividend changes.
- Add or update disclaimer copy on user-facing surfaces and notification detail where applicable.
- Preserve expected-date versus expected-month display semantics.

## Core Tasks

1. **Home surface integration**
   - Confirm approved payable disclosure-derived events contribute to 올해 예상 세후 배당금, approved `annual_total` events do not double-count totals, and special/commemorative components are counted only once through the parent payable event.
   - Confirm approved payable events with current-month payment date/month contribute to 이번 달 예상 입금액; `annual_total` never contributes to monthly payment totals.
   - Confirm next dividend and recent dividend change cards can show approved events with disclosure source metadata.
   - Add or verify disclaimer copy: information is TDnet-disclosure-based schedule management, not buy/sell advice, and actual payments/taxes should be checked with brokerage statements.

2. **Calendar surface integration**
   - Display payable events with `expected_payment_date` by date.
   - Display payable events with only `expected_payment_month` as month-level estimated text such as `6월 예정` instead of fake dates.
   - Preserve existing record-date and ex-dividend-date calendar basis behavior where implemented; ex-dividend-date views should show only events with explicit `ex_dividend_date` and must not synthesize dates from `record_date`.
   - Show status badges such as estimated, confirmed, or undecided according to existing UI conventions.

3. **Notification creation and display**
   - Map `change_type = 'increase'` to `dividend_increase`.
   - Map `change_type = 'decrease'` to `dividend_decrease`.
   - Map `change_type = 'no_dividend'` to `no_dividend`.
   - Map `change_type = 'special'` and `commemorative` to `special_dividend` or the existing closest notification type, using breakdown metadata for the component amount when available.
   - Include previous and new dividend amounts in notification payload when available.
   - Deduplicate notification rows by disclosure/event/review identity; if notification evaluation is queued, process it through the central `process-jobs` runner.
   - Target only users who hold the affected stock according to existing notification target policy.

4. **User-safety regression checks**
   - Add tests proving `dividend_reviews` are not queried by user-facing routes.
   - Add tests proving rejected reviews do not create notifications.
   - Add tests proving duplicate approval does not duplicate notifications.
   - Add tests for uncertain payment-month display, approved month-only events appearing in the admin-confirmed `payment_year`, approved `annual_total` events being excluded from user-facing totals/calendar, special/commemorative breakdowns not being double-counted, and ex-dividend calendar excluding rows whose `ex_dividend_date` is `null`.

5. **Manual UX verification**
   - Create an approved increase event and verify home recent changes, calendar, and notification surfaces.
   - Create pending and rejected review fixtures and verify they are absent from user-facing pages.
   - Confirm disclaimer text appears in the agreed user-facing locations.

## Test Plan

- Run `npm run lint`.
- Run `npm run typecheck`.
- Run `npm run build`.
- Run `npm run test:unit`.
- Run `npm run test:integration`.
- Run `npx playwright test --workers=1` for affected home, calendar, notification, and admin approval specs.
- Manual verification:
  - Approved increase/decrease/no-dividend/special or commemorative breakdown events create the expected notifications without duplicate cash totals.
  - Pending and rejected reviews remain invisible to regular users.
  - Calendar displays date-known and month-only events correctly, and ex-dividend basis does not show synthesized dates.

## Completion Criteria

- Approved payable disclosure-derived events are visible in home and calendar calculations according to existing app rules, special/commemorative components are counted only through the parent payable event, and `annual_total` reference events are excluded from cash total/payment-calendar aggregation.
- AI review candidates that are not approved remain invisible to regular users.
- Approval-time dividend-change notifications are created for eligible change types and deduplicated.
- Notification targeting follows existing holder-only policy.
- User-facing disclaimer copy is present where users interpret dividend data.

## Excluded From This Phase

- Email or push provider changes beyond existing delivery pipeline.
- New notification categories unrelated to dividend disclosure approval.
- AI parsing accuracy changes.
- Admin UI redesign beyond fixes required for this phase.
