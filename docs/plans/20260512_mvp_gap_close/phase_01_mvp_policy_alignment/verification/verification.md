# Phase 01 Verification: MVP Policy Alignment

## Date
2026-05-12

## Commands Run

### 1. Lint
```
npm run lint
```
**Result:** PASS — 0 errors, 0 warnings.
Note: Fixed a pre-existing lint warning (`buildMockSupabaseNoSession` unused in `review-actions.test.ts`).

### 2. Typecheck
```
npm run typecheck
```
**Result:** PASS — no TypeScript errors.

### 3. Build
```
npm run build
```
**Result:** PASS — all 18 routes compiled successfully.

### 4. Unit Tests
```
npm run test:unit
```
**Result:** Test Files: 5 failed | 40 passed (45). Tests: 46 failed | 557 passed (603).
All 5 failing test files and 46 failing tests are pre-existing on `main` branch (parser-fixtures, stocks/queries). No regressions introduced.

Specifically verified:
```
npx vitest run --reporter=verbose src/features/notifications/constants.test.ts
```
**Result:** 7/7 tests PASS — including the updated single-option assertion.

### 5. Integration Tests
```
RUN_REMOTE_TESTS=1 npm run test:integration
```
**Result:** Test Files: 1 failed | 12 passed (13). Tests: 1 failed | 92 passed (93).
The 1 failing test (`unsupported-stock-rules.test.ts`) is pre-existing on `main` branch.

Specifically:
```
RUN_REMOTE_TESTS=1 npx vitest run --reporter=verbose tests/integration/notifications/
```
**Result:** 5/5 notification integration tests PASS — including "runs evaluation, creates an in-app notification, excludes disabled rules, and blocks duplicates".

## Changes Summary

### 1. Calendar basis-switch removal (`calendar-client.tsx`)
- Removed `calendarBasis` state, `handleCalendarBasisChange` handler, and `initialCalendarBasis` prop.
- Removed the `{/* Calendar basis selector */}` JSX block.
- Hardcoded `p_calendar_basis: "payment_month"` in both `fetchCalendar` and `fetchMonthDetail` RPC calls.
- Removed import of `CALENDAR_BASIS_OPTIONS` and `getCalendarBasisLabel`.
- Updated `CalendarClientProps` interface to remove `initialCalendarBasis`.

### 2. Calendar page call site (`calendar/page.tsx`)
- Removed `calendarBasis` variable.
- Removed `initialCalendarBasis` prop from `<CalendarClient>`.
- Hardcoded `"payment_month"` directly in `getDividendCalendar` call.

### 3. Notification basis restriction (`constants.ts`)
- Changed `NOTIFICATION_RULE_BASIS_OPTIONS` to contain only `{ value: "before_tax_yield", label: "予想配当利回り（税引前）" }`.
- Kept `NOTIFICATION_RULE_BASES` enum intact for Phase 2+ extensibility.

### 4. Action schema fix (`actions.ts`)
- Changed `basis: z.enum(NOTIFICATION_RULE_BASES)` to `basis: z.literal("before_tax_yield")`.
- Removed import of `NOTIFICATION_RULE_BASES`.

### 5. Notification rule UI (`notification-rule/page.tsx`)
- Replaced `<Select>` for basis with a read-only `<p>` showing "予想配当利回り（税引前・MVP固定）".
- Added `<input type="hidden" name="basis" value="before_tax_yield" />` to ensure form still submits the value.
- Removed import of `NOTIFICATION_RULE_BASIS_OPTIONS` and `Select` from notifications constants.

### 6. Constants test update (`constants.test.ts`)
- Updated `NOTIFICATION_RULE_BASIS_OPTIONS` test to assert exactly 1 option with the new label.

### 7. Integration test fix (`notifications-settings.test.ts`)
- Added `current_price: 2000` and `expected_annual_dividend_per_share: 100` to the `beforeAll` stock seeding.
- Before-tax yield = 5.0%, satisfying the `gte 3.5%` rule → `matched: 1`.

### 8. Pre-existing lint fix (`review-actions.test.ts`)
- Removed unused `buildMockSupabaseNoSession` function.

### 9. Phase 06 plan doc
- Already contained the superseded-scope note — verified no changes needed.

### 10. Issue archiving
- Moved 3 issues from `active/` to `archive/`:
  - `20260510-calendar-basis-switch-mvp-scope-mismatch.md`
  - `20260510-notification-rule-basis-mvp-scope-mismatch.md`
  - `20260510-notification-evaluation-yield-mismatch.md`
- Updated `status` to `resolved` and added `resolved: 2026-05-12` in each file.
- Updated `docs/issue/README.md` to reflect the moves.

## Completion Criteria Check

| Criterion | Status |
|-----------|--------|
| `/app/calendar` renders no basis-switch buttons | PASS (JSX block removed) |
| POST `basis=after_tax_yield` returns validation error | PASS (`z.literal("before_tax_yield")` rejects it) |
| `npm run test:integration` exits 0 for notification tests | PASS (5/5 notification tests pass) |
| Three active issues archived | PASS |
| `docs/issue/README.md` updated | PASS |
| `260506_mvp_2nd_dev/phase_06/plan.md` has superseded note | PASS (already present) |
