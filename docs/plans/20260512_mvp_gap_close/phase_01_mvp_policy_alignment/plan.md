# Phase 01: MVP Policy Alignment

## Goal

Bring the running app into compliance with the documented MVP product policy by removing the calendar basis-switch UI, restricting notification rules to before-tax yield only, fixing the failing integration test, and updating the Phase 06 plan document that originally introduced the calendar expansion scope conflict.

## Prerequisites

- `260506_mvp_2nd_dev` phases 01–05 are complete (verified).
- `npm run test:unit` and `npm run build` pass on the current `main` branch.

## Implementation Scope

### 1. Calendar basis-switch removal

- In `src/features/calendar/components/calendar-client.tsx`, remove the `{/* Calendar basis selector */}` block that renders `CALENDAR_BASIS_OPTIONS.map(...)` buttons.
- Remove the `calendarBasis` state, `handleCalendarBasisChange` handler, and the `initialCalendarBasis` prop entirely.
- Hardcode `p_calendar_basis: "payment_month"` in all `fetchCalendar` / RPC call sites within this component.
- Remove `initialCalendarBasis` from the props of `CalendarClient` and its call site in `src/app/app/calendar/page.tsx`.
- Do **not** remove `CALENDAR_BASIS_OPTIONS`, `CalendarBasis` type, or `getCalendarBasisLabel` from `src/features/calendar/basis.ts` — these are used by the RPC layer and may be needed in Phase 2+ UI.
- Update any unit tests in `src/features/calendar/basis.test.ts` that assert all three options appear in the rendered UI; update expectations to assert the buttons are absent.

### 2. Notification rule basis restriction

- In `src/features/notifications/constants.ts`, change `NOTIFICATION_RULE_BASIS_OPTIONS` to contain only `{ value: "before_tax_yield", label: "予想配当利回り（税引前）" }`. Remove the `after_tax_yield` entry.
- Do **not** remove `after_tax_yield` from `NOTIFICATION_RULE_BASES` — keep the type-level enum intact for Phase 2 extensibility.
- In `src/features/notifications/actions.ts`, change `ruleSchema` field `basis` from `z.enum(NOTIFICATION_RULE_BASES)` to `z.literal("before_tax_yield")`. The server action must now reject any attempt to save `after_tax_yield`.
- In `src/app/app/stocks/[stockId]/notification-rule/page.tsx`, remove the `<Select>` or radio for basis if it is rendered from `NOTIFICATION_RULE_BASIS_OPTIONS`. Replace with a read-only label showing "予想配当利回り（税引前・MVP固定）". The hidden input must still pass `basis = "before_tax_yield"` in the form.
- Update `src/features/notifications/constants.test.ts` if it asserts two options; update to assert exactly one option.

### 3. Integration test fix

- In `tests/integration/notifications/notifications-settings.test.ts`, inside the `beforeAll` block, after fetching the test stock via `getTestStocks()`, add an explicit DB update that sets:
  - `current_price` to a value that produces a before-tax yield ≥ 3.5 % given the `expected_annual_dividend_per_share` also being set.
  - `expected_annual_dividend_per_share` to a concrete positive value.
  - `price_updated_at` to `new Date().toISOString()`.
- Recommended concrete values: `expected_annual_dividend_per_share = 100`, `current_price = 2000` → yield = 5.0 %, satisfying `gte 3.5 %`.
- Confirm the test passes with `RUN_REMOTE_TESTS=1 npm run test:integration`.

### 4. Plan document update

- In `docs/plans/260506_mvp_2nd_dev/phase_06_csv_import_and_calendar_expansion/plan.md`, add a note at the top of the file stating that the calendar basis expansion scope (record-date and ex-dividend-date UI) has been removed from this phase and is handled in `docs/plans/20260512_mvp_gap_close`. Remove or strike through bullets 4 and 5 of the Core Tasks that add the basis parameter to the calendar UI.
- Do not change the CSV import content of Phase 06; that scope is superseded by Phase 03 of this plan.

### 5. Issue archiving

- Move the following files from `docs/issue/active/` to `docs/issue/archive/`:
  - `20260510-calendar-basis-switch-mvp-scope-mismatch.md`
  - `20260510-notification-rule-basis-mvp-scope-mismatch.md`
  - `20260510-notification-evaluation-yield-mismatch.md`
- Update `docs/issue/README.md` to reflect the moves.
- Leave `20260510-missing-stock-search-route-for-alert-entry.md` in `active/`; it is resolved in Phase 02.

## Core Tasks

1. **Remove calendar basis switch**
   - Delete the calendar basis selector JSX block from `calendar-client.tsx`.
   - Remove `calendarBasis` state, handler, and prop.
   - Hardcode `p_calendar_basis: "payment_month"` in all RPC call sites.
   - Update `calendar/page.tsx` call site to drop the prop.

2. **Restrict notification basis to before-tax**
   - Edit `NOTIFICATION_RULE_BASIS_OPTIONS` in `constants.ts` to one entry.
   - Edit `ruleSchema` in `actions.ts` to `z.literal("before_tax_yield")`.
   - Replace basis selector UI in `notification-rule/page.tsx` with a read-only label.

3. **Fix integration test**
   - Add explicit stock price and dividend seeding in `notifications-settings.test.ts` `beforeAll`.
   - Run and confirm all integration tests pass.

4. **Update Phase 06 plan doc**
   - Add superseded-scope note to `260506_mvp_2nd_dev/phase_06/plan.md`.

5. **Archive resolved issues**
   - Move three issue files to `docs/issue/archive/`.
   - Update `docs/issue/README.md`.

## Test Plan

- Run `npm run lint` — no warnings.
- Run `npm run typecheck` — no errors.
- Run `npm run build` — succeeds.
- Run `npm run test:unit` — all tests pass; verify `constants.test.ts` passes with single-option assertion.
- Run `RUN_REMOTE_TESTS=1 npm run test:integration` — all tests pass including notification evaluation.
- Manual: navigate to `/app/calendar` and confirm no basis-switch buttons appear.
- Manual: navigate to `/app/stocks/<any-supported-stockId>/notification-rule` and confirm only one basis option is visible (read-only label, not a select).

## Completion Criteria

- `/app/calendar` renders no `権利確定日` / `除権日` buttons; only payment-month data is displayed.
- Attempting to POST `basis=after_tax_yield` to the notification rule action returns a validation error.
- `npm run test:integration` exits 0 with notification evaluation tests passing.
- Three active issues are archived; `docs/issue/README.md` updated.
- `260506_mvp_2nd_dev/phase_06/plan.md` contains the superseded-scope note.

## Excluded From This Phase

- Record-date and ex-dividend-date calendar UI (Phase 2+ feature; internal RPC types are kept).
- `after_tax_yield` alert UI and evaluation path (Phase 2+ feature; type-level enum is kept).
- `/app/stocks/search` route (Phase 02).
- CSV import (Phase 03).
- E2E tests (Phase 04).
