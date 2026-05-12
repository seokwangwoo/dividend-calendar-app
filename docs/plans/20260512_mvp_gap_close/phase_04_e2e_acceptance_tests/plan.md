# Phase 04: E2E Acceptance Tests

## Goal

Validate all four features introduced by this plan with targeted Playwright tests: absence of calendar basis-switch buttons, single before-tax alert basis, the stock search golden path, and the CSV import golden path including duplicate-skip behavior. Existing E2E specs are updated where Phase 03 changed the CSV import route.

## Prerequisites

- Phase 03 Completion Criteria are met.
- `npm run test:unit` and `npm run build` pass.
- Playwright is installed (`npx playwright install`).
- A Supabase project with seed data is accessible from the E2E environment.
- `tests/e2e/helpers.ts` provides `createConfirmedUser`, `createHolding`, `getStockByTicker`, `cleanupUser`, and related utilities.

## Implementation Scope

### 1. Calendar — no basis-switch test (`tests/e2e/calendar.spec.ts`)

- Add a test case to the existing `calendar.spec.ts` that:
  - Logs in, navigates to `/app/calendar`.
  - Asserts that no button with text `権利確定日` or `除権日` exists in the DOM.
  - Asserts that no button with text `支払月` (the old toggle) exists either, since the MVP locks to payment-month with no toggle at all.

### 2. Notification rule — single basis test (`tests/e2e/alerts.spec.ts`)

- Add a test case to the existing `alerts.spec.ts` (or create `tests/e2e/notification-rule-basis.spec.ts` if the existing spec is too coupled) that:
  - Logs in, navigates to `/app/stocks/<supported-stock-id>/notification-rule`.
  - Asserts that there is no `<select>` or radio group for basis choice.
  - Asserts that the text `予想配当利回り（税引前` is visible (the read-only label).
  - Asserts that `税引後配当利回り` is NOT present on the page.

### 3. Stock search golden path (`tests/e2e/stock-search.spec.ts`)

- Create `tests/e2e/stock-search.spec.ts` with the following test cases:
  - **Search and navigate to detail:** Log in → navigate to `/app/stocks/search` → type `KDDI` → assert the KDDI card appears with yield and market segment → click `[상세 보기]` → assert navigation to `/app/stocks/<id>`.
  - **Portfolio CTA navigates to search:** Log in → navigate to `/app/portfolio` → click `[종목 검색]` → assert navigation to `/app/stocks/search`.
  - **Notifications empty-state CTA:** Log in as a user with no notifications → navigate to `/app/notifications` → assert `[알림을 설정할 종목 찾기]` is visible → click → assert navigation to `/app/stocks/search`.
  - **Unsupported stock shows correct label:** Search for a ticker with `support_status = 'unsupported'` (use a known seeded ticker or the first unsupported result) → assert `配当データ確保中` label is visible on its card.
  - **Portfolio/new pre-fill:** Click `[보유 추가]` on a search result → assert navigation to `/app/portfolio/new?stockId=<id>` with the stock name pre-populated in the form.

### 4. CSV import — updated golden path (`tests/e2e/csv-import.spec.ts`)

- The existing `csv-import.spec.ts` tests click `[CSVインポート]` button on the portfolio page and interact with the inline `CsvImportSection`. After Phase 03, the flow is on a dedicated page (`/app/portfolio/import`).
- Update existing tests to:
  - Navigate to `/app/portfolio` → click `[CSVインポート]` link → assert navigation to `/app/portfolio/import`.
  - Continue the upload → preview → commit flow from the new page.
- Add a new test case for **duplicate skip**:
  - Create a holding for KDDI/nisa via `createHolding` helper.
  - Upload a CSV containing a row for the same KDDI/nisa.
  - Assert the preview shows `重複スキップ` badge on that row.
  - Assert the commit result shows `0件追加, 1件スキップ`.
  - Assert no duplicate holding was created.

## Core Tasks

1. **Calendar no-basis-switch test**
   - Add test to `calendar.spec.ts` asserting `権利確定日` and `除権日` buttons are absent.

2. **Notification single-basis test**
   - Add test to `alerts.spec.ts` or new spec asserting only before-tax label is visible; basis selector is absent.

3. **Stock search spec**
   - Create `tests/e2e/stock-search.spec.ts` with five test cases.
   - Use `getStockByTicker("9433")` helper to get KDDI id for assertions.

4. **CSV import spec update**
   - Update navigation in existing tests to go through `/app/portfolio/import`.
   - Add duplicate-skip test case.

## Test Plan

- Run `npm run lint` — no warnings.
- Run `npm run typecheck` — no errors.
- Run `npm run test:e2e` — all tests in the four target spec files pass.
- Optionally run `npm run test:e2e -- --reporter=html` and review the report for screenshot evidence.

## Completion Criteria

- `calendar.spec.ts` contains a passing test asserting no `権利確定日` / `除権日` buttons on `/app/calendar`.
- `alerts.spec.ts` (or `notification-rule-basis.spec.ts`) contains a passing test asserting single before-tax basis label on the notification-rule page.
- `tests/e2e/stock-search.spec.ts` exists with five passing test cases covering search, portfolio CTA, notifications CTA, unsupported label, and pre-fill.
- `csv-import.spec.ts` is updated to use `/app/portfolio/import` and includes a passing duplicate-skip test.
- `npm run test:e2e` exits 0.

## Excluded From This Phase

- Full regression suite for all existing flows (home, portfolio CRUD, admin pipeline, etc.) — covered by pre-existing E2E specs.
- Performance or load testing.
- Visual regression / screenshot diffing.
- Mobile viewport E2E.
